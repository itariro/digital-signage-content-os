import { ClerkProvider } from '@clerk/nextjs';
import { shadcn } from '@clerk/ui/themes'
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Instrument_Serif, Inter, JetBrains_Mono, Outfit, Playfair_Display, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SwRegister } from '@/components/sw-register'

const themeInit = `try {
  var theme = window.localStorage.getItem('mural-editor-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.classList.add(theme)
} catch (error) {
  console.warn('Could not read editor theme preference; using system theme:', error)
}`

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' })
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-bebas' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })
const hasClerk = Boolean(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)

export const metadata: Metadata = {
  title: 'mural · Lockscreen Editor',
  description: 'Design, save and manage lockscreen layouts, widgets and typefaces for your digital photo frame.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark light',
  themeColor: '#ffffff',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const fontVars = [inter, outfit, grotesk, playfair, instrument, bebas, jetbrains].map((f) => f.variable).join(' ')
  return (
    <html lang="en" className={`bg-background ${fontVars}`} suppressHydrationWarning>
      <body className="font-sans antialiased">
        <script
          type="text/javascript"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: themeInit }}
        />
        <TooltipProvider>
          {hasClerk ? (
            <ClerkProvider appearance={{ theme: shadcn }}>
              {children}
              <SwRegister />
              {process.env.NODE_ENV === 'production' && <Analytics />}
            </ClerkProvider>
          ) : (
            <>
              {children}
              <SwRegister />
              {process.env.NODE_ENV === 'production' && <Analytics />}
            </>
          )}
        </TooltipProvider>
      </body>
    </html>
  )
}
