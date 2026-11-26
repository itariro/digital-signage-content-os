'use client'

import { Check, MapPin, Search, X } from 'lucide-react'
import type { MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { RecentLocationsTable } from './recent-locations-table'

export function LocationsTab({
  mode, query, continent, count, customCount, continentOptions,
  results, ambiguities, verifiedCount, recentLocations, busy,
  onModeChange, onQueryChange, onContinentChange, onCountChange, onCustomCountChange,
  onValidate, onDiscover, onChooseMatch, onRemoveLocation, onConfirm, onEditVerified,
  onUseRecent, onRemoveRecent,
}: {
  mode: MapArtSettings['mode']
  query: string
  continent: string
  count: string
  customCount: number
  continentOptions: string[]
  results: MapArtLocation[]
  ambiguities: MapArtAmbiguity[]
  verifiedCount: number | null
  recentLocations: MapArtLocation[]
  busy: boolean
  onModeChange: (mode: MapArtSettings['mode']) => void
  onQueryChange: (query: string) => void
  onContinentChange: (continent: string) => void
  onCountChange: (count: string) => void
  onCustomCountChange: (count: number) => void
  onValidate: () => void
  onDiscover: () => void
  onChooseMatch: (query: string, id: number) => void
  onRemoveLocation: (city: MapArtLocation) => void
  onConfirm: () => void
  onEditVerified: () => void
  onUseRecent: (city: MapArtLocation) => void
  onRemoveRecent: (city: MapArtLocation) => void
}) {
  return (
    <div className="flex flex-col gap-3 p-4">
      <ToggleGroup
        className="grid w-full grid-cols-2"
        aria-label="City selection mode"
        value={[mode]}
        onValueChange={(next) => next[0] && onModeChange(next[0] as MapArtSettings['mode'])}
      >
        <ToggleGroupItem value="cities" variant="outline" className="h-9">Enter cities</ToggleGroupItem>
        <ToggleGroupItem value="continent" variant="outline" className="h-9">Choose continent</ToggleGroupItem>
      </ToggleGroup>

      {mode === 'cities' ? (
        <section className="map-art-block">
          <Field className="gap-1">
            <div className="flex items-center justify-between">
              <FieldLabel className="map-art-label" htmlFor="city-list">Your cities</FieldLabel>
              <span className="map-art-label-count">{query.split(/\n|;/).filter((line) => line.trim()).length}</span>
            </div>
            <Textarea
              id="city-list"
              className="map-art-input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={'Melbourne, Australia\nTokyo, Japan\nParis, France'}
              rows={7}
            />
          </Field>
          <p className="map-art-hint">One location per line. Add a country to resolve ambiguous names.</p>
          <Button variant="outline" size="sm" className="w-full" onClick={onValidate} disabled={busy}>
            <Search size={15} data-icon="inline-start" /> Validate locations
          </Button>
        </section>
      ) : (
        <section className="map-art-block flex flex-col gap-3">
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="continent">Continent</FieldLabel>
            <Select
              items={continentOptions.map((name) => ({ value: name, label: name }))}
              value={continent}
              onValueChange={(next) => next !== null && onContinentChange(String(next))}
            >
              <SelectTrigger id="continent" className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {continentOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor="city-count">Number of cities</FieldLabel>
            <Select
              items={['5', '10', '20', 'custom'].map((value) => ({
                value,
                label: value === 'custom' ? 'Custom number' : `${value} cities`,
              }))}
              value={count}
              onValueChange={(next) => next !== null && onCountChange(String(next))}
            >
              <SelectTrigger id="city-count" className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {['5', '10', '20', 'custom'].map((value) => (
                    <SelectItem key={value} value={value}>{value === 'custom' ? 'Custom number' : `${value} cities`}</SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          {count === 'custom' && (
            <Input
              className="map-art-input"
              aria-label="Custom number of cities"
              type="number"
              min={1}
              max={20}
              value={customCount}
              onChange={(event) => onCustomCountChange(Math.min(20, Math.max(1, Number(event.target.value))))}
            />
          )}
          <Button variant="outline" size="sm" className="w-full" onClick={onDiscover} disabled={busy}>
            <MapPin size={15} data-icon="inline-start" /> Find cities
          </Button>
          <p className="map-art-hint">Up to 20 curated candidates are geocoded and checked before generation.</p>
        </section>
      )}

      {verifiedCount === null && results.length > 0 && (
        <section className="map-art-block">
          <div className="map-art-label">Review locations <span>{results.length}</span></div>
          <div className="map-art-city-list">
            {results.map((item) => (
              <div key={item.id}>
                <span className="truncate text-xs">{item.name}</span>
                <small>{[item.region, item.country].filter(Boolean).join(', ')}</small>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${item.name}`}
                  onClick={() => onRemoveLocation(item)}
                >
                  <X size={13} />
                </Button>
              </div>
            ))}
          </div>
          <Button size="sm" className="w-full" onClick={onConfirm} disabled={busy}>
            <Check size={15} data-icon="inline-start" /> Confirm {results.length} locations
          </Button>
        </section>
      )}

      {verifiedCount !== null && (
        <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
          <span className="text-xs text-muted-foreground">{verifiedCount} locations verified</span>
          <Button type="button" variant="ghost" size="sm" onClick={onEditVerified}>Edit</Button>
        </div>
      )}

      {ambiguities.map((entry, index) => (
        <section className="map-art-block" key={entry.query}>
          <Field className="gap-1">
            <FieldLabel className="map-art-label" htmlFor={`ambiguous-city-${index}`}>
              Choose match for “{entry.query}”
            </FieldLabel>
            <Select
              items={entry.matches.map((match) => ({
                value: String(match.id),
                label: [match.name, match.region, match.country].filter(Boolean).join(', '),
              }))}
              value={String(entry.chosenId)}
              onValueChange={(next) => next !== null && onChooseMatch(entry.query, Number(next))}
            >
              <SelectTrigger id={`ambiguous-city-${index}`} className="map-art-input w-full"><SelectValue /></SelectTrigger>
              <SelectContent alignItemWithTrigger={false}>
                <SelectGroup>
                  {entry.matches.map((match) => (
                    <SelectItem key={match.id} value={String(match.id)}>
                      {[match.name, match.region, match.country].filter(Boolean).join(', ')}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
        </section>
      ))}

      <section className="map-art-block">
        <div className="map-art-label">Recent locations</div>
        <RecentLocationsTable locations={recentLocations} onUse={onUseRecent} onRemove={onRemoveRecent} />
      </section>
    </div>
  )
}
