'use client'

import { useEffect, useState } from 'react'
import type { MapArtSettings } from '@/lib/types'
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field'
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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'

export type StyleOption = {
  id: MapArtSettings['styleId']
  label: string
  swatches: string[]
}

const zoomLevels = [
  { value: 10, label: 'City', description: 'Whole city context' },
  { value: 12, label: 'District', description: 'Neighbourhood clusters' },
  { value: 14, label: 'Streets', description: 'Street-level detail' },
  { value: 16, label: 'Detail', description: 'Closest streets and blocks' },
] as const

const CUSTOM_TEXT_MAX = 60

function ToggleRow({ id, label, description, checked, onCheckedChange }: {
  id: string
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (value: boolean) => void
}) {
  return (
    <Field orientation="horizontal" className="items-center justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <FieldLabel htmlFor={id} className="text-sm font-normal">{label}</FieldLabel>
        {description && <FieldDescription className="text-xs">{description}</FieldDescription>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </Field>
  )
}

export function StyleTab({
  values, styles, presets,
  onStyleChange, onOrientationChange, onBackgroundChange, onZoomChange, onZoomPreset,
  onStreetLabelsChange, onTitleChange, onCoordsChange, onRailwaysChange, onTrailsChange,
  onCustomTextChange,
}: {
  values: Pick<
    MapArtSettings,
    'styleId' | 'orientation' | 'backgroundColor' | 'zoom' | 'streetLabels' |
    'title' | 'showCoords' | 'showRailways' | 'showTrails' | 'customText'
  >
  styles: readonly StyleOption[]
  presets: string[]
  onStyleChange: (style: StyleOption) => void
  onOrientationChange: (orientation: MapArtSettings['orientation']) => void
  onBackgroundChange: (color: string) => void
  onZoomChange: (zoom: number) => void
  onZoomPreset: (zoom: number) => void
  onStreetLabelsChange: (value: MapArtSettings['streetLabels']) => void
  onTitleChange: (value: boolean) => void
  onCoordsChange: (value: boolean) => void
  onRailwaysChange: (value: boolean) => void
  onTrailsChange: (value: boolean) => void
  onCustomTextChange: (value: string) => void
}) {
  const isPortrait = values.orientation === 'portrait'
  const [backgroundDraft, setBackgroundDraft] = useState(values.backgroundColor)
  useEffect(() => setBackgroundDraft(values.backgroundColor), [values.backgroundColor])

  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      {/* Style — iterate styles (not presets) so every card maps 1:1 to a real style */}
      <FieldSet className="gap-3">
        <FieldLegend variant="label">Map style</FieldLegend>
        <RadioGroup
          aria-label="Map style"
          value={values.styleId}
          onValueChange={(next: string) => onStyleChange(styles.find((option) => option.id === next) ?? styles[0])}
          className="grid grid-cols-3 gap-2"
        >
          {styles.map((option, index) => {
            const active = values.styleId === option.id
            const [paper, ink, accent] = option.swatches
            const labelId = `map-style-${option.id}-label`
            return (
              <RadioGroupItem
                key={option.id}
                value={option.id}
                aria-labelledby={labelId}
                render={<div />}
                className={cn(
                  '!aspect-auto !size-auto flex w-full min-w-0 cursor-pointer flex-col gap-1.5 rounded-md border p-1.5 text-left transition-colors outline-none',
                  'hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50',
                  'data-checked:bg-transparent data-checked:text-foreground',
                  active ? 'border-primary ring-1 ring-primary' : 'border-border',
                )}
              >
                <span className="relative block aspect-[4/3] overflow-hidden rounded-sm border border-border/60" style={{ background: paper }}>
                  <span className="absolute left-[10%] top-[38%] h-px w-[80%] -rotate-12" style={{ background: ink }} />
                  <span className="absolute left-[25%] top-[55%] h-px w-[55%] rotate-[30deg]" style={{ background: accent }} />
                  <span className="absolute left-[12%] top-[68%] h-px w-[70%] rotate-6" style={{ background: ink, opacity: 0.5 }} />
                </span>
                <span id={labelId} className="truncate px-0.5 text-[11px] font-medium leading-tight">{presets[index] ?? option.label}</span>
              </RadioGroupItem>
            )
          })}
        </RadioGroup>
      </FieldSet>

      <Separator />

      <FieldSet className="gap-4">
        <FieldLegend variant="label">Poster</FieldLegend>
        <Field className="gap-2">
          <FieldLabel className="text-xs text-muted-foreground">Poster type</FieldLabel>
          <RadioGroup
            aria-label="Poster type"
            value={values.orientation}
            onValueChange={(next: string) => onOrientationChange(next as MapArtSettings['orientation'])}
          >
            <Field orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id="poster-type-portrait" value="portrait" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="poster-type-portrait" className="font-normal">Portrait</FieldLabel>
                <FieldDescription>Tall 11 MP poster for walls and portrait displays</FieldDescription>
              </div>
            </Field>
            <Field orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id="poster-type-landscape" value="landscape" className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor="poster-type-landscape" className="font-normal">Landscape</FieldLabel>
                <FieldDescription>Wide 8 MP poster for screens and landscape frames</FieldDescription>
              </div>
            </Field>
          </RadioGroup>
          <FieldDescription className="flex justify-between text-xs tabular-nums">
            <span>{isPortrait ? '2880 × 3840 · 11 MP' : '3840 × 2160 · 8 MP'}</span>
            <span>PNG</span>
          </FieldDescription>
        </Field>
        <Field className="gap-2">
          <FieldLabel htmlFor="poster-background">Background</FieldLabel>
          <div className="flex items-center gap-2">
            <label
              className="relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border border-input shadow-xs"
              style={{ background: values.backgroundColor }}
            >
              <input
                type="color"
                aria-label="Pick background colour"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={values.backgroundColor}
                onChange={(event) => onBackgroundChange(event.target.value)}
              />
            </label>
            <Input
              id="poster-background"
              className="font-mono uppercase"
              value={backgroundDraft}
              onChange={(event) => {
                const next = event.target.value
                setBackgroundDraft(next)
                if (/^#[0-9a-fA-F]{6}$/.test(next)) onBackgroundChange(next)
              }}
              onBlur={() => setBackgroundDraft(values.backgroundColor)}
            />
          </div>
        </Field>
      </FieldSet>

      <Separator />

      <FieldSet className="gap-4">
        <div className="flex items-center justify-between">
          <FieldLegend variant="label" className="mb-0">Zoom</FieldLegend>
          <span className="text-xs tabular-nums text-muted-foreground">{values.zoom.toFixed(1)}</span>
        </div>
        <Slider
          aria-label="Map zoom"
          value={values.zoom}
          min={8}
          max={16}
          step={0.1}
          onValueChange={(next) => onZoomChange(next as number)}
        />
        <RadioGroup
          aria-label="Zoom presets"
          value={String(zoomLevels.find((preset) => Math.abs(values.zoom - preset.value) < 0.1)?.value ?? '')}
          onValueChange={(next: string) => onZoomPreset(Number(next))}
          className="gap-2"
        >
          {zoomLevels.map((preset) => (
            <Field key={preset.value} orientation="horizontal" className="items-start gap-2">
              <RadioGroupItem id={`zoom-preset-${preset.value}`} value={String(preset.value)} className="mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <FieldLabel htmlFor={`zoom-preset-${preset.value}`} className="font-normal">{preset.label}</FieldLabel>
                <FieldDescription>{preset.description}</FieldDescription>
              </div>
            </Field>
          ))}
        </RadioGroup>
      </FieldSet>

      <Separator />

      <FieldSet className="gap-4">
        <FieldLegend variant="label">Map layers</FieldLegend>
        <Field className="gap-2">
          <FieldLabel htmlFor="street-label-density">Street names</FieldLabel>
          <Select
            items={[
              { value: 'major', label: 'Major streets' },
              { value: 'all', label: 'All streets' },
              { value: 'none', label: 'Hidden' },
            ]}
            value={values.streetLabels}
            onValueChange={(next) => next !== null && onStreetLabelsChange(String(next) as MapArtSettings['streetLabels'])}
          >
            <SelectTrigger id="street-label-density" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              <SelectGroup>
                <SelectItem value="major">Major streets</SelectItem>
                <SelectItem value="all">All streets</SelectItem>
                <SelectItem value="none">Hidden</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <ToggleRow id="map-layer-railways" label="Railway lines" checked={values.showRailways} onCheckedChange={onRailwaysChange} />
        <ToggleRow id="map-layer-trails" label="Trails & paths" checked={values.showTrails} onCheckedChange={onTrailsChange} />
      </FieldSet>

      <Separator />

      <FieldSet className="gap-4">
        <FieldLegend variant="label">Poster text</FieldLegend>
        <ToggleRow id="poster-title" label="City title" description="Name and country below the map" checked={values.title} onCheckedChange={onTitleChange} />
        <ToggleRow id="poster-coordinates" label="Coordinates" checked={values.showCoords} onCheckedChange={onCoordsChange} />
        <Field className="gap-2" data-disabled={!values.title || undefined}>
          <div className="flex items-center justify-between">
            <FieldLabel htmlFor="poster-note">Subtitle</FieldLabel>
            <span className="text-xs tabular-nums text-muted-foreground">{values.customText.length}/{CUSTOM_TEXT_MAX}</span>
          </div>
          <Input
            id="poster-note"
            maxLength={CUSTOM_TEXT_MAX}
            value={values.customText}
            disabled={!values.title}
            onChange={(event) => onCustomTextChange(event.target.value)}
            placeholder="Optional — e.g. Where we met"
          />
        </Field>
      </FieldSet>
    </div>
  )
}
