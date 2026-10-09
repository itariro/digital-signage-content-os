import { createHash } from 'node:crypto'
import type { DisplayDecision, ExperienceContext, HistoryEntry } from './types'
import type { FrameStore } from '../types'
import { buildContext } from './context'
import { evaluateRules } from './evaluator'
import { scoreCandidates } from './scoring'
import { selectWinner } from './selector'
import { readStore } from '../store'
import { fetchWeather } from '../weather'
import { queryHistory, recordDecision, pruneHistory } from '../db'
import { clockParts, resolveDisplay } from '../schedule'

function log(level: 'info' | 'warn' | 'error', message: string, meta?: Record<string, unknown>) {
  console.log(JSON.stringify({ level, message, ...meta, timestamp: new Date().toISOString() }))
}

function decisionId(
  ruleId: string | null,
  layoutId: string,
  state: string,
  bobExpression?: string,
  bobSpeech?: string
): string {
  return createHash('sha256')
    .update(JSON.stringify([ruleId, layoutId, state, bobExpression ?? null, bobSpeech ?? null]))
    .digest('hex')
    .slice(0, 16)
}

/** The ambient decision returned when no experience rule matches. */
function fallbackDecision(layoutId: string, time: Date): DisplayDecision {
  return {
    id: decisionId(null, layoutId, 'ambient'),
    state: 'ambient',
    layoutId,
    bob: null,
    priority: 0,
    score: 0,
    reason: 'Schedule',
    ruleId: null,
    durationMs: 0,
    generatedAt: time.toISOString(),
  }
}

export interface GetDecisionOptions {
  simulatedTime?: Date
  /** When false, skip appending to display_history. Defaults to true. */
  recordHistory?: boolean
}

export interface GetDecisionResult {
  decision: DisplayDecision
  context: ExperienceContext
  store: FrameStore
}

export async function getDecision(
  frameId: string,
  now: Date = new Date(),
  options?: GetDecisionOptions
): Promise<GetDecisionResult> {
  const store = await readStore(frameId)
  if (!store) throw new Error(`Frame "${frameId}" not found`)

  const time = options?.simulatedTime || now
  const timezone = store.experiences.settings.timezone

  const layout = store.layouts.find(l => l.id === store.activeId) || store.layouts[0]
  const weather = layout
    ? await fetchWeather(layout.settings.lat, layout.settings.lon, layout.settings.units)
    : undefined

  const context = buildContext(store, time, weather)

  if (!store.experiences.enabled) {
    await pruneHistorySafely(frameId)
    return { decision: fallbackDecision(resolveFallbackLayout(store, time, timezone), time), context, store }
  }

  const layoutIds = new Set(store.layouts.map(l => l.id))
  const eligibleRules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  const evaluated = evaluateRules(eligibleRules, context)

  let history: HistoryEntry[] = []
  try {
    history = await queryHistory(frameId)
  } catch (error) {
    log('error', 'Failed to query history', { frameId, error: String(error) })
  }

  const scored = scoreCandidates(evaluated.map(e => e.rule), history, '')
  const winner = selectWinner(scored)

  if (!winner) {
    await pruneHistorySafely(frameId)
    return { decision: fallbackDecision(resolveFallbackLayout(store, time, timezone), time), context, store }
  }

  const rule = winner.rule
  const decision: DisplayDecision = {
    id: decisionId(rule.id, rule.then.layoutId, rule.then.state, rule.then.bob?.expression, rule.then.bob?.speech),
    state: rule.then.state,
    layoutId: rule.then.layoutId,
    bob: rule.then.bob,
    priority: rule.priority,
    score: winner.score,
    reason: rule.then.reason || rule.name,
    ruleId: rule.id,
    durationMs: rule.then.durationMs,
    generatedAt: time.toISOString(),
  }

  if (options?.recordHistory !== false) {
    try {
      // Prune and append run in one transaction (spec §5.2).
      await recordDecision(frameId, decision, new Date())
    } catch (error) {
      log('error', 'Failed to record decision', { frameId, error: String(error) })
    }
  }

  return { decision, context, store }
}

/** Prunes expired history without letting a DB failure break the decision. */
async function pruneHistorySafely(frameId: string): Promise<void> {
  try {
    await pruneHistory(frameId)
  } catch (error) {
    log('error', 'Failed to prune history', { frameId, error: String(error) })
  }
}

/**
 * Resolves the ambient layout from the schedule, delegating to the same
 * resolution used by the display renderer (`resolveDisplay`) so overnight
 * windows, deleted layouts, and timezones behave consistently.
 */
function resolveFallbackLayout(store: FrameStore, time: Date, timezone?: string): string {
  const resolved = resolveDisplay(store, clockParts(time, timezone))
  return resolved.layout?.id ?? store.activeId ?? ''
}
