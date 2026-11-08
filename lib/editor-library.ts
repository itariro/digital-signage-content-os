import type { WidgetDefinition } from '@/lib/widgets'

export type WidgetLibraryCategory = 'All' | WidgetDefinition['category']

export const WIDGET_LIBRARY_CATEGORIES: WidgetLibraryCategory[] = [
  'All',
  'Time',
  'Weather',
  'Planner',
  'Decor',
  'Family',
]

export function matchesLibrarySearch(query: string, values: Array<string | undefined>): boolean {
  const normalizedQuery = query.trim().toLowerCase()
  if (!normalizedQuery) return true
  return values.some((value) => value?.toLowerCase().includes(normalizedQuery))
}

export function matchesWidgetCategory(
  category: WidgetLibraryCategory,
  itemCategory: WidgetDefinition['category'],
): boolean {
  return category === 'All' || category === itemCategory
}
