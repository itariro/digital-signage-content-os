'use client'

import type { DisplayDecision, ExperienceContext } from '@/lib/types'

export function DecisionDebug({ decision, context }: { decision: DisplayDecision | null; context: ExperienceContext | null }) {
  if (!decision) return null
  const rows: [string, string][] = [
    ['Reason', decision.reason],
    ['Rule', decision.ruleId ?? 'none (fallback)'],
    ['Layout', decision.layoutId],
    ['Bob', decision.bob?.expression ?? 'none'],
    ['Score', String(decision.score)],
    ['Priority', String(decision.priority)],
    ['Period', context?.period ?? 'unknown'],
    ['Generated', decision.generatedAt],
  ]
  return (
    <div className="pointer-events-none absolute bottom-3 left-3 z-50 max-w-md rounded-lg bg-black/75 p-3 font-mono text-[11px] leading-relaxed text-white shadow-lg">
      <p className="mb-1 font-semibold uppercase tracking-wider text-white/60">Why am I seeing this?</p>
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <span className="text-white/60">{label}</span>
          <span className="truncate">{value}</span>
        </div>
      ))}
    </div>
  )
}
