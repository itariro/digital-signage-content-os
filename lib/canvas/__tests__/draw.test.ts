import { describe, expect, it, vi } from 'vitest'
import { drawCommands, executeDrawCommands } from '@/lib/canvas/draw'

describe('drawCommands', () => {
  it('returns the exact command list a scene emitted', () => {
    const rect = { kind: 'rect' as const, x: 1, y: 2, w: 3, h: 4, fill: '#ffffff' }
    expect(drawCommands(rect)).toEqual([rect])
  })
})

function ctxStub(width = 1080, height = 1920) {
  return {
    canvas: { width, height },
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    setLineDash: vi.fn(),
    fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    drawImage: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
  }
}

describe('executeDrawCommands', () => {
  it('translates canvas coordinates into the slot viewport', () => {
    const ctx = ctxStub()
    const { setTransform, fillRect } = ctx
    const commands = drawCommands(
      { kind: 'rect', x: 1100, y: 20, w: 50, h: 50, fill: '#ffffff' },
      { kind: 'text', text: 'WALL', x: 1120, y: 80, fontFamily: 'mono', fontSize: 40, color: '#ffffff' },
    )
    executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, commands, {
      slot: { x: 1080, y: 0, w: 1080, h: 1920 },
      dpr: 1,
    })
    expect(setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0)
    expect(fillRect).toHaveBeenCalledWith(1100, 20, 50, 50)
  })

  it('draws an image after it loads and reuses one Image per src', () => {
    const created: FakeImage[] = []
    class FakeImage {
      complete = false
      naturalWidth = 0
      naturalHeight = 0
      onload: (() => void) | null = null
      constructor() { created.push(this) }
      set src(_value: string) { /* load is driven manually below */ }
      load() {
        this.complete = true
        this.naturalWidth = 200
        this.naturalHeight = 100
        this.onload?.()
      }
    }
    vi.stubGlobal('Image', FakeImage)
    try {
      const src = `canvas-asset:${'c'.repeat(64)}`
      const command = { kind: 'image' as const, src, x: 0, y: 0, w: 200, h: 100 }
      const ctx = ctxStub()
      executeDrawCommands(ctx as unknown as CanvasRenderingContext2D, [command], {
        slot: { x: 0, y: 0, w: 1080, h: 1920 },
      })
      expect(ctx.drawImage).not.toHaveBeenCalled()
      created[0].load()
      expect(ctx.drawImage).toHaveBeenCalledTimes(1)
      expect(ctx.drawImage).toHaveBeenCalledWith(created[0], 0, 0, 200, 100)

      const second = ctxStub()
      executeDrawCommands(second as unknown as CanvasRenderingContext2D, [command], {
        slot: { x: 0, y: 0, w: 1080, h: 1920 },
      })
      expect(created).toHaveLength(1)
      created[0].load()
      expect(second.drawImage).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
