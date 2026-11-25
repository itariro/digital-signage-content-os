'use client'

import { useState } from 'react'
import { EditorButton } from '@/components/editor/controls'
import { AlbumsTab } from './albums-tab'
import { LayoutsTab } from './layouts-tab'

type Tab = 'layouts' | 'albums'

const TABS: { id: Tab; label: string }[] = [
  { id: 'layouts', label: 'Layouts' },
  { id: 'albums', label: 'Albums' },
]

export function CanvasAdminPanel() {
  const [tab, setTab] = useState<Tab>('layouts')

  return (
    <div className="flex min-h-full flex-col">
      <div role="group" aria-label="Canvas sections" className="flex shrink-0 border-b border-border">
        {TABS.map((entry) => (
          <EditorButton
            key={entry.id}
            type="button"
            aria-pressed={tab === entry.id}
            onClick={() => setTab(entry.id)}
            variant="quiet"
            className="min-h-12 flex-1 shrink rounded-none border-b-2 border-transparent px-2 py-3 aria-pressed:border-primary aria-pressed:text-foreground"
          >
            {entry.label}
          </EditorButton>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'layouts' ? <LayoutsTab /> : <AlbumsTab />}
      </div>
    </div>
  )
}
