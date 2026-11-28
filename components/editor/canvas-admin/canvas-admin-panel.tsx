'use client'

import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <Tabs
      value={activeTab}
      onValueChange={(value) => setActiveTab(value as CanvasAdminTab)}
      className="flex min-h-full flex-col gap-0"
    >
      <TabsList variant="line" aria-label="Canvas administration sections" className="flex group-data-horizontal/tabs:h-auto w-full shrink-0 rounded-none border-b border-border">
        {TABS.map((tab) => (
          <TabsTrigger key={tab.id} value={tab.id} className="min-h-12 flex-1 rounded-none">
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <div className="min-h-0 flex-1 p-4">
        <TabsContent value="layouts" className="mt-0 focus-visible:outline-none">
          <LayoutsTab />
        </TabsContent>
        <TabsContent value="albums" className="mt-0 focus-visible:outline-none">
          <AlbumsTab />
        </TabsContent>
        <TabsContent value="status" className="mt-0 focus-visible:outline-none">
          <StatusTab />
        </TabsContent>
      </div>
    </Tabs>
  )
}
