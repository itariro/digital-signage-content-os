'use client'

import { SignInButton, SignUpButton, Show, UserButton } from '@clerk/nextjs'
import { Frame } from 'lucide-react'

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
              <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Sign in</button>
            </SignInButton>
            <SignUpButton mode="modal">
              <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Get started
              </button>
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
              <button className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
                Start building
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="rounded-md border border-border px-6 py-3 text-sm font-semibold text-foreground hover:bg-secondary">
                Sign in
              </button>
            </SignInButton>
          </Show>
          <Show when="signed-in">
            <a href="/" className="rounded-md bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Open studio
            </a>
          </Show>
        </div>

        <div className="mt-16 grid w-full grid-cols-1 gap-4 sm:grid-cols-3">
          {[
            { k: 'Local-first', v: 'Runs on the device. Works offline.' },
            { k: 'Multi-frame', v: 'One console for your whole fleet.' },
            { k: 'Synced', v: 'Durable, idempotent, conflict-aware.' },
          ].map((f) => (
            <div key={f.k} className="rounded-lg border border-border/60 bg-card/40 p-5 backdrop-blur">
              <div className="font-mono text-xs uppercase tracking-widest text-primary">{f.k}</div>
              <div className="mt-2 text-sm text-muted-foreground">{f.v}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
