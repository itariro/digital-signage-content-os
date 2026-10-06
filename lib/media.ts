import path from 'node:path'
import { DATA_DIR } from './store'

export const MEDIA_DIR = path.join(DATA_DIR, 'media')

export const MEDIA_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const EXT_TYPES: Record<string, string> = Object.fromEntries(
  Object.entries(MEDIA_TYPES).map(([type, ext]) => [ext, type]),
)
