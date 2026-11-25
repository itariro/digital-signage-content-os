import type { Album, CanvasScene, DeploymentAlbum } from '@/lib/types'

const DEFAULT_CROSSFADE_MS = 400

/** The exact album snapshot a deploy writes and the status hash compares. */
export function deploymentAlbumFromLibrary(album: Album): DeploymentAlbum {
  return {
    id: album.id,
    name: album.name,
    scenes: (album.scenes ?? []).filter((scene) => scene.enabled) as CanvasScene[],
    order: album.slideshow.order,
    crossfadeMs: album.slideshow.canvas?.crossfadeMs ?? DEFAULT_CROSSFADE_MS,
  }
}
