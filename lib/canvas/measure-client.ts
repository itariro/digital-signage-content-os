'use client'

import { fontStack } from '@/lib/fonts'
import type { MarqueeConfig, MarqueeStrip } from '@/lib/types'

const MAX_SEGMENTS = 400

export function measureMarquee(config: MarqueeConfig): MarqueeStrip {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  const style = config.style ?? {}
  ctx.font = `${style.fontWeight ?? 400} ${config.fontSize}px ${fontStack(style.fontFamily ?? '')}`

  const segments: MarqueeStrip['segments'] = []
  let at = 0
  for (let index = 0; index < config.lines.length; index += 1) {
    const text = config.lines[index] ?? ''
    const width = Math.max(1, ctx.measureText(text).width)
    if (segments.length >= MAX_SEGMENTS) break
    segments.push({ text, at, w: width })
    at += width
    if (index < config.lines.length - 1) {
      const separatorWidth = Math.max(1, ctx.measureText(config.separator).width)
      if (segments.length < MAX_SEGMENTS) segments.push({ text: config.separator, at, w: separatorWidth })
      at += separatorWidth
    }
  }

  return {
    lengthPx: Math.max(1, at),
    crossPx: Math.max(1, config.lineHeight, config.fontSize * 1.2),
    segments,
  }
}

/** Measure on save in the console. Block layout stores no strip; the server estimates it. */
export function withMeasuredStrip(config: MarqueeConfig): MarqueeConfig {
  if (config.layout === 'block') {
    const { strip: _ignored, ...rest } = config
    return rest
  }
  return { ...config, strip: measureMarquee(config) }
}
