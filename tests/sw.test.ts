import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import vm from 'node:vm'

// Task 11 — the shipped public/sw.js must never serve /api/* from cache
// (H3: cache-first API responses bricked displays), must network-first
// navigations with an offline shell fallback, and must DELETE old-version
// caches on activate so already-bricked kiosks recover.
// The real script is executed against a mocked ServiceWorker scope.

interface MockScope {
  listeners: Record<string, (e: any) => void>
  caches: { open: (n: string) => Promise<any>; keys: () => Promise<string[]>; delete: (n: string) => Promise<boolean>; deleted: string[] }
  cachesMap: Map<string, Map<string, Response>>
  skipWaiting: () => Promise<void>
  clients: { claim: () => Promise<void> }
  fetch: (input?: any, init?: any) => Promise<Response>
  addEventListener: (type: string, fn: (e: any) => void) => void
}

function makeScope(): MockScope {
  const cachesMap = new Map<string, Map<string, Response>>()
  const abs = (key: string) => new URL(key, 'http://frame.test').toString()
  const scope: any = {
    listeners: {},
    caches: {
      deleted: [] as string[],
      open: async (name: string) => {
        if (!cachesMap.has(name)) cachesMap.set(name, new Map())
        const store = cachesMap.get(name)!
        return {
          put: async (req: any, res: any) => { store.set(abs(String(req.url ?? req)), res) },
          match: async (req: any) => store.get(abs(String(req.url ?? req))),
          addAll: async (urls: string[]) => { for (const u of urls) store.set(abs(u), new Response('shell')) },
          keys: async () => [...store.entries()].map(([url]) => new Request(url)),
          delete: async (req: any) => store.delete(abs(String(req.url ?? req))),
        }
      },
      keys: async () => [...cachesMap.keys()],
      delete: async (name: string) => { cachesMap.delete(name); scope.caches.deleted.push(name); return true },
    },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
    fetch: async () => { throw new Error('network down') },
    addEventListener: (type: string, fn: (e: any) => void) => { scope.listeners[type] = fn },
  }
  scope.cachesMap = cachesMap
  return scope as unknown as MockScope
}

function runSw(scope: MockScope) {
  const src = fs.readFileSync('public/sw.js', 'utf8')
  const ctx = vm.createContext({
    self: scope,
    addEventListener: scope.addEventListener,
    // late-bound so tests can swap scope.fetch after creation
    fetch: (input: any, init?: any) => scope.fetch(input, init),
    caches: scope.caches,
    skipWaiting: () => scope.skipWaiting(),
    clients: scope.clients,
    Response, Request, URL, console, setTimeout, Promise,
  })
  vm.runInContext(src, ctx)
  return ctx
}

function fire(scope: MockScope, event: any) {
  return new Promise<Response>((resolve) => {
    event.respondWith = (p: Promise<Response>) => resolve(p)
    scope.listeners.fetch(event)
  })
}

describe('service worker strategy', () => {
  it('serves /api from network even when a copy sits in the cache', async () => {
    const scope = makeScope()
    runSw(scope)
    await scope.listeners.install({ waitUntil: (p: Promise<any>) => p })
    const url = new URL('/api/store', 'http://frame.test').toString()
    // poison every cache the worker knows about with a stale API copy
    for (const store of scope.cachesMap.values()) {
      store.set(url, new Response(JSON.stringify({ stale: true })))
    }
    scope.fetch = async () => new Response(JSON.stringify({ fresh: true }))
    const res = await fire(scope, { request: new Request(url, { method: 'GET' }), ...{} })
    expect(await res.json()).toEqual({ fresh: true })
  })

  it('deletes old-version caches on activate (bricked-kiosk recovery)', async () => {
    const scope = makeScope()
    runSw(scope)
    scope.cachesMap.set('frame-v1', new Map([[new URL('/api/store', 'http://frame.test').toString(), new Response('poisoned')]]))
    const waiters: Promise<any>[] = []
    await scope.listeners.activate({ waitUntil: (p: Promise<any>) => { waiters.push(p) }, ...{} })
    await Promise.all(waiters)
    expect(scope.cachesMap.has('frame-v1')).toBe(false)
  })

  it('navigation falls back to the cached shell when offline', async () => {
    const scope = makeScope()
    runSw(scope)
    const ev: any = { waitUntil: () => {} }
    await scope.listeners.install(ev)
    scope.fetch = async () => { throw new Error('offline') }
    const navReq = new Request('http://frame.test/frame', { headers: { accept: 'text/html' } })
    Object.defineProperty(navReq, 'mode', { value: 'navigate' })
    const res = await fire(scope, { request: navReq })
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('shell')
  })

  it('static assets use stale-while-revalidate', async () => {
    const scope = makeScope()
    runSw(scope)
    await scope.listeners.install({ waitUntil: () => {} })
    const url = new URL('/backgrounds/alpine-lake.png', 'http://frame.test').toString()
    scope.fetch = async () => new Response('v2')
    // prime
    await fire(scope, { request: new Request(url) })
    scope.fetch = async () => new Response('v3')
    const res = await fire(scope, { request: new Request(url) })
    expect(await res.text()).toBe('v2') // served from cache...
  })
})
