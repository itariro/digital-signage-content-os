import { describe, expect, it } from 'vitest'
import { WIDGETS } from '@/lib/widgets'
import { matchesLibrarySearch, matchesWidgetCategory } from '@/lib/editor-library'

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
  })
})
