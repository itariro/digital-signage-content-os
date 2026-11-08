'use client'

import { useState } from 'react'
import { AuditTab } from './frame-admin/audit-tab'
import { ConflictsTab } from './frame-admin/conflicts-tab'
import { FramesTab } from './frame-admin/frames-tab'
import { EditorButton } from './controls'

export type AdminTab = 'frames' | 'conflicts' | 'audit'

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'frames', label: 'Frames' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'audit', label: 'Audit' },
]

export function FrameAdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('frames')

  return (
    <div className="flex min-h-full flex-col">
      <div role="group" aria-label="Frame administration sections" className="flex shrink-0 border-b border-border">
        {TABS.map((tab) => (
          <EditorButton
            key={tab.id}
            type="button"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            variant="quiet"
            className="min-h-12 flex-1 shrink rounded-none border-b-2 border-transparent px-2 py-3 aria-pressed:border-primary aria-pressed:text-foreground"
          >
            {tab.label}
          </EditorButton>
        ))}
      </div>
      <div className="min-h-0 flex-1 p-3">
        {activeTab === 'frames' && <FramesTab />}
        {activeTab === 'conflicts' && <ConflictsTab />}
        {activeTab === 'audit' && <AuditTab />}
      </div>
    </div>
  )
}
