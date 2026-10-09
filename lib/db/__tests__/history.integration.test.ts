import { describe, it, expect, beforeAll, afterAll } from 'vitest'

const hasDb = Boolean(process.env.DATABASE_URL)
const suite = hasDb ? describe : describe.skip

suite('display_history integration', () => {
  const frameId = `test-frame-${Date.now()}`
  let recordDecision: typeof import('../index').recordDecision
  let queryHistory: typeof import('../index').queryHistory

  beforeAll(async () => {
    ;({ recordDecision, queryHistory } = await import('../index'))
  })

  afterAll(async () => {
    const { getDb } = await import('../index')
    const { displayHistory } = await import('../schema')
    const { eq } = await import('drizzle-orm')
    await getDb().delete(displayHistory).where(eq(displayHistory.frameId, frameId))
  })

  it('appends a decision once within the same minute (idempotent)', async () => {
    const decision = { id: 'decision-1', layoutId: 'l1', ruleId: 'r1', score: 120 }
    const at = new Date('2026-10-08T10:15:42.000Z')
    await recordDecision(frameId, decision, at)
    await recordDecision(frameId, decision, at)
    const summary = await queryHistory(frameId, at, 120 * 60 * 1000)
    expect(summary.recent.filter(r => r.layoutId === 'l1')).toHaveLength(1)
    expect(summary.latestLayoutId).toBe('l1')
  })

  it('excludes layouts older than the retention window from novelty', async () => {
    const decision = { id: 'decision-old', layoutId: 'l-old', ruleId: 'r1', score: 10 }
    const at = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    await recordDecision(frameId, decision, at)
    const summary = await queryHistory(frameId, new Date(), 120 * 60 * 1000)
    expect(summary.seenLayouts.has('l-old')).toBe(false)
  })
})
