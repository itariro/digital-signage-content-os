'use client'

import { Download, Frame, Loader2, Moon, Play, Redo2, Sun, Undo2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { EditorApi } from '@/hooks/use-editor'
import { IconButton } from './controls'
import { cn } from '@/lib/utils'
import { FrameSwitcher } from './frame-switcher'

type TopBarProps = {
  editor: EditorApi
  isActive: boolean
  saving: boolean
  onSave: () => void
  onPreview: () => void
  onExport: () => void
}

export function TopBar({ editor, isActive, saving, onSave, onPreview, onExport }: TopBarProps) {
  const { state, dirty } = editor
  const [isDark, setIsDark] = useState(true)

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  function toggleTheme() {
    const nextIsDark = !isDark
    document.documentElement.classList.toggle('dark', nextIsDark)
    setIsDark(nextIsDark)
  }

  return (
    <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-card px-3 lg:px-4">
      <div className="flex items-center gap-2 pr-2">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Frame className="size-4" aria-hidden />
        </span>
        <div className="hidden items-baseline gap-1.5 sm:flex">
          <span className="text-sm font-semibold text-foreground">Frame Studio</span>
          <span className="text-[10px] font-medium text-muted-foreground" aria-label="Version 0.1.0">
            v0.1.0
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label htmlFor="layout-name" className="sr-only">
          Layout name
        </label>
        <input
          id="layout-name"
          value={state.name}
          maxLength={80}
          onFocus={() => editor.checkpoint()}
          onChange={(e) => editor.rename(e.target.value, false)}
          className="h-7 w-full min-w-0 max-w-64 rounded-sm bg-transparent px-2 text-sm font-medium text-foreground outline-none hover:bg-secondary focus-visible:bg-secondary"
        />
        {isActive && (
          <span className="hidden shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-medium text-primary md:inline">On frame</span>
        )}
      </div>

      <FrameSwitcher />

      <div className="flex items-center gap-0.5">
        <IconButton label="Undo (⌘Z)" onClick={editor.undo} disabled={state.past.length === 0}>
          <Undo2 className="size-4" />
        </IconButton>
        <IconButton label="Redo (⇧⌘Z)" onClick={editor.redo} disabled={state.future.length === 0}>
          <Redo2 className="size-4" />
        </IconButton>
        <IconButton label="Export layout JSON" onClick={onExport} className="hidden sm:flex">
          <Download className="size-4" />
        </IconButton>
      </div>

      <button
        type="button"
        onClick={toggleTheme}
        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
      </button>
      <button
        type="button"
        onClick={onPreview}
        className="flex h-8 items-center gap-1.5 rounded-lg bg-secondary px-3 text-sm font-medium text-foreground hover:bg-secondary/70"
      >
        <Play className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Preview</span>
      </button>
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className={cn(
          'relative flex h-8 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-50',
        )}
      >
        {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
        {dirty ? 'Save' : 'Saved'}
        {dirty && !saving && <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-card" aria-label="Unsaved changes" />}
      </button>
    </header>
  )
}
