'use client'

import { useState } from 'react'
import { AuditTab } from './frame-admin/audit-tab'
import { ConflictsTab } from './frame-admin/conflicts-tab'
import { FramesTab } from './frame-admin/frames-tab'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export type AdminTab = 'frames' | 'conflicts' | 'audit'

const TABS: { id: AdminTab; label: string }[] = [
  { id: 'frames', label: 'Frames' },
  { id: 'conflicts', label: 'Conflicts' },
  { id: 'audit', label: 'Audit' },
]

export function FrameAdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('frames')

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as AdminTab)}
      className="flex min-h-full flex-col gap-0"
    >
      <TabsList variant="line" aria-label="Frame administration sections" className="flex w-full shrink-0 rounded-none border-b border-border">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="min-h-12 flex-1 rounded-none">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="min-h-0 flex-1 p-3">
        <TabsContent value="frames"><FramesTab /></TabsContent>
        <TabsContent value="conflicts"><ConflictsTab /></TabsContent>
        <TabsContent value="audit"><AuditTab /></TabsContent>
      </div>
    </Tabs>
  )
}
