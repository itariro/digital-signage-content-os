'use client'

import { useSyncExternalStore } from 'react'

let current = Date.now()
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!timer) {
    current = Date.now()
    timer = setInterval(() => {
      current = Date.now()
      listeners.forEach((l) => l())
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && timer) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

export function useNow(): Date | null {
  const value = useSyncExternalStore(
    subscribe,
    () => current,
    () => 0,
  )
  return value === 0 ? null : new Date(value)
}
