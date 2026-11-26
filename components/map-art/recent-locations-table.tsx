'use client'

import { ArrowRight, Trash2 } from 'lucide-react'
import type { MapArtLocation } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription } from '@/components/ui/empty'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function RecentLocationsTable({ locations, onUse, onRemove }: {
  locations: MapArtLocation[]
  onUse: (city: MapArtLocation) => void
  onRemove: (city: MapArtLocation) => void
}) {
  if (!locations.length) {
    return <Empty className="border py-4"><EmptyDescription>No generated locations yet.</EmptyDescription></Empty>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Location</TableHead>
          <TableHead className="w-24 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {locations.map((city) => (
          <TableRow key={city.id}>
            <TableCell>
              <span className="block text-xs font-medium text-foreground">{city.name}</span>
              <span className="block text-[11px] text-muted-foreground">
                {[city.region, city.country].filter(Boolean).join(', ')}
              </span>
            </TableCell>
            <TableCell className="text-right">
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Use ${city.name}`} onClick={() => onUse(city)}>
                <ArrowRight />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Remove ${city.name} from recent locations`}
                onClick={() => onRemove(city)}
              >
                <Trash2 />
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
