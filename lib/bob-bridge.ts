import { nanoid } from 'nanoid'
import type { BobExpression, DisplayDecision, DisplayState, FrameNotification, FrameStore } from './types'
import { normalizeFrameNotifications } from './notifications'
import { createTtlCache } from './ttl-cache'
import { getDecision, log } from './engine/state'
import { mutateStore } from './store'

export const BOB_NOTIFICATION_EVENT_PREFIX = 'bob:'
export const DEFAULT_BOB_THROTTLE_MS = 60_000

/**
 * Maps the engine's display state onto main's notification variants.
 * A 'reminder' bob expression takes precedence: DisplayState has no
 * 'reminder' member, but reminder-like Bob content should use the
 * reminder variant (longest non-error duration, reminder icon).
 */
export function bobVariantFor(state: DisplayState, expression?: BobExpression): FrameNotification['variant'] {
  if (expression === 'reminder') return 'reminder'
  switch (state) {
    case 'celebration':
      return 'success'
    case 'action':
      return 'warning'
    default:
      return 'info'
  }
}

export interface BobBridgeDeps {
  getDecision: (frameId: string) => Promise<{ decision: DisplayDecision; store: FrameStore }>
  mutateStore: (fn: (store: FrameStore) => FrameStore | void, frameId: string) => Promise<FrameStore>
  now?: () => number
  throttleMs?: number
}

/**
 * Drives the Bob engine for live frames. Frames poll /api/store every ~3s; the
 * route calls tick(frameId) without awaiting. The tick is throttled and
 * single-flight per frame so display_history is written at roughly the cadence
 * the engine was designed for, and publishes bob.speech as a frame
 * notification once per decision change (deduped client-side by eventKey).
 */
export function createBobBridge(deps: BobBridgeDeps) {
  const now = deps.now ?? (() => Date.now())
  const throttle = createTtlCache<boolean>(deps.throttleMs ?? DEFAULT_BOB_THROTTLE_MS, now)
  const inFlight = new Set<string>()
  const lastPublishedDecisionId = new Map<string, string>()

  async function tick(frameId: string): Promise<void> {
    if (inFlight.has(frameId)) return
    if (throttle.get(frameId)) return
    inFlight.add(frameId)
    throttle.set(frameId, true)
    try {
      const { decision, store } = await deps.getDecision(frameId)
      const speech = decision.bob?.speech?.trim()
      if (!speech) return
      if (lastPublishedDecisionId.get(frameId) === decision.id) return

      const ruleName = store.experiences.rules.find((r) => r.id === decision.ruleId)?.name
      const notification: FrameNotification = {
        id: nanoid(12),
        title: ruleName ?? decision.reason,
        message: speech,
        variant: bobVariantFor(decision.state, decision.bob?.expression),
        durationMs: decision.durationMs,
        createdAt: new Date(now()).toISOString(),
        eventKey: `${BOB_NOTIFICATION_EVENT_PREFIX}${decision.ruleId}`,
      }
      await deps.mutateStore(
        (current) => ({
          ...current,
          notifications: normalizeFrameNotifications([notification, ...(current.notifications ?? [])]).slice(0, 20),
        }),
        frameId,
      )
      // Only remember success: a failed publish is retried on the next tick.
      lastPublishedDecisionId.set(frameId, decision.id)
    } catch (error) {
      log('error', 'Bob bridge tick failed', { frameId, error: String(error) })
    } finally {
      inFlight.delete(frameId)
    }
  }

  return { tick }
}

const defaultBridge = createBobBridge({
  // The real getDecision also returns context; the bridge only needs decision + store.
  getDecision: (frameId) => getDecision(frameId),
  mutateStore,
})

/** Fire-and-forget engine tick for a frame; the returned promise never rejects. */
export function tickBobEngine(frameId: string): Promise<void> {
  return defaultBridge.tick(frameId)
}
