'use client'

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
  if (status === 'error') return <CircleAlert />
  if (status === 'pending') return <CircleDashed />
  if (status === 'running') return <LoaderCircle className="animate-spin" />
  return <CircleCheck />
}

function StepLine({ step }: { step: TraceStep }) {
  return (
    <TraceLine status={step.status}>
      <TraceIcon><StatusIcon status={step.status} /></TraceIcon>
      <TraceTitle>{step.title}</TraceTitle>
      {step.description && <TraceDescription>{step.description}</TraceDescription>}
      {step.children?.length ? <TraceDescription>{step.children.length} steps</TraceDescription> : null}
    </TraceLine>
  )
}

function TraceList({ steps }: { steps: TraceStep[] }) {
  return (
    <section aria-label="Generation activity" className="w-full rounded-lg border border-border bg-card p-3">
      <p className="mb-2 text-xs font-medium text-foreground">Generation activity</p>
      <Trace className="gap-1">
        {steps.map((step) => {
          const hasDetail = Boolean(step.detail || step.children?.length)
          if (!hasDetail) return <StepLine key={step.id} step={step} />
          return (
            <TraceCollapsible key={step.id} defaultOpen={step.status === 'running'}>
              <TraceCollapsibleTrigger>
                <StepLine step={step} />
              </TraceCollapsibleTrigger>
              <TraceCollapsibleContent>
                {step.detail && <p className="mb-2 text-xs text-muted-foreground">{step.detail}</p>}
                {step.children?.length ? <TraceList steps={step.children} /> : null}
              </TraceCollapsibleContent>
            </TraceCollapsible>
          )
        })}
      </Trace>
    </section>
  )
}

export function GenerationTrace({ steps }: { steps: TraceStep[] }) {
  return (
    <div aria-live="polite">
      {steps.length ? <TraceList steps={steps} /> : null}
    </div>
  )
}
