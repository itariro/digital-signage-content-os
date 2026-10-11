import { nanoid } from 'nanoid'
import type { BobExpression, DisplayDecision, DisplayState, FrameNotification, FrameStore } from './types'
import { BOB_EVENT_KEY_PREFIX, NOTIFICATION_DEFAULT_DURATION, clampNotificationDuration, normalizeFrameNotifications, notificationKey } from './notifications'
import { createTtlCache } from './ttl-cache'
import { getDecision, log } from './engine/state'
import { mutateStore } from './store'

export const DEFAULT_BOB_THROTTLE_MS = 60_000

/**
 * Floor for a Bob speech card's on-screen time. The bridge publishes at most
 * once per throttle window (60s), so a card that expires sooner leaves a long
 * dead gap before the next tick can re-publish it. Floored to ~25s, a matching
 * rule's speech is present a little under half the time instead of flashing.
 */
export const BOB_CARD_MIN_DURATION_MS = 25_000

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
  const counters = { ticks: 0, throttleSkips: 0, inflightSkips: 0, evaluations: 0, publishes: 0, failures: 0 }
  let lastTickAt: number | null = null

  async function tick(frameId: string): Promise<void> {
    counters.ticks++
    lastTickAt = now()
    if (inFlight.has(frameId)) {
      counters.inflightSkips++
      return
    }
    if (throttle.get(frameId)) {
      counters.throttleSkips++
      return
    }
    inFlight.add(frameId)
    throttle.set(frameId, true)
    try {
      const { decision, store } = await deps.getDecision(frameId)
      counters.evaluations++
      const speech = decision.bob?.speech?.trim()
      if (!speech) return

      const ruleName = store.experiences.rules.find((r) => r.id === decision.ruleId)?.name
      // Bob card durations are floored to a display minimum (a rule's durationMs
      // is the engine's dwell window, often 0 for new rules, not a display
      // preference), kept above the variant default so the card is never a
      // flash, and clamped to the renderer's maximum.
      const variant = bobVariantFor(decision.state, decision.bob?.expression)
      const durationMs = clampNotificationDuration(
        Math.max(decision.durationMs, NOTIFICATION_DEFAULT_DURATION[variant], BOB_CARD_MIN_DURATION_MS),
      )
      const notification: FrameNotification = {
        id: nanoid(12),
        title: ruleName?.trim() || decision.reason,
        message: speech,
        variant,
        durationMs,
        createdAt: new Date(now()).toISOString(),
        eventKey: `${BOB_EVENT_KEY_PREFIX}${decision.ruleId}`,
      }
      // The same winning decision keeps its id; once the published card has
      // expired, re-publish it so the speech reappears on the next tick while
      // the rule matches (client replaces the card by identical eventKey, so
      // nothing stacks and re-publishing identical content is invisible).
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
      counters.publishes++
    } catch (error) {
      counters.failures++
      log('error', 'Bob bridge tick failed', { frameId, error: String(error) })
    } finally {
      inFlight.delete(frameId)
    }
  }

  return {
    tick,
    stats: () => ({ ...counters, lastTickAt: lastTickAt === null ? null : new Date(lastTickAt).toISOString() }),
  }
}

const defaultBridge = createBobBridge({
  // The real getDecision also returns context; the bridge only needs decision + store.
  getDecision: (frameId) => getDecision(frameId, undefined, { selection: 'notification' }),
  mutateStore,
})

/** Fire-and-forget engine tick for a frame; the returned promise never rejects. */
export function tickBobEngine(frameId: string): Promise<void> {
  return defaultBridge.tick(frameId)
}

/** Diagnostics for /api/health: counters plus the last tick time. */
export function getBobBridgeStats() {
  return defaultBridge.stats()
}
