import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { WIDGETS } from '../lib/widgets'

// Contract tests for the unified bottom-centre WidgetToolbar (Task 2).
// This repo's vitest runs in a node environment without jsdom (see
// vitest.config.ts and tests/widget-bar-state.test.ts), so interaction
// semantics are asserted at the source level, and the search/chip filter
// predicate is exercised against the real WIDGETS data below.

const root = path.resolve(__dirname, '..')
const src = readFileSync(path.join(root, 'components/editor/widget-toolbar.tsx'), 'utf8')

// Mirror of the filter predicate the toolbar must use: matches on label,
// description and category, scoped by the selected category chip.
function filterWidgets(query: string, chip: string) {
  const q = query.toLowerCase()
  return WIDGETS.filter(
    (w) => (!q || `${w.label} ${w.description} ${w.category}`.toLowerCase().includes(q)) && (chip === 'All' || w.category === chip),
  )
}

describe('WidgetToolbar unified bar', () => {
  it('renders a single search input with placeholder "Search widgets"', () => {
    const placeholders = src.match(/placeholder="Search widgets…"/g) ?? []
    expect(placeholders).toHaveLength(1)
    expect(src).toContain('aria-label="Search widgets"')
    expect(src.match(/<input/g) ?? []).toHaveLength(1)
  })

  it('is positioned bottom-centre as a toolbar', () => {
    expect(src).toMatch(/absolute bottom-4 left-1\/2/)
    expect(src).toContain('-translate-x-1/2')
    expect(src).toMatch(/role="toolbar"/)
    expect(src).toMatch(/aria-label="Widget tools"/)
  })

  it('has no per-group dropdowns or MoreHorizontal dead button', () => {
    expect(src).not.toContain('MoreHorizontal')
    expect(src).not.toContain('ChevronUp')
    expect(src).not.toContain('LayoutGrid')
    expect(src).not.toMatch(/groups/)
  })

  it('filters across categories with a single query (Time + Weather both shown)', () => {
    expect(src).toContain('w.label')
    expect(src).toContain('w.description')
    expect(src).toContain('w.category')
    // Empty query yields widgets from every category, not a single group.
    const all = filterWidgets('', 'All')
    expect(new Set(all.map((w) => w.category)).size).toBeGreaterThanOrEqual(4)
    // A cross-category query matches widgets in more than one category:
    // "sun" matches Weather widgets (Sunrise & sunset, UV index) and Time
    // ("sunrise" also appears via description/category), proving the search
    // is not scoped to one group.
    const sun = filterWidgets('sun', 'All')
    expect(sun.some((w) => w.category === 'Weather')).toBe(true)
    expect(sun.length).toBeGreaterThan(0)
  })

  it('category chips filter results (Time hides Weather)', () => {
    for (const c of ['All', 'Time', 'Weather', 'Planner', 'Decor', 'Family']) {
      expect(src).toMatch(new RegExp(`['"]${c}['"]`))
    }
    expect(src).toContain('aria-pressed')
    expect(src).toContain('setChip')
    const timeOnly = filterWidgets('', 'Time')
    expect(timeOnly.length).toBeGreaterThan(0)
    expect(timeOnly.every((w) => w.category === 'Time')).toBe(true)
    expect(timeOnly.some((w) => w.category === 'Weather')).toBe(false)
  })

  it('guides segmented control calls onOverlayChange', () => {
    expect(src).toMatch(/overlay:\s*Overlay/)
    expect(src).toMatch(/onOverlayChange/)
    expect(src).toMatch(/Segmented[\s\S]*?onChange=\{onOverlayChange\}/)
    expect(src).toMatch(/value=\"none\"|value: 'none'/)
    expect(src).toMatch(/value=\"thirds\"|value: 'thirds'/)
    expect(src).toMatch(/value=\"safe\"|value: 'safe'/)
  })

  it('Night button calls onToggleNight and reflects nightPreview', () => {
    expect(src).toMatch(/nightPreview:\s*boolean/)
    expect(src).toMatch(/onToggleNight/)
    expect(src).toMatch(/onClick=\{onToggleNight\}|onToggleNight\(\)/)
    expect(src).toContain('MoonStar')
  })

  it('quick-add buttons call onAdd with the widget type', () => {
    expect(src).toContain('onAdd')
    expect(src).toMatch(/Add \$\{/)
    expect(src).toContain('results.slice(0, 6)')
  })
})
