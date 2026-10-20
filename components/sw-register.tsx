'use client'
import { useEffect } from 'react'

export function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((e: unknown) => console.warn('sw registration failed:', e))
    }
  }, [])
  return null
}
