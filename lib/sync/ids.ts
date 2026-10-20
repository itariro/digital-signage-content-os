// Mirrors lib/store DEFAULT_FRAME_ID; kept literal to avoid a store<->ids
// import cycle (both are only used at call time anyway).
const HOME_FRAME = 'home'

/**
 * Sync-boundary identity (final review C-2): a kiosk's primary frame is
 * 'home' locally but its console document is keyed by the instance id.
 * Translate in both directions at the queue/pull boundary so ownership
 * (entityId === instanceId) holds on the console.
 * INSTANCE_ID unset (dev single-console flows) leaves ids untouched.
 */
export function remoteEntityId(localFrameId: string): string {
  const instanceId = process.env.INSTANCE_ID
  if (instanceId && localFrameId === HOME_FRAME) return instanceId
  return localFrameId
}

export function localFrameId(entityId: string): string {
  const instanceId = process.env.INSTANCE_ID
  if (instanceId && entityId === instanceId) return HOME_FRAME
  return entityId
}
