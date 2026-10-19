import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Bebas_Neue, Instrument_Serif, Inter, JetBrains_Mono, Outfit, Playfair_Display, Space_Grotesk } from 'next/font/google'
import './globals.css'
import { SwRegister } from '@/components/sw-register'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit' })
const grotesk = Space_Grotesk({ subsets: ['latin'], variable: '--font-grotesk' })
const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-playfair' })
const instrument = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-instrument' })
const bebas = Bebas_Neue({ subsets: ['latin'], weight: '400', variable: '--font-bebas' })
const jetbrains = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'Frame Studio · Lockscreen Editor',
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
    <html lang="en" className={`dark bg-background ${fontVars}`}>
      <body className="font-sans antialiased">
        <ClerkProvider>
          {children}
          <SwRegister />
          {process.env.NODE_ENV === 'production' && <Analytics />}
        </ClerkProvider>
      </body>
    </html>
  )
}