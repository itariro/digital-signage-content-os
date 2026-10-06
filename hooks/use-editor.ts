'use client'

import { useCallback, useMemo, useReducer } from 'react'
import { nanoid } from 'nanoid'
import type { Layout, LayoutSettings, Widget, WidgetStyle } from '@/lib/types'

export type Snapshot = { name: string; settings: LayoutSettings; widgets: Widget[] }

type State = Snapshot & {
  layoutId: string
  selected: string[]
  past: Snapshot[]
  future: Snapshot[]
  version: number
  savedVersion: number
}

type Action =
  | { type: 'load'; layout: Layout }
  | { type: 'select'; ids: string[] }
  | { type: 'change'; fn: (s: Snapshot) => Snapshot; record: boolean }
  | { type: 'checkpoint' }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'saved' }

const HISTORY_LIMIT = 80

function snap(s: State): Snapshot {
  return { name: s.name, settings: s.settings, widgets: s.widgets }
}

function fromLayout(layout: Layout): State {
  return {
    layoutId: layout.id,
    name: layout.name,
    settings: layout.settings,
    widgets: layout.widgets,
    selected: [],
    past: [],
    future: [],
    version: 0,
    savedVersion: 0,
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'load':
      return fromLayout(action.layout)
    case 'select':
      return { ...state, selected: action.ids }
    case 'checkpoint':
      return { ...state, past: [...state.past, snap(state)].slice(-HISTORY_LIMIT), future: [] }
    case 'change': {
      const next = action.fn(snap(state))
      const validIds = new Set(next.widgets.map((w) => w.id))
      return {
        ...state,
        ...next,
        selected: state.selected.filter((id) => validIds.has(id)),
        past: action.record ? [...state.past, snap(state)].slice(-HISTORY_LIMIT) : state.past,
        future: action.record ? [] : state.future,
        version: state.version + 1,
      }
    }
    case 'undo': {
      const prev = state.past.at(-1)
      if (!prev) return state
      return {
        ...state,
        ...prev,
        past: state.past.slice(0, -1),
        future: [snap(state), ...state.future],
        version: state.version + 1,
      }
    }
    case 'redo': {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        ...next,
        past: [...state.past, snap(state)],
        future: state.future.slice(1),
        version: state.version + 1,
      }
    }
    case 'saved':
      return { ...state, savedVersion: state.version }
  }
}

export function useEditor(initial: Layout) {
  const [state, dispatch] = useReducer(reducer, initial, fromLayout)

  const change = useCallback(
    (fn: (s: Snapshot) => Snapshot, record = true) => dispatch({ type: 'change', fn, record }),
    [],
  )

  const actions = useMemo(
    () => ({
      load: (layout: Layout) => dispatch({ type: 'load', layout }),
      select: (ids: string[]) => dispatch({ type: 'select', ids }),
      checkpoint: () => dispatch({ type: 'checkpoint' }),
      undo: () => dispatch({ type: 'undo' }),
      redo: () => dispatch({ type: 'redo' }),
      markSaved: () => dispatch({ type: 'saved' }),
      rename: (name: string, record = true) => change((s) => ({ ...s, name }), record),
      updateSettings: (patch: Partial<LayoutSettings>, record = true) =>
        change((s) => ({ ...s, settings: { ...s.settings, ...patch } }), record),
      addWidgets: (widgets: Widget[]) => {
        change((s) => ({ ...s, widgets: [...s.widgets, ...widgets] }))
        dispatch({ type: 'select', ids: widgets.map((w) => w.id) })
      },
      updateWidgets: (ids: string[], fn: (w: Widget) => Widget, record = true) => {
        const set = new Set(ids)
        change((s) => ({ ...s, widgets: s.widgets.map((w) => (set.has(w.id) ? fn(w) : w)) }), record)
      },
      updateStyle: (ids: string[], patch: Partial<WidgetStyle>, record = true) => {
        const set = new Set(ids)
        change(
          (s) => ({
            ...s,
            widgets: s.widgets.map((w) => (set.has(w.id) ? { ...w, style: { ...w.style, ...patch } } : w)),
          }),
          record,
        )
      },
      removeWidgets: (ids: string[]) => {
        const set = new Set(ids)
        change((s) => ({ ...s, widgets: s.widgets.filter((w) => !set.has(w.id)) }))
      },
      duplicateWidgets: (source: Widget[]) => {
        const groupMap = new Map<string, string>()
        const copies = source.map((w) => {
          let groupId: string | null = null
          if (w.groupId) {
            if (!groupMap.has(w.groupId)) groupMap.set(w.groupId, nanoid(8))
            groupId = groupMap.get(w.groupId) ?? null
          }
          return { ...structuredClone(w), id: nanoid(10), x: w.x + 40, y: w.y + 40, groupId, locked: false }
        })
        change((s) => ({ ...s, widgets: [...s.widgets, ...copies] }))
        dispatch({ type: 'select', ids: copies.map((c) => c.id) })
      },
      reorder: (id: string, direction: 'up' | 'down' | 'top' | 'bottom') =>
        change((s) => {
          const list = [...s.widgets]
          const index = list.findIndex((w) => w.id === id)
          if (index < 0) return s
          const [item] = list.splice(index, 1)
          const target =
            direction === 'top'
              ? list.length
              : direction === 'bottom'
                ? 0
                : direction === 'up'
                  ? Math.min(list.length, index + 1)
                  : Math.max(0, index - 1)
          list.splice(target, 0, item)
          return { ...s, widgets: list }
        }),
      group: (ids: string[]) => {
        const groupId = nanoid(8)
        const set = new Set(ids)
        change((s) => ({ ...s, widgets: s.widgets.map((w) => (set.has(w.id) ? { ...w, groupId } : w)) }))
      },
      ungroup: (ids: string[]) => {
        const set = new Set(ids)
        change((s) => ({ ...s, widgets: s.widgets.map((w) => (set.has(w.id) ? { ...w, groupId: null } : w)) }))
      },
    }),
    [change],
  )

  return { state, dirty: state.version !== state.savedVersion, ...actions }
}

export type EditorApi = ReturnType<typeof useEditor>
