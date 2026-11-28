'use client'

import { Plus, X } from 'lucide-react'
import type { MapArtLocation } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'

export function RecentLocationsTable({ locations, busy, onUse, onRemove }: {
  locations: MapArtLocation[]
  busy: boolean
  onUse: (city: MapArtLocation) => void
  onRemove: (city: MapArtLocation) => void
}) {
  if (!locations.length) {
    return (
      <Empty className="rounded-md border border-dashed p-4">
        <EmptyDescription className="text-xs">Locations you generate will appear here.</EmptyDescription>
      </Empty>
    )
  }

  return (
    <ul className="divide-y rounded-md border">
      {locations.map((city) => (
        <li key={city.id} className="group flex items-center gap-1 py-1 pl-3 pr-1">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{city.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {[city.region, city.country].filter(Boolean).join(', ')}
            </p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Add ${city.name} to batch`} title="Add to batch" disabled={busy} onClick={() => onUse(city)}>
            <Plus />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            aria-label={`Remove ${city.name} from recent locations`}
            title="Remove"
            disabled={busy}
            onClick={() => onRemove(city)}
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  )
}
