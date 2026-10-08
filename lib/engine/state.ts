import { createHash } from 'node:crypto'
import type { DisplayDecision, ExperienceContext, HistoryEntry } from './types'
import type { FrameStore } from '../types'
import { buildContext } from './context'
import { evaluateRules } from './evaluator'
import { scoreCandidates } from './scoring'
import { selectWinner } from './selector'
import { readStore } from '../store'
import { fetchWeather } from '../weather'
import { queryHistory, appendHistory, pruneHistory } from '../db'

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

  const layout = store.layouts.find(l => l.id === store.activeId) || store.layouts[0]
  const weather = layout
    ? await fetchWeather(layout.settings.lat, layout.settings.lon, layout.settings.units)
    : undefined

  const context = buildContext(store, time, weather)

  // Retention pruning runs on every decision request so the table stays bounded.
  try {
    await pruneHistory(frameId)
  } catch (error) {
    console.error('[state] Failed to prune history:', error)
  }

  if (!store.experiences.enabled) {
    return { decision: fallbackDecision(resolveFallbackLayout(store), time), context, store }
  }

  const layoutIds = new Set(store.layouts.map(l => l.id))
  const eligibleRules = store.experiences.rules.filter(r => layoutIds.has(r.then.layoutId))
  const evaluated = evaluateRules(eligibleRules, context)

  let history: HistoryEntry[] = []
  try {
    history = await queryHistory(frameId)
  } catch (error) {
    console.error('[state] Failed to query history:', error)
  }

  const scored = scoreCandidates(evaluated.map(e => e.rule), history, '')
  const winner = selectWinner(scored)

  if (!winner) {
    return { decision: fallbackDecision(resolveFallbackLayout(store), time), context, store }
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

  try {
    await appendHistory(frameId, decision.id, decision.layoutId, new Date(), decision.score)
  } catch (error) {
    console.error('[state] Failed to append history:', error)
  }

  return { decision, context, store }
}

function resolveFallbackLayout(store: FrameStore): string {
  if (store.schedule.enabled && store.schedule.rules.length > 0) {
    const now = new Date()
    const day = now.getDay()
    const minutes = now.getHours() * 60 + now.getMinutes()
    for (const rule of store.schedule.rules) {
      if (!rule.days.includes(day)) continue
      const [startH, startM] = rule.start.split(':').map(Number)
      const [endH, endM] = rule.end.split(':').map(Number)
      const start = startH * 60 + startM
      const end = endH * 60 + endM
      if (start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end) {
        return rule.layoutId
      }
    }
  }
  return store.activeId || store.layouts[0]?.id || ''
}
