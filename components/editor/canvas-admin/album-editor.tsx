'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react'
import { EditorButton, SelectField, SliderField } from '@/components/editor/controls'
import { canvasSceneSchema } from '@/lib/canvas/schema'
import { SCENE_FIELDS } from '@/lib/canvas/scenes/fields'
import { SCENE_META, defaultScene } from '@/lib/canvas/scenes/registry'
import type { CanvasScene, CanvasSceneType } from '@/lib/types'
import type { ResolvedGeometry } from '@/lib/canvas/geometry'
import type { Album, CanvasAlbumSlideshow } from '@/lib/canvas/admin-types'
import { SceneFields } from './scene-fields'

function normaliseConfig(scene: CanvasScene): CanvasScene {
  const config = structuredClone(scene.config) as Record<string, unknown>
  if (scene.type === 'marquee' && config.lines && !Array.isArray(config.lines) && typeof config.lines === 'object') {
    const wrapper = config.lines as { lines?: string[]; strip?: unknown }
    config.lines = wrapper.lines ?? []
    if (wrapper.strip && typeof wrapper.strip === 'object') config.strip = wrapper.strip
  }
  if (scene.type === 'bounce') {
    const logo = config.logo as Record<string, unknown>
    const tint = config.tint as Record<string, unknown>
    if (logo.src && typeof logo.src === 'object') logo.src = ''
    if (tint.colors && !Array.isArray(tint.colors) && typeof tint.colors === 'object') {
      tint.colors = (tint.colors as { colors?: string[] }).colors ?? []
    }
  }
  return { ...scene, config } as CanvasScene
}

function problemsFor(album: Album): string[] {
  const problems: string[] = []
  const scenes = (album.scenes ?? []).filter((scene) => scene.enabled)
  if (scenes.length === 0) problems.push('Enable at least one scene before going live.')
  for (const scene of album.scenes ?? []) {
    const parsed = canvasSceneSchema.safeParse(normaliseConfig(scene))
    if (!parsed.success) {
      problems.push(`${scene.name}: ${parsed.error.issues[0]?.message ?? 'invalid scene'}`)
      continue
    }
    if (scene.durationSec < 5 || scene.durationSec > 600) problems.push(`${scene.name}: duration must be 5 to 600 s.`)
    const json = JSON.stringify(scene.config)
    if (json.includes('/api/uploads/') || json.includes('/api/media/')) {
      problems.push(`${scene.name}: embed logos as data URIs, not upload URLs.`)
    }
  }
  return problems
}

export function AlbumEditor({
  album,
  geometry,
  dirty,
  onChange,
  onDelete,
}: {
  album: Album
  geometry: ResolvedGeometry
  dirty: boolean
  onChange: (album: Album) => void
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const problems = problemsFor(album)
  const scenes = album.scenes ?? []

  function updateScene(id: string, fn: (scene: CanvasScene) => CanvasScene) {
    onChange({ ...album, scenes: scenes.map((scene) => scene.id === id ? fn(scene) : scene) })
  }

  function addScene(type: CanvasSceneType) {
    onChange({ ...album, scenes: [...scenes, defaultScene(type, geometry)] })
    setAdding(false)
  }

  return (
    <div className="flex flex-col gap-4 p-3">
      <div className="flex items-center justify-between gap-2">
        <input
          aria-label="Album name"
          value={album.name}
          maxLength={80}
          onChange={(e) => onChange({ ...album, name: e.target.value })}
          className="editor-control h-9 min-w-0 flex-1 px-2"
        />
        <EditorButton type="button" variant="destructive" aria-label="Delete album" onClick={onDelete}>
          <Trash2 className="size-4" aria-hidden />
        </EditorButton>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-2 text-xs">
        <span aria-live="polite" className={dirty ? 'text-amber-600' : 'text-muted-foreground'}>
          {dirty ? 'Unpublished changes' : 'All changes saved'}
        </span>
      </div>

      <SelectField
        label="Scene order"
        value={album.slideshow.order}
        options={[{ value: 'sequence', label: 'Sequence' }, { value: 'shuffle', label: 'Shuffle' }]}
        onChange={(v) => onChange({ ...album, slideshow: { ...album.slideshow, order: v as CanvasAlbumSlideshow['order'] } })}
      />
      <SliderField
        label="Crossfade"
        value={album.slideshow.canvas?.crossfadeMs ?? 400}
        min={0}
        max={1500}
        step={50}
        suffix="ms"
        onChange={(v) => onChange({
          ...album,
          slideshow: { ...album.slideshow, canvas: { crossfadeMs: v } },
        })}
      />

      <section aria-label="Scenes" className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Scenes</h3>
          <EditorButton type="button" variant="secondary" onClick={() => setAdding((v) => !v)}>
            <Plus className="size-4" aria-hidden /> Add scene
          </EditorButton>
        </div>
        {adding && (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-card p-2">
            {(Object.keys(SCENE_META) as CanvasSceneType[]).map((type) => {
              const meta = SCENE_META[type]
              return (
                <EditorButton key={type} type="button" variant="quiet" onClick={() => addScene(type)}>
                  <meta.icon className="size-4" aria-hidden /> {meta.label}
                </EditorButton>
              )
            })}
          </div>
        )}
        {scenes.length === 0 && <p className="text-xs text-muted-foreground">No scenes yet.</p>}
        {scenes.map((scene) => {
          const meta = SCENE_META[scene.type]
          const open = expanded === scene.id
          return (
            <div key={scene.id} className="rounded-lg border border-border bg-card">
              <div className="flex items-center gap-2 p-2">
                <input
                  type="checkbox"
                  aria-label={`Enable ${scene.name}`}
                  checked={scene.enabled}
                  onChange={(e) => updateScene(scene.id, (s) => ({ ...s, enabled: e.target.checked }))}
                />
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : scene.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <meta.icon className="size-4 text-primary" aria-hidden />
                  <span className="truncate text-sm">{scene.name}</span>
                  {open ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
                </button>
                <EditorButton
                  type="button"
                  variant="destructive"
                  aria-label={`Delete ${scene.name}`}
                  onClick={() => onChange({ ...album, scenes: scenes.filter((s) => s.id !== scene.id) })}
                >
                  <Trash2 className="size-4" aria-hidden />
                </EditorButton>
              </div>
              {open && (
                <div className="flex flex-col gap-3 border-t border-border p-2">
                  <input
                    aria-label="Scene name"
                    value={scene.name}
                    maxLength={60}
                    onChange={(e) => updateScene(scene.id, (s) => ({ ...s, name: e.target.value }))}
                    className="editor-control h-9 w-full px-2"
                  />
                  <SliderField
                    label="Duration"
                    value={scene.durationSec}
                    min={5}
                    max={600}
                    step={5}
                    suffix="s"
                    onChange={(v) => updateScene(scene.id, (s) => ({ ...s, durationSec: v }))}
                  />
                  <SceneFields
                    fields={SCENE_FIELDS[scene.type]}
                    config={scene.config as unknown as Record<string, unknown>}
                    onChange={(config) => updateScene(scene.id, (s) => normaliseConfig({ ...s, config } as CanvasScene))}
                  />
                </div>
              )}
            </div>
          )
        })}
      </section>

      <section aria-label="Problems" className="rounded-lg border border-border bg-card p-2">
        <h3 className="mb-1 text-sm font-semibold">Problems</h3>
        {problems.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ready to deploy.</p>
        ) : (
          <ul className="list-disc pl-4 text-xs text-amber-700">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
      </section>
    </div>
  )
}
