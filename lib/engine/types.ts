import type { ExperienceRule } from '../types'

export type {
  Weekday,
  DisplayState,
  BobExpression,
  Condition,
  ExperienceRule,
  ExperienceSettings,
  Experiences,
  DisplayDecision,
  ExperienceContext,
} from '../types'

export interface ScoredCandidate {
  rule: ExperienceRule
  score: number
  layoutId: string
}

export interface HistoryEntry {
  layoutId: string
  ruleId: string | null
  shownAt: Date
}

export interface HistorySummary {
  /** Shows within the repetition/duration window. */
  recent: HistoryEntry[]
  /** Layout ids seen within the novelty retention window. */
  seenLayouts: Set<string>
  /** The most recently shown layout, or null when history is empty. */
  latestLayoutId: string | null
}
