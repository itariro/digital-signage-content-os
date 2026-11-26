'use client'

import { ColorField, SelectField, SliderField, ToggleField } from '@/components/editor/controls'
import { BUILTIN_FONTS, fontLabel } from '@/lib/fonts'
import type { SceneField } from '@/lib/canvas/scenes/types'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { LogoUpload } from './logo-upload'
import { MarqueeLinesEditor } from './marquee-lines-editor'

type ConfigObject = Record<string, unknown>

export function getPath(root: ConfigObject, key: string): unknown {
  return key.split('.').reduce<unknown>((value, part) => {
    if (value && typeof value === 'object') return (value as ConfigObject)[part]
    return undefined
  }, root)
}

export function setPath(root: ConfigObject, key: string, value: unknown): ConfigObject {
  const next = structuredClone(root)
  const parts = key.split('.')
  let cursor: ConfigObject = next
  for (const part of parts.slice(0, -1)) {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {}
    cursor = cursor[part] as ConfigObject
  }
  cursor[parts[parts.length - 1]] = value
  return next
}

function FieldRow({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <Field className="gap-1.5 py-1.5">
      <FieldLabel className="text-xs">{label}</FieldLabel>
      {children}
      {help && <FieldDescription className="text-[11px]">{help}</FieldDescription>}
    </Field>
  )
}

function FieldControl({
  field,
  config,
  value,
  write,
  onChange,
}: {
  field: SceneField
  config: ConfigObject
  value: unknown
  write: (next: unknown) => void
  onChange: (config: ConfigObject) => void
}) {
  switch (field.kind) {
    case 'number': {
      const current = Number(value ?? field.min)
      if (field.step !== undefined) {
        return (
          <div className="flex flex-col gap-1.5 py-1.5">
            <SliderField
              label={field.label}
              value={current}
              min={field.min}
              max={field.max}
              step={field.step}
              onChange={write}
            />
            {field.help && <p className="text-[11px] leading-relaxed text-muted-foreground">{field.help}</p>}
          </div>
        )
      }
      return (
        <FieldRow label={field.label} help={field.help}>
          <Input
            type="number"
            aria-label={field.label}
            min={field.min}
            max={field.max}
            value={current}
            onChange={(e) => write(Math.max(field.min, Math.min(field.max, Number(e.target.value))))}
          />
        </FieldRow>
      )
    }
    case 'slider':
      return (
        <div className="flex flex-col gap-1.5 py-1.5">
          <SliderField
            label={field.label}
            value={Number(value ?? field.min)}
            min={field.min}
            max={field.max}
            step={field.step}
            onChange={write}
          />
          {field.help && <p className="text-[11px] leading-relaxed text-muted-foreground">{field.help}</p>}
        </div>
      )
    case 'text':
      return (
        <FieldRow label={field.label} help={field.help}>
          <Input
            type="text"
            aria-label={field.label}
            maxLength={field.maxLength}
            placeholder={field.placeholder}
            value={String(value ?? '')}
            onChange={(e) => write(e.target.value)}
          />
        </FieldRow>
      )
    case 'textarea':
      return (
        <FieldRow label={field.label} help={field.help}>
          <Textarea
            aria-label={field.label}
            rows={field.rows ?? 4}
            maxLength={field.maxLength}
            value={String(value ?? '')}
            onChange={(e) => write(e.target.value)}
          />
        </FieldRow>
      )
    case 'lines':
      return (
        <FieldRow label={field.label} help={field.help}>
          <MarqueeLinesEditor
            config={config}
            value={Array.isArray(value) ? value.map(String) : []}
            maxLines={field.maxLines}
            maxLength={field.maxLength}
            colorMode={field.key === 'tint.colors'}
            onChange={(next, strip) => {
              const updated = setPath(config, field.key, next)
              onChange(field.key === 'lines' && strip !== undefined ? { ...updated, strip } : updated)
            }}
          />
        </FieldRow>
      )
    case 'select':
      return (
        <SelectField
          label={field.label}
          value={String(value ?? field.options[0].value)}
          options={field.options}
          onChange={write}
        />
      )
    case 'color':
      return (
        <ColorField
          label={field.label}
          value={String(value ?? '#ffffff')}
          onChange={write}
        />
      )
    case 'toggle':
      return <ToggleField label={field.label} checked={Boolean(value)} onChange={write} />
    case 'font':
      return (
        <SelectField
          label={field.label}
          value={String(value ?? BUILTIN_FONTS[0].id)}
          options={BUILTIN_FONTS.map((font) => ({ value: font.id, label: fontLabel(font.id) }))}
          onChange={write}
        />
      )
    case 'style':
      return (
        <FieldRow label={field.label} help={field.help}>
          <code className="text-[11px] text-muted-foreground">{JSON.stringify(value ?? {})}</code>
        </FieldRow>
      )
    case 'image':
      return (
        <FieldRow label={field.label} help={field.help}>
          <LogoUpload
            value={typeof value === 'string' ? value : ''}
            accept={field.accept}
            maxBytes={field.maxBytes}
            onChange={write}
          />
        </FieldRow>
      )
  }
}

export function SceneFields({
  fields,
  config,
  onChange,
}: {
  fields: SceneField[]
  config: ConfigObject
  onChange: (config: ConfigObject) => void
}) {
  return (
    <div className="flex flex-col divide-y divide-border">
      {fields.map((field) => (
        <FieldControl
          key={field.key}
          field={field}
          config={config}
          value={getPath(config, field.key)}
          write={(next) => onChange(setPath(config, field.key, next))}
          onChange={onChange}
        />
      ))}
    </div>
  )
}
