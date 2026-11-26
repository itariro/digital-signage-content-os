'use client'

import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/nextjs'
import { Frame } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export function Hero() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-background text-foreground">
      {/* atmospheric background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[40rem] w-[40rem] rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[30rem] w-[30rem] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.04] [background-image:linear-gradient(to_right,currentColor_1px,transparent_1px),linear-gradient(to_bottom,currentColor_1px,transparent_1px)] [background-size:64px_64px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-12">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Frame className="size-4" aria-hidden />
          </span>
          <span className="text-lg font-semibold tracking-tight [font-family:var(--font-bebas)]">mural</span>
        </div>
        <div className="flex items-center gap-3">
          <Show when="signed-out">
            <SignInButton mode="modal">
              <Button variant="ghost" size="lg">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="lg">Get started</Button>
            </SignUpButton>
          </Show>
          <Show when="signed-in">
            <UserButton />
          </Show>
        </div>
      </header>

      <section className="relative z-10 mx-auto flex max-w-6xl flex-col items-start gap-8 px-6 pt-20 lg:px-12 lg:pt-32">
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-primary">Digital signage, authored</p>
        <h1 className="text-5xl font-bold leading-[0.95] tracking-tight [font-family:var(--font-bebas)] sm:text-7xl lg:text-8xl">
          Build the screen <br />
          <span className="italic text-primary">your space deserves.</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          mural is a visual editor for ambient displays — layouts, widgets, albums, schedules, and live
          playback on any screen. Design once, run anywhere, online or off.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Show when="signed-out">
            <SignUpButton mode="modal">
              <Button size="lg">Start building</Button>
            </SignUpButton>
            <SignInButton mode="modal">
              <Button variant="outline" size="lg">Sign in</Button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <Button size="lg" render={<a href="/" />}>Open studio</Button>
          </Show>
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { k: 'Local-first', v: 'Runs on the device. Works offline.' },
            { k: 'Multi-frame', v: 'One console for your whole fleet.' },
            { k: 'Synced', v: 'Durable, idempotent, conflict-aware.' },
          ].map((f) => (
            <Card key={f.k} className="bg-card/40 backdrop-blur">
              <CardHeader>
                <CardTitle className="font-mono text-xs uppercase tracking-widest text-primary">{f.k}</CardTitle>
                <CardDescription>{f.v}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>
    </main>
  )
}
