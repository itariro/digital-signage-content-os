'use client'

import { useState } from 'react'
import { CircleAlert, CircleCheck, CircleDashed, LoaderCircle } from 'lucide-react'
import type { TraceStep, TraceStepStatus } from '@/lib/map-art'
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from '@/components/ui/trace'

function StatusIcon({ status }: { status?: TraceStepStatus }) {
  if (status === 'error') return <CircleAlert className="text-destructive" />
  if (status === 'pending') return <CircleDashed className="text-muted-foreground" />
  if (status === 'running') return <LoaderCircle className="animate-spin" />
  return <CircleCheck className="text-primary" />
}

function StepLine({ step }: { step: TraceStep }) {
  const total = step.children?.length ?? 0
  const done = step.children?.filter((child) => !child.status).length ?? 0
  return (
    <TraceLine status={step.status}>
      <TraceIcon><StatusIcon status={step.status} /></TraceIcon>
      <TraceTitle>{step.title}</TraceTitle>
      {step.description && <TraceDescription>{step.description}</TraceDescription>}
      {total > 0 && <TraceDescription className="tabular-nums">{done}/{total}</TraceDescription>}
    </TraceLine>
  )
}

function TraceStepItem({ step }: { step: TraceStep }) {
  const [initiallyOpen] = useState(() => step.status === 'running')
  if (!step.detail && !step.children?.length) return <StepLine step={step} />

  return (
    <TraceCollapsible defaultOpen={initiallyOpen}>
      <TraceCollapsibleTrigger>
        <StepLine step={step} />
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        {step.detail && <p className="mb-2 text-xs text-muted-foreground">{step.detail}</p>}
        {step.children?.length ? <TraceSteps steps={step.children} /> : null}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

// Nested levels render just the steps — the card chrome appears once at the top.
function TraceSteps({ steps }: { steps: TraceStep[] }) {
  return (
    <Trace className="gap-1">
      {steps.map((step) => <TraceStepItem key={step.id} step={step} />)}
    </Trace>
  )
}

export function GenerationTrace({ steps }: { steps: TraceStep[] }) {
  return (
    <div aria-live="polite" className="w-full">
      {steps.length ? (
        <section aria-label="Activity" className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Activity</p>
          <TraceSteps steps={steps} />
        </section>
      ) : null}
    </div>
  )
}
