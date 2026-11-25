import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const statusSource = readFileSync(
  path.join(root, 'components/editor/canvas-admin/status-tab.tsx'),
  'utf8',
)
const panelSource = readFileSync(
  path.join(root, 'components/editor/canvas-admin/canvas-admin-panel.tsx'),
  'utf8',
)

describe('canvas status tab wiring', () => {
  it('polls the status route every five seconds while mounted', () => {
    expect(statusSource).toContain("import useSWR from 'swr'")
    expect(statusSource).toContain('refreshInterval: STATUS_POLL_MS')
    expect(statusSource).toContain('/api/canvas/status')
  })

  it('uses the pure classifier for every row', () => {
    expect(statusSource).toContain("from '@/lib/canvas/problems'")
    expect(statusSource).toContain('canvasProblems(row, now, STATUS_POLL_MS)')
  })

  it('renders every required column', () => {
    for (const heading of ['Marker', 'Frame', 'Last seen', 'Delivered', 'Rendering', 'Clock', 'Viewport', 'FPS', 'Problems']) {
      expect(statusSource).toContain(`>${heading}</th>`)
    }
  })

  it('adds Status as the third admin tab', () => {
    expect(panelSource).toContain("type CanvasAdminTab = 'layouts' | 'albums' | 'status'")
    expect(panelSource).toContain("{ id: 'status', label: 'Status' }")
    expect(panelSource).toContain('<StatusTab />')
  })

  it('keeps the Phase 2 tabs mounted', () => {
    expect(panelSource).toContain('<LayoutsTab />')
    expect(panelSource).toContain('<AlbumsTab />')
  })
})
