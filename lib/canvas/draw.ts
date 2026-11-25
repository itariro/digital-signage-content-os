export type DrawRect = { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number; radius?: number; opacity?: number }
export type DrawCircle = { kind: 'circle'; x: number; y: number; r: number; fill?: string; stroke?: string; lineWidth?: number; opacity?: number }
export type DrawLine = { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number; dash?: number[]; opacity?: number }
export type DrawText = { kind: 'text'; text: string; x: number; y: number; fontFamily: string; fontSize: number; color: string; align?: CanvasTextAlign; baseline?: CanvasTextBaseline; rotation?: number; opacity?: number }
export type DrawImage = { kind: 'image'; src: string; x: number; y: number; w: number; h: number; fit?: 'fill' | 'contain' | 'cover'; offsetX?: number; offsetY?: number; opacity?: number }
export type DrawGradient = { kind: 'gradient'; x: number; y: number; w: number; h: number; colors: string[]; angleDeg: number; opacity?: number }

export type DrawCommand = DrawRect | DrawCircle | DrawLine | DrawText | DrawImage | DrawGradient

export type ExecuteOptions = {
  slot: { x: number; y: number; w: number; h: number }
  dpr?: number
  reducedMotion?: boolean
}

export function drawCommands(...commands: DrawCommand[]): DrawCommand[] {
  return commands
}

function withOpacity(ctx: CanvasRenderingContext2D, opacity: number | undefined, paint: () => void): void {
  if (opacity === undefined || opacity >= 1) {
    paint()
    return
  }
  ctx.save()
  ctx.globalAlpha = Math.max(0, opacity)
  paint()
  ctx.restore()
}

function fitted(srcW: number, srcH: number, rect: { x: number; y: number; w: number; h: number }, fit: 'fill' | 'contain' | 'cover'): { x: number; y: number; w: number; h: number } {
  if (fit === 'fill' || !srcW || !srcH) return rect
  const scale = fit === 'contain'
    ? Math.min(rect.w / srcW, rect.h / srcH)
    : Math.max(rect.w / srcW, rect.h / srcH)
  const w = srcW * scale
  const h = srcH * scale
  return { x: rect.x + (rect.w - w) / 2, y: rect.y + (rect.h - h) / 2, w, h }
}

type PendingDraw = {
  ctx: CanvasRenderingContext2D
  commands: readonly DrawCommand[]
  options: ExecuteOptions
}

/** One Image per src for the whole page, so gallery loads survive scene changes. */
const imageCache = new Map<string, HTMLImageElement>()
const pendingBySrc = new Map<string, Map<CanvasRenderingContext2D, PendingDraw>>()

function cachedImage(src: string): HTMLImageElement {
  const existing = imageCache.get(src)
  if (existing) return existing
  const image = new Image()
  image.onload = () => {
    const pending = pendingBySrc.get(src)
    pendingBySrc.delete(src)
    if (!pending) return
    for (const request of pending.values()) {
      executeDrawCommands(request.ctx, request.commands, request.options)
    }
  }
  image.src = src
  imageCache.set(src, image)
  return image
}

function rememberPending(src: string, ctx: CanvasRenderingContext2D, commands: readonly DrawCommand[], options: ExecuteOptions): void {
  let pending = pendingBySrc.get(src)
  if (!pending) {
    pending = new Map()
    pendingBySrc.set(src, pending)
  }
  pending.set(ctx, { ctx, commands, options })
}

export function executeDrawCommands(
  ctx: CanvasRenderingContext2D,
  commands: readonly DrawCommand[],
  options: ExecuteOptions,
): void {
  const dpr = options.dpr && options.dpr > 0 ? options.dpr : 1
  const width = Math.max(1, Math.round(options.slot.w * dpr))
  const height = Math.max(1, Math.round(options.slot.h * dpr))
  if (ctx.canvas.width !== width) ctx.canvas.width = width
  if (ctx.canvas.height !== height) ctx.canvas.height = height
  const tx = options.slot.x === 0 ? 0 : -options.slot.x * dpr
  const ty = options.slot.y === 0 ? 0 : -options.slot.y * dpr
  ctx.setTransform(dpr, 0, 0, dpr, tx, ty)
  ctx.clearRect(options.slot.x, options.slot.y, options.slot.w, options.slot.h)

  for (const command of commands) {
    switch (command.kind) {
      case 'rect':
        withOpacity(ctx, command.opacity, () => {
          if (command.fill) {
            ctx.fillStyle = command.fill
            ctx.fillRect(command.x, command.y, command.w, command.h)
          }
          if (command.stroke) {
            ctx.strokeStyle = command.stroke
            ctx.lineWidth = command.lineWidth ?? 1
            ctx.strokeRect(command.x, command.y, command.w, command.h)
          }
        })
        break
      case 'circle':
        withOpacity(ctx, command.opacity, () => {
          ctx.beginPath()
          ctx.arc(command.x, command.y, Math.max(0, command.r), 0, Math.PI * 2)
          if (command.fill) {
            ctx.fillStyle = command.fill
            ctx.fill()
          }
          if (command.stroke) {
            ctx.strokeStyle = command.stroke
            ctx.lineWidth = command.lineWidth ?? 1
            ctx.stroke()
          }
        })
        break
      case 'line':
        withOpacity(ctx, command.opacity, () => {
          ctx.beginPath()
          ctx.strokeStyle = command.color
          ctx.lineWidth = command.width
          ctx.setLineDash(command.dash ?? [])
          ctx.moveTo(command.x1, command.y1)
          ctx.lineTo(command.x2, command.y2)
          ctx.stroke()
          ctx.setLineDash([])
        })
        break
      case 'text':
        withOpacity(ctx, command.opacity, () => {
          ctx.save()
          if (command.rotation) {
            ctx.translate(command.x, command.y)
            ctx.rotate((command.rotation * Math.PI) / 180)
            ctx.translate(-command.x, -command.y)
          }
          ctx.fillStyle = command.color
          ctx.font = `${command.fontSize}px ${command.fontFamily}`
          ctx.textAlign = command.align ?? 'left'
          ctx.textBaseline = command.baseline ?? 'alphabetic'
          ctx.fillText(command.text, command.x, command.y)
          ctx.restore()
        })
        break
      case 'gradient': {
        const angle = (command.angleDeg * Math.PI) / 180
        const x2 = command.x + Math.cos(angle) * command.w
        const y2 = command.y + Math.sin(angle) * command.h
        const gradient = ctx.createLinearGradient(command.x, command.y, x2, y2)
        command.colors.forEach((color, index) => {
          gradient.addColorStop(command.colors.length === 1 ? 0 : index / (command.colors.length - 1), color)
        })
        withOpacity(ctx, command.opacity, () => {
          ctx.fillStyle = gradient
          ctx.fillRect(command.x, command.y, command.w, command.h)
        })
        break
      }
      case 'image': {
        const image = cachedImage(command.src)
        if (!image.complete || !image.naturalWidth) {
          rememberPending(command.src, ctx, commands, options)
          break
        }
        const box = fitted(image.naturalWidth, image.naturalHeight, {
          x: command.x + (command.offsetX ?? 0),
          y: command.y + (command.offsetY ?? 0),
          w: command.w,
          h: command.h,
        }, command.fit ?? 'contain')
        withOpacity(ctx, command.opacity, () => ctx.drawImage(image, box.x, box.y, box.w, box.h))
        break
      }
    }
  }
}
