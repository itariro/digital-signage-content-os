import type { DisplayState, FrameNotification } from './types'

/** Maps the engine's display state onto main's notification variants. */
export function bobVariantFor(state: DisplayState): FrameNotification['variant'] {
  switch (state) {
    case 'celebration':
      return 'success'
    case 'reminder':
      return 'reminder'
    case 'action':
      return 'warning'
    default:
      return 'info'
  }
}
