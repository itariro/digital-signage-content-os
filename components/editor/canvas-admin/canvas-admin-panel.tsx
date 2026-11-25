'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AlbumsTab } from './albums-tab'
import { LayoutsTab } from './layouts-tab'
import { StatusTab } from './status-tab'

export type CanvasAdminTab = 'layouts' | 'albums' | 'status'

const TABS: { id: CanvasAdminTab; label: string }[] = [
  { id: 'layouts', label: 'Layouts' },
  { id: 'albums', label: 'Albums' },
  { id: 'status', label: 'Status' },
]

export function CanvasAdminPanel() {
  const [activeTab, setActiveTab] = useState<CanvasAdminTab>('layouts')

  return (
    <div className="flex min-h-full flex-col">
      <div role="group" aria-label="Canvas administration sections" className="flex shrink-0 border-b border-border">
        {TABS.map((tab) => (
          <Button
            key={tab.id}
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className="flex-1 shrink rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground aria-pressed:border-primary aria-pressed:text-foreground"
          >
            {tab.label}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {activeTab === 'layouts' && <LayoutsTab />}
        {activeTab === 'albums' && <AlbumsTab />}
        {activeTab === 'status' && <StatusTab />}
      </div>
    </div>
  )
}
