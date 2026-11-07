import type { TextFill, TextStrokeCfg, LightingShadow, WidgetStyle } from './types'
import { hexToRgba } from './frame-utils'

export function normalizeWidgetStyle(s: WidgetStyle): WidgetStyle {
  if (!s.fill) s.fill = { kind: 'solid', color: s.color }
  if (!s.textStrokeCfg) s.textStrokeCfg = { enabled: s.textStroke > 0, color: s.stroke, thickness: s.textStroke || 2, opacity: 100, align: 'outside' }
  if (!s.lightingShadow) s.lightingShadow = s.shadow ? { preset: 'drop', distance: 6, blur: 14, opacity: 35, angle: 90, color: '#000000' } : { preset: 'none', distance: 0, blur: 0, opacity: 0, angle: 0, color: '#000000' }
  // If fill is solid but color changed, keep sync
  if (s.fill.kind === 'solid' && s.fill.color !== s.color) s.color = s.fill.color
  return s
}
export function fillCss(fill: TextFill): React.CSSProperties {
  if (fill.kind === 'solid') return { backgroundImage: 'none', color: fill.color }
  if (fill.kind === 'gradient') {
    const g = fill.gradient
    const stops = [...g.stops].sort((a, b) => a.position - b.position).map(s => `${s.color} ${s.position}%`).join(', ')
    const bg = g.type === 'linear' ? `linear-gradient(${g.angle}deg, ${stops})` : `radial-gradient(closest-side, ${stops})`
    return { backgroundImage: bg, backgroundClip: 'text', WebkitBackgroundClip: 'text', webkitBackgroundClip: 'text', color: 'transparent' } as React.CSSProperties
  }
  const bgsize = fill.image.fit === 'cover' ? 'cover' : fill.image.fit === 'contain' ? 'contain' : 'repeat'
  return { backgroundImage: `url("${fill.image.url}")`, backgroundSize: `${bgsize}`, backgroundPosition: `${fill.image.position}% center`, backgroundClip: 'text', WebkitBackgroundClip: 'text', webkitBackgroundClip: 'text', color: 'transparent' } as React.CSSProperties
}
export function strokeCss(cfg: TextStrokeCfg): React.CSSProperties {
  if (!cfg.enabled || cfg.thickness === 0) return {}
  return { WebkitTextStroke: `${cfg.thickness}px ${hexToRgba(cfg.color, cfg.opacity / 100)}`, paintOrder: cfg.align === 'inside' ? 'stroke fill' : 'fill stroke' } as React.CSSProperties
}
export function shadowCss(sh: LightingShadow): React.CSSProperties {
  if (sh.preset === 'none') return {}
  const rad = (sh.angle * Math.PI) / 180
  const dx = Math.round(Math.cos(rad) * sh.distance)
  const dy = Math.round(Math.sin(rad) * sh.distance)
  const col = hexToRgba(sh.color, sh.opacity / 100)
  if (sh.preset === 'long') {
    const steps = sh.steps ?? 40
    const list = Array.from({ length: steps }, (_, i) => `${dx * (i + 1) / steps}px ${dy * (i + 1) / steps}px 0 ${col}`).join(', ')
    return { textShadow: list }
  }
  if (sh.preset === 'curved') {
    return { filter: `drop-shadow(${dx}px ${dy}px ${sh.blur}px ${col}) drop-shadow(0 ${(sh.spread || 10)}px ${(sh.blur * 1.4)}px ${col})` }
  }
  if (sh.preset === 'contact') {
    return { textShadow: `0 ${(sh.distance || 4)}px ${(sh.spread || 8)}px ${col}` }
  }
  return { textShadow: `${dx}px ${dy}px ${sh.blur}px ${col}` }
}
