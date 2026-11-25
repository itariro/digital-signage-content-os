import { NextResponse } from 'next/server'
import { resolveActor } from '@/lib/http-auth'
import type { CanvasFailure } from '@/lib/canvas/service'

export function consoleOnlyViolation(): NextResponse | null {
  if (!process.env.INSTANCE_ID) return null
  return NextResponse.json(
    { error: 'Canvas management is console only', code: 'E_CONSOLE_ONLY' },
    { status: 403 },
  )
}

export async function canvasActor(request: Request): Promise<
  { ok: true; actor: string } | { ok: false; response: NextResponse }
> {
  const violation = consoleOnlyViolation()
  if (violation) return { ok: false, response: violation }
  const outcome = await resolveActor(request)
  if (!outcome.ok) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: outcome.reason },
        { status: outcome.reason === 'misconfigured' ? 500 : 401 },
      ),
    }
  }
  return { ok: true, actor: outcome.actor }
}

export function canvasErrorResponse(failure: CanvasFailure): NextResponse {
  const status = failure.code === 'E_FRAME_IN_USE'
    ? 409
    : failure.code === 'E_NOT_FOUND'
      ? 404
      : 422
  return NextResponse.json(
    { error: failure.error, code: failure.code, details: failure.details ?? null },
    { status },
  )
}
