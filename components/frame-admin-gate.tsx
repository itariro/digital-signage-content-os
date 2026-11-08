'use client'

import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'

type View = 'loading' | 'unavailable' | 'unconfigured' | 'signed-out' | 'signed-in'
type SessionStatus = { configured: boolean; authenticated: boolean }

function isSessionStatus(value: unknown): value is SessionStatus {
  return typeof value === 'object'
    && value !== null
    && 'configured' in value
    && typeof value.configured === 'boolean'
    && 'authenticated' in value
    && typeof value.authenticated === 'boolean'
}

export function FrameAdminGate({
  enabled,
  children,
}: {
  enabled: boolean
  children: ReactNode
}) {
  const [view, setView] = useState<View>(enabled ? 'loading' : 'signed-in')
  const [statusError, setStatusError] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [busy, setBusy] = useState(false)

  const checkSession = useCallback(async () => {
    setView('loading')
    setStatusError('')
    try {
      const response = await fetch('/api/admin/session', {
        cache: 'no-store',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error(`Session check failed (HTTP ${response.status}).`)
      const result: unknown = await response.json()
      if (!isSessionStatus(result)) throw new Error('Invalid frame session response.')
      setView(!result.configured ? 'unconfigured' : result.authenticated ? 'signed-in' : 'signed-out')
    } catch (error) {
      setStatusError(error instanceof Error ? error.message : 'Unable to check frame sign-in.')
      setView('unavailable')
    }
  }, [])

  useEffect(() => {
    if (enabled) void checkSession()
  }, [enabled, checkSession])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setLoginError('')
    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password }),
      })
      if (response.ok) {
        setView('signed-in')
      } else if (response.status === 429) {
        const seconds = response.headers.get('retry-after')
        setLoginError(`Too many attempts. Try again${seconds ? ` in ${seconds} seconds` : ' later'}.`)
      } else if (response.status === 401) {
        setLoginError('Incorrect password.')
      } else {
        setLoginError(`Sign-in failed (HTTP ${response.status}).`)
      }
    } catch {
      setLoginError('Unable to reach the frame. Check the connection and try again.')
    } finally {
      setPassword('')
      setBusy(false)
    }
  }

  if (!enabled || view === 'signed-in') return children

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="self-center font-medium">Digital Signage</div>
        {view === 'loading' && <p role="status">Checking frame access...</p>}
        {view === 'unavailable' && (
          <Card>
            <CardHeader>
              <CardTitle>Unable to check sign-in</CardTitle>
              <CardDescription>{statusError}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => void checkSession()}>Try again</Button>
            </CardContent>
          </Card>
        )}
        {view === 'unconfigured' && (
          <Card>
            <CardHeader>
              <CardTitle>Frame password not configured</CardTitle>
              <CardDescription>Set a local password on the frame to edit content.</CardDescription>
            </CardHeader>
            <CardContent>
              <FieldDescription>
                Run <code>sudo kiosk-ctl password &lt;password&gt;</code> on the frame, then reload this page.
              </FieldDescription>
            </CardContent>
          </Card>
        )}
        {view === 'signed-out' && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>Sign in to manage this frame.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={submit}>
                <FieldGroup>
                  <Field data-invalid={loginError ? 'true' : undefined}>
                    <FieldLabel htmlFor="frame-admin-password">Password</FieldLabel>
                    <Input
                      autoComplete="current-password"
                      id="frame-admin-password"
                      onChange={(event) => setPassword(event.currentTarget.value)}
                      required
                      type="password"
                      value={password}
                      aria-invalid={Boolean(loginError)}
                    />
                    {loginError && <FieldError>{loginError}</FieldError>}
                  </Field>
                  <Field>
                    <Button disabled={busy} type="submit">
                      {busy ? 'Signing in...' : 'Sign in'}
                    </Button>
                  </Field>
                </FieldGroup>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
