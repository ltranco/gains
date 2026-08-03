import type { Metadata, Viewport } from "next"
import { Inter, JetBrains_Mono } from "next/font/google"

import { RemoteProvider } from "@/providers/RemoteProvider"
import { StoreProvider } from "@/providers/StoreProvider"
import { ThemeSync, themeBootstrapScript } from "@/providers/ThemeSync"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
})

/**
 * Every number in this app is read as a measurement, so they get a mono face rather than
 * Inter's figures. JetBrains Mono has squarer, flatter terminals than the usual mono
 * choices, which is what gives it weight next to Inter instead of looking like code.
 */
const mono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  weight: ["500", "700"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "gains",
  description: "A workout log.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "gains", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Lets the sticky action bar sit against the home indicator instead of above a letterbox.
  viewportFit: "cover",
  /**
   * Make the on-screen keyboard shrink the layout viewport, so `100dvh` means the part of the
   * screen you can actually see and a bottom-anchored sheet is never pushed off the top.
   *
   * Where a browser supports this, `Sheet`'s visualViewport tracking has nothing left to correct.
   * Where it doesn't, the key is ignored and that tracking is still the fix. Belt and braces on
   * purpose: the JS path is the one that got stuck.
   */
  interactiveWidget: "resizes-content",
  // Follows whichever theme is active, so the iOS status bar matches the page.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0e10" },
  ],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <StoreProvider>
          <ThemeSync />
          {/* Inside StoreProvider: the auto-push timer needs the logged sets. */}
          <RemoteProvider>{children}</RemoteProvider>
        </StoreProvider>
      </body>
    </html>
  )
}
