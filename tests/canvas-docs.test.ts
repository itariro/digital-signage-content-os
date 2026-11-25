import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CANVAS_PROBLEM_LABELS } from '@/lib/canvas/problems'

const root = path.resolve(__dirname, '..')
const canvasGuide = readFileSync(path.join(root, 'docs/canvas.md'), 'utf8')
const readme = readFileSync(path.join(root, 'README.md'), 'utf8')
const operations = readFileSync(path.join(root, 'docs/operations.md'), 'utf8')
const kioskCli = readFileSync(path.join(root, 'docs/kiosk-cli.md'), 'utf8')

describe('canvas operator documentation', () => {
  it('covers setup, NTP, calibration and the deployment lifecycle', () => {
    for (const heading of [
      '## Setup',
      '## Clock setup',
      '## Calibration',
      '## Deploy, update and release',
      '## Troubleshooting',
      '## Environment',
    ]) {
      expect(canvasGuide).toContain(heading)
    }
  })

  it('explains every problem label', () => {
    for (const label of CANVAS_PROBLEM_LABELS) expect(canvasGuide).toContain(label)
  })

  it('documents the fast poll overrides and regular sync fallback', () => {
    for (const variable of ['CANVAS_POLL_ACTIVE_SECONDS', 'CANVAS_POLL_IDLE_SECONDS', 'SYNC_INTERVAL_MINUTES']) {
      expect(canvasGuide).toContain(variable)
      expect(operations).toContain(variable)
      expect(kioskCli).toContain(variable)
    }
  })

  it('links the feature from the README', () => {
    expect(readme).toContain('### Multi-frame canvas')
    expect(readme).toContain('docs/canvas.md')
  })

  it('adds console operations guidance', () => {
    expect(operations).toContain('## Multi-frame canvas')
    expect(operations).toContain('GET /api/canvas/status')
  })

  it('uses plain prose in the canvas guide', () => {
    expect(canvasGuide).not.toContain('—')
  })

  it('does not promise a fixed lead time for the first deploy', () => {
    expect(canvasGuide).not.toContain('waits about 15 seconds')
  })

  it('does not promise a clock sample before the first report', () => {
    expect(canvasGuide).not.toContain('reports poor clock quality')
  })

  it('does not promise a missing slot row after revoke', () => {
    expect(operations).not.toContain('marks the slot as missing')
  })
})
