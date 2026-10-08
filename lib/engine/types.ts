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
  shownAt: Date
}
