import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ frames: [] as unknown }))

vi.mock('swr', () => ({
  default: () => ({ data: state.frames, mutate: vi.fn() }),
}))

// Base UI keeps closed popover content unmounted; force it open so the frame
// list is part of the render tree, as it is when a user opens the switcher.
vi.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
  PopoverContent: ({ children }: { children: React.ReactNode }) => createElement('div', null, children),
}))

import { fetchFrames, FrameSwitcher } from '@/components/editor/frame-switcher'

function render() {
  return renderToStaticMarkup(createElement(FrameSwitcher))
}

const frame = {
  id: 'home',
  name: 'Home',
  layoutId: null,
  layoutName: null,
  layouts: [],
  resolutionWidth: 1920,
  resolutionHeight: 1080,
  screenWidthMm: null,
  screenHeightMm: null,
}

function mockFetch(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }))
}

afterEach(() => {
  vi.unstubAllGlobals()
  state.frames = []
})

describe('FrameSwitcher frame list', () => {
  it('renders frames returned as an array', () => {
    state.frames = [frame]
    expect(render()).toContain('Home')
  })

  it('renders an empty list when /api/frames returns an error object', () => {
    state.frames = { error: 'not_found' }
    expect(() => render()).not.toThrow()
    expect(render()).not.toContain('not_found')
  })

  it('renders an empty list when /api/frames returns null', () => {
    state.frames = null
    expect(() => render()).not.toThrow()
  })
})

describe('fetchFrames', () => {
  it('returns the frame array from a successful response', async () => {
    mockFetch(200, [frame])
    await expect(fetchFrames('/api/frames')).resolves.toEqual([frame])
  })

  it('rejects an error payload instead of passing it to the component', async () => {
    mockFetch(404, { error: 'not_found' })
    await expect(fetchFrames('/api/frames')).rejects.toThrow('HTTP 404')
  })

  it('rejects a successful response that is not an array', async () => {
    mockFetch(200, { frames: [frame] })
    await expect(fetchFrames('/api/frames')).rejects.toThrow('Unexpected frames response')
  })
})
