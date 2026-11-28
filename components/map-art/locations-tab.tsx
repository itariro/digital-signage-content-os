'use client'

import { Check, MapPin, Search, X } from 'lucide-react'
import type { MapArtAmbiguity, MapArtLocation, MapArtSettings } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Field, FieldContent, FieldDescription, FieldLabel, FieldLegend, FieldSet, FieldTitle } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { RecentLocationsTable } from './recent-locations-table'

const countOptions = ['5', '10', '20', 'custom'].map((value) => ({
  value,
  label: value === 'custom' ? 'Custom' : `${value} cities`,
}))

const modeOptions = [
  { value: 'cities', title: 'Enter cities', description: 'Type or paste your own list of places.' },
  { value: 'continent', title: 'By continent', description: 'Pick from curated cities on one continent.' },
] as const

const describe = (city: MapArtLocation) => [city.region, city.country].filter(Boolean).join(', ')

export function LocationsTab({
  mode, query, continent, count, customCount, continentOptions,
  results, ambiguities, verifiedCount, recentLocations, busy,
  onModeChange, onQueryChange, onContinentChange, onCountChange, onCustomCountChange,
  onValidate, onDiscover, onChooseMatch, onRemoveLocation, onConfirm,
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
  onUseRecent: (city: MapArtLocation) => void
  onRemoveRecent: (city: MapArtLocation) => void
}) {
  const lineCount = query.split(/\n|;/).filter((line) => line.trim()).length
  const ambiguityByRow = new Map(ambiguities.map((entry) => [entry.rowId, entry]))

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <FieldSet className="gap-4">
        <FieldLegend variant="label">Source</FieldLegend>
        <RadioGroup
          aria-label="City selection mode"
          className="gap-2"
          value={mode}
          onValueChange={(next) => next && onModeChange(next as MapArtSettings['mode'])}
        >
          {modeOptions.map((option) => (
            <FieldLabel key={option.value} htmlFor={`mode-${option.value}`}>
              <Field orientation="horizontal" className="items-center gap-3 p-3">
                <FieldContent className="gap-0.5">
                  <FieldTitle className="text-sm">{option.title}</FieldTitle>
                  <FieldDescription className="text-xs">{option.description}</FieldDescription>
                </FieldContent>
                <RadioGroupItem value={option.value} id={`mode-${option.value}`} />
              </Field>
            </FieldLabel>
          ))}
        </RadioGroup>

        {mode === 'cities' ? (
          <>
            <Field className="gap-2">
              <div className="flex items-center justify-between">
                <FieldLabel htmlFor="city-list">Your cities</FieldLabel>
                <Badge variant="secondary" className="tabular-nums">{lineCount}</Badge>
              </div>
              <Textarea
                id="city-list"
                className="min-h-36 resize-y text-sm leading-relaxed"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder={'Melbourne, Australia\nTokyo, Japan\nParis, France'}
              />
              <FieldDescription className="text-xs">One per line. Add a country to resolve ambiguous names.</FieldDescription>
            </Field>
            <Button variant="outline" className="w-full" onClick={onValidate} disabled={busy || !lineCount}>
              <Search data-icon="inline-start" /> Validate locations
            </Button>
          </>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <Field className="gap-2">
                <FieldLabel htmlFor="continent">Continent</FieldLabel>
                <Select
                  items={continentOptions.map((name) => ({ value: name, label: name }))}
                  value={continent}
                  onValueChange={(next) => next !== null && onContinentChange(String(next))}
                >
                  <SelectTrigger id="continent" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {continentOptions.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="w-28 gap-2">
                <FieldLabel htmlFor="city-count">Count</FieldLabel>
                <Select items={countOptions} value={count} onValueChange={(next) => next !== null && onCountChange(String(next))}>
                  <SelectTrigger id="city-count" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      {countOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            {count === 'custom' && (
              <Field orientation="horizontal" className="items-center justify-between">
                <FieldLabel htmlFor="custom-count" className="font-normal">Number of cities (1–20)</FieldLabel>
                <Input
                  id="custom-count"
                  className="w-20 tabular-nums"
                  type="number"
                  min={1}
                  max={20}
                  value={customCount}
                  onChange={(event) => onCustomCountChange(Math.min(20, Math.max(1, Number(event.target.value) || 1)))}
                />
              </Field>
            )}
            <Button variant="outline" className="w-full" onClick={onDiscover} disabled={busy}>
              <MapPin data-icon="inline-start" /> Find cities
            </Button>
            <FieldDescription className="text-xs">Curated candidates are geocoded and checked before generation.</FieldDescription>
          </>
        )}
      </FieldSet>

      {verifiedCount === null && results.length > 0 && (
        <>
          <Separator />
          <FieldSet className="gap-3">
            <div className="flex items-center justify-between">
              <FieldLegend variant="label" className="mb-0">Review locations</FieldLegend>
              <Badge variant="secondary" className="tabular-nums">{results.length}</Badge>
            </div>
            <ul className="max-h-72 divide-y overflow-y-auto rounded-md border">
              {results.map((item, index) => {
                const ambiguity = ambiguityByRow.get(index)
                return (
                  <li key={`${item.id}-${index}`} className="flex flex-col gap-2 py-1.5 pl-3 pr-1">
                    <div className="flex items-center gap-1">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{item.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{describe(item)}</p>
                      </div>
                      {ambiguity && <Badge variant="outline" className="shrink-0 text-[10px]">{ambiguity.matches.length} matches</Badge>}
                      <Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Remove ${item.name}`} onClick={() => onRemoveLocation(item)}>
                        <X />
                      </Button>
                    </div>
                    {ambiguity && (
                      <Select
                        items={ambiguity.matches.map((match) => ({ value: String(match.id), label: [match.name, describe(match)].filter(Boolean).join(', ') }))}
                        value={String(ambiguity.chosenId)}
                        onValueChange={(next) => next !== null && onChooseMatch(ambiguity.query, Number(next))}
                      >
                        <SelectTrigger size="sm" className="mr-2 w-auto" aria-label={`Choose match for ${ambiguity.query}`}><SelectValue /></SelectTrigger>
                        <SelectContent alignItemWithTrigger={false}>
                          <SelectGroup>
                            {ambiguity.matches.map((match) => (
                              <SelectItem key={match.id} value={String(match.id)}>{[match.name, describe(match)].filter(Boolean).join(', ')}</SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  </li>
                )
              })}
            </ul>
            <Button className="w-full" onClick={onConfirm} disabled={busy}>
              <Check data-icon="inline-start" /> Confirm {results.length} location{results.length === 1 ? '' : 's'}
            </Button>
          </FieldSet>
        </>
      )}

      <Separator />

      <FieldSet className="gap-3">
        <FieldLegend variant="label">RECENT</FieldLegend>
        <RecentLocationsTable locations={recentLocations} busy={busy} onUse={onUseRecent} onRemove={onRemoveRecent} />
      </FieldSet>
    </div>
  )
}
