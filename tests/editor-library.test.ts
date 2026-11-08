import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { WIDGETS } from '@/lib/widgets'
import {
  matchesLibrarySearch,
  matchesWidgetCategory,
  WIDGET_LIBRARY_CATEGORIES,
} from '@/lib/editor-library'

const librarySource = readFileSync(
  path.resolve(__dirname, '../components/editor/library-panel.tsx'),
  'utf8',
)

describe('widget library filtering', () => {
  it('searches label, description, and category without case sensitivity', () => {
    expect(matchesLibrarySearch(' SUN ', ['Sunrise & sunset', 'Daylight tracker', 'Weather'])).toBe(true)
    expect(matchesLibrarySearch('planner', ['Upcoming events', 'Calendar', 'Planner'])).toBe(true)
    expect(matchesLibrarySearch('missing', ['Large lockscreen time', 'Time'])).toBe(false)
  })

  it('filters widgets by category and keeps all categories for All', () => {
    expect(matchesWidgetCategory('All', 'Time')).toBe(true)
    expect(matchesWidgetCategory('Weather', 'Weather')).toBe(true)
    expect(matchesWidgetCategory('Weather', 'Time')).toBe(false)
    expect(matchesWidgetCategory('Family', 'Family')).toBe(true)
    expect(WIDGETS.filter((widget) => matchesWidgetCategory('All', widget.category))).toHaveLength(WIDGETS.length)
    expect(WIDGETS.filter((widget) => matchesWidgetCategory('Weather', widget.category))
      .every((widget) => widget.category === 'Weather')).toBe(true)
    expect(WIDGET_LIBRARY_CATEGORIES).toEqual(['All', 'Time', 'Weather', 'Planner', 'Decor', 'Family'])
  })
})

describe('widget library panel contract', () => {
  it('uses shared search and category helpers for the appropriate sections', () => {
    expect(librarySource).toContain('matchesWidgetCategory(category, widget.category)')
    expect(librarySource).toContain('matchesLibrarySearch(query, [widget.label, widget.description, widget.category])')
    expect(librarySource).toContain('matchesLibrarySearch(query, [combo.name, combo.description])')
    expect(librarySource).toContain('matchesLibrarySearch(query, [sticker.name, sticker.description])')
    expect(librarySource).toContain('String(preset.widgets.length)')
    expect(librarySource).toContain('...preset.widgets.map((widget) => getDefinition(widget.type).label)')
    expect(librarySource).toContain('const visibleCombos = combos.filter')
    expect(librarySource).toContain('const visibleStickers = BUILTIN_STICKERS.filter')
    expect(librarySource).toContain('const visiblePresets = presets.filter')
  })

  it('preserves library actions, previews, and descriptions', () => {
    for (const behavior of [
      'BUILTIN_COMBOS',
      'BUILTIN_STICKERS',
      'presets',
      'WidgetPreview',
      'DRAG_MIME',
      'e.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload))',
      'onDeletePreset',
      'onClick={() => onAdd({ kind: \'widget\'',
      'onClick={() => onAdd({ kind: \'combo\'',
      'onClick={() => onAdd({ kind: \'sticker\'',
      'onClick={() => onAdd({ kind: \'preset\'',
      'combo.description',
      'sticker.description',
    ]) {
      expect(librarySource).toContain(behavior)
    }
  })

  it('provides an accessible search, clear action, category state, and section empty results', () => {
    expect(librarySource).toContain('<label htmlFor="library-search"')
    expect(librarySource).toContain('value={query}')
    expect(librarySource).toContain('aria-label="Clear search"')
    expect(librarySource).toContain("onClick={() => setQuery('')}")
    expect(librarySource).toContain('aria-pressed={category === option}')
    expect(librarySource).toContain('No {widgetCategory.toLowerCase()} widgets match your search.')
    expect(librarySource).toContain('No combinations match your search.')
    expect(librarySource).toContain('No text stickers match your search.')
    expect(librarySource).toContain('No saved widgets match your search.')
  })
})
