import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const panelSource = readFileSync(path.join(root, 'components/editor/frame-admin-panel.tsx'), 'utf8')
const editorSource = readFileSync(path.join(root, 'components/editor/editor.tsx'), 'utf8')
const framesSource = readFileSync(path.join(root, 'components/editor/frame-admin/frames-tab.tsx'), 'utf8')
const conflictsSource = readFileSync(path.join(root, 'components/editor/frame-admin/conflicts-tab.tsx'), 'utf8')
const auditSource = readFileSync(path.join(root, 'components/editor/frame-admin/audit-tab.tsx'), 'utf8')

describe('frame administration panel', () => {
  it('provides three keyboard-operable buttons and mounts only the selected tab', () => {
    expect(panelSource).toContain("export type AdminTab = 'frames' | 'conflicts' | 'audit'")
    expect(panelSource).toMatch(/id: 'frames'[\s\S]*id: 'conflicts'[\s\S]*id: 'audit'/)
    expect(panelSource).toContain('role="group"')
    expect(panelSource).toContain('aria-pressed={activeTab === tab.id}')
    expect(panelSource).toContain('type="button"')
    expect(panelSource).toContain('onClick={() => setActiveTab(tab.id)}')
    expect(panelSource).toContain("{activeTab === 'frames' && <FramesTab />}")
    expect(panelSource).toContain("{activeTab === 'conflicts' && <ConflictsTab />}")
    expect(panelSource).toContain("{activeTab === 'audit' && <AuditTab />}")
  })

  it('mounts the panel only while the authorized drawer is active', () => {
    expect(editorSource).toContain(
      "{canManageFrames && activeDrawer === 'frames' && <FrameAdminPanel />}",
    )
  })

  it('uses the protected frame endpoints and validates one-time enrollment results', () => {
    expect(framesSource).toContain("fetch('/api/instances'")
    expect(framesSource).toContain('/rotate')
    expect(framesSource).toContain('kiosk-ctl enroll')
    expect(framesSource).toContain('isInstanceList')
    expect(framesSource).toContain('isEnrollmentResult')
    expect(framesSource).toContain('setIssued(null)')
    expect(framesSource).toContain('unauthorized')
    expect(framesSource).toContain('expired')
  })

  it('uses the conflict endpoint, validates responses, and refreshes after a successful action', () => {
    expect(conflictsSource).toContain("fetch('/api/sync/conflicts'")
    expect(conflictsSource).toContain('/resolve')
    expect(conflictsSource).toContain('isConflictList')
    expect(conflictsSource).toContain('await loadConflicts()')
  })

  it('uses the audit endpoint and validates response rows', () => {
    expect(auditSource).toContain("fetch('/api/audit'")
    expect(auditSource).toContain('isAuditList')
  })

  it('gives each tab explicit loading, empty, request-error, and unauthorized states', () => {
    for (const source of [framesSource, conflictsSource, auditSource]) {
      expect(source).toContain('Loading')
      expect(source).toMatch(/empty|No .*?(frames|conflicts|audit)/i)
      expect(source).toMatch(/request error|Unable to load|Could not load/i)
      expect(source).toMatch(/unauthorized|session has expired|not authorized/i)
    }
  })
})
