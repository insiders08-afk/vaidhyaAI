import type React from "react"
import type { Metadata, Viewport } from "next"
import { PwaRegister } from "@/components/pwa-register"
import "./globals.css"

export const metadata: Metadata = {
  title: "Vaidhya AI — Clinical Voice Scribe",
  description:
    "Cloud AI medical scribe for clinicians: multilingual voice capture, speaker-diarized notes, time-of-day prescriptions, and one-tap WhatsApp sharing.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Vaidhya AI",
  },
  icons: {
    icon: [
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-icon.png",
  },
}

export const viewport: Viewport = {
  themeColor: "#0f766e",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-slate-50 font-sans text-slate-900 antialiased" suppressHydrationWarning>
        <PwaRegister />
        {children}
      </body>
    </html>
  )
}
