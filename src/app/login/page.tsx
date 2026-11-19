"use client"

import { useRouter } from "next/navigation"
import { ArrowRight, ShieldCheck, Stethoscope } from "lucide-react"

/**
 * Doctor Sign-In Screen (UI Placeholder Only).
 *
 * Authentication is intentionally NOT implemented here — wire your real
 * Google OAuth / Firebase Auth / NextAuth provider inside `handleGoogleSignIn`.
 */
export default function LoginPage() {
  const router = useRouter()

  function handleGoogleSignIn() {
    // TODO: Replace with real Google Sign-In / OAuth flow
    try {
      sessionStorage.setItem("vaidhya_auth_ready", "1")
    } catch {
      // Ignore storage failures in restricted contexts
    }
    router.push("/")
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-gradient-to-b from-teal-50/70 via-white to-slate-50 px-4 py-10">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm">
            <Stethoscope className="size-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vaidhya AI</h1>
          <p className="mt-1.5 text-sm text-slate-600">
            Multilingual AI voice scribe for doctors. Record consultations, generate time-of-day prescriptions, and
            share via WhatsApp.
          </p>
        </div>

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-sm font-semibold text-slate-800 shadow-xs transition hover:bg-slate-50 active:scale-[0.99]"
        >
          <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
            />
            <path
              fill="#34A853"
              d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
            />
            <path
              fill="#FBBC05"
              d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
            />
            <path
              fill="#EA4335"
              d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
            />
          </svg>
          <span>Sign in with Google</span>
          <ArrowRight className="size-4 text-slate-400" />
        </button>

        <div className="mt-6 flex items-start gap-2.5 rounded-xl bg-slate-50 p-3.5 text-xs text-slate-600">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-teal-700" />
          <p>
            Auth UI placeholder ready for your OAuth integration. Tapping &ldquo;Sign in with Google&rdquo; opens the
            consultation workspace directly.
          </p>
        </div>
      </div>
    </main>
  )
}
