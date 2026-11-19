import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRAME_HEIGHT, FRAME_WIDTH } from '@/lib/types'

const root = path.resolve(__dirname, '..')
const source = readFileSync(path.join(root, 'components/notifications/frame-notice-layer.tsx'), 'utf8')
const frameDisplay = readFileSync(path.join(root, 'components/frame/frame-display.tsx'), 'utf8')

describe('frame notice scale', () => {
  it('renders the notice inside the frame scene on the kiosk', () => {
    // FrameScene scales a 1080x1920 space to the viewport. A notice rendered
    // as its sibling keeps CSS pixels and stays tiny on a 1440x2560 kiosk.
    expect(frameDisplay).toMatch(/<FrameScene[\s\S]*?<FrameNoticeLayer \/>[\s\S]*?<\/FrameScene>/)
  })

  it('sizes the notice against the frame, never the browser viewport', () => {
    // The notice lives inside FrameScene's scaled 1080x1920 space. Viewport
    // units would follow the browser window instead of the frame and drift on
    // the editor canvas.
    expect(source).not.toMatch(/\b\d+(\.\d+)?vw\b/)
    expect(source).not.toMatch(/\b\d+(\.\d+)?vh\b/)
    expect(source).toContain("'--frame-w': `${FRAME_WIDTH}px`")
    expect(source).toContain("'--card-w': 'calc(var(--frame-w) * 0.833)'")
    expect(source).toContain("'--u': 'calc(var(--frame-w) / 1080)'")
  })

  it('renders the card at a signage-readable share of the frame', () => {
    const cardShare = Number(source.match(/var\(--frame-w\) \* (0\.\d+)/)?.[1])
    expect(cardShare).toBeGreaterThanOrEqual(0.8)
    expect(cardShare).toBeLessThanOrEqual(0.9)

    // 58/1080 of the frame width, i.e. ~4.5% of the frame diagonal at 9:16.
    const titleSize = Number(source.match(/titleSize: (\d+)/)?.[1])
    const bodySize = Number(source.match(/bodySize: (\d+)/)?.[1])
    expect(titleSize / FRAME_WIDTH).toBeGreaterThanOrEqual(0.05)
    expect(bodySize / FRAME_WIDTH).toBeGreaterThanOrEqual(0.025)
    expect(titleSize).toBeLessThan(FRAME_HEIGHT * 0.05)
  })

  it('retunes every notification layout through the shared tokens', () => {
    for (const layout of ['warning', 'calendar', 'reminder', 'system', 'custom']) {
      expect(source).toMatch(new RegExp(`^\\s*${layout}: \\{`, 'm'))
    }
    expect(source).toContain('const LAYOUTS: Record<Layout, LayoutSpec>')
    expect(source).toContain("const FONT = \"ui-sans-serif, system-ui")
  })

  it('does not depend on a webfont the frame never loads', () => {
    expect(source).not.toContain('Montserrat')
  })
})
