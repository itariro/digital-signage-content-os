import type { CanvasConfig, CanvasScene, LayoutSettings } from '@/lib/types'

export const EMPTY_CANVAS_SETTINGS: LayoutSettings = {
  resolution: '1080x1920',
  background: '#000000',
  dim: 0,
  locationName: '',
  lat: 0,
  lon: 0,
  units: 'metric',
  snap: true,
  gridSize: 20,
  albumId: null,
}

export function emptyCanvasConfig(): CanvasConfig {
  return {
    arrangement: 'row',
    gap: 0,
    align: 'center',
    slots: [],
    background: '#000000',
    markers: 'identify',
    notifications: 'suppress',
    nightMode: 'inherit',
    maxFps: 30,
  }
}

export function emptySyncTestScene(id: string): CanvasScene {
  return {
    id,
    name: 'Sync test',
    enabled: true,
    durationSec: 30,
    seed: 1,
    type: 'sync-test',
    config: { periodSec: 4, showGrid: true, showBezels: true },
  }
}
