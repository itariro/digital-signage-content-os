import { nanoid } from 'nanoid'
import type { BobExpression, DisplayDecision, DisplayState, FrameNotification, FrameStore } from './types'
import { NOTIFICATION_DEFAULT_DURATION, clampNotificationDuration, normalizeFrameNotifications, notificationKey } from './notifications'
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
 * notification when a new decision wins — re-published each time the published
 * card expires (client replaces it by identical eventKey, so nothing stacks).
 */
export function createBobBridge(deps: BobBridgeDeps) {
  const now = deps.now ?? (() => Date.now())
  const throttle = createTtlCache<boolean>(deps.throttleMs ?? DEFAULT_BOB_THROTTLE_MS, now)
  const inFlight = new Set<string>()
  const lastPublishedDecisionId = new Map<string, string>()
  const lastPublishedAt = new Map<string, number>()

  async function tick(frameId: string): Promise<void> {
    if (inFlight.has(frameId)) return
    if (throttle.get(frameId)) return
    inFlight.add(frameId)
    throttle.set(frameId, true)
    try {
      const { decision, store } = await deps.getDecision(frameId)
      const speech = decision.bob?.speech?.trim()
      if (!speech) return

      const ruleName = store.experiences.rules.find((r) => r.id === decision.ruleId)?.name
      // Bob card durations are floored to the variant default (a rule's
      // durationMs is the engine's dwell window, often 0 for new rules, not a
      // display preference) and clamped to the renderer's maximum.
      const variant = bobVariantFor(decision.state, decision.bob?.expression)
      const durationMs = clampNotificationDuration(
        Math.max(decision.durationMs, NOTIFICATION_DEFAULT_DURATION[variant]),
      )
      const notification: FrameNotification = {
        id: nanoid(12),
        title: ruleName?.trim() || decision.reason,
        message: speech,
        variant,
        durationMs,
        createdAt: new Date(now()).toISOString(),
        eventKey: `${BOB_NOTIFICATION_EVENT_PREFIX}${decision.ruleId}`,
      }
      // The same winning decision keeps its id; once the published card has
      // expired, re-publish it so the speech stays on screen while the rule
      // matches (client replaces the card by identical eventKey, so nothing
      // stacks and re-publishing identical content is invisible).
      if (lastPublishedDecisionId.get(frameId) === decision.id) {
        const publishedAt = lastPublishedAt.get(frameId) ?? 0
        if (now() < publishedAt + durationMs) return
      }
      await deps.mutateStore(
        (current) => ({
          ...current,
          notifications: normalizeFrameNotifications([
            notification,
            ...(current.notifications ?? []).filter((n) => notificationKey(n) !== notification.eventKey),
          ]),
        }),
        frameId,
      )
      // Only remember success: a failed publish is retried on the next tick.
      lastPublishedDecisionId.set(frameId, decision.id)
      lastPublishedAt.set(frameId, now())
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
