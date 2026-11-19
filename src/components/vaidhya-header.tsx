"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { Stethoscope, UserCheck } from "lucide-react"

interface VaidhyaHeaderProps {
  activeStep?: 1 | 2 | 3
}

export function VaidhyaHeader({ activeStep }: VaidhyaHeaderProps) {
  const [hasSignedInPlaceholder, setHasSignedInPlaceholder] = useState(false)

  useEffect(() => {
    try {
      setHasSignedInPlaceholder(sessionStorage.getItem("vaidhya_auth_ready") === "1")
    } catch {
      setHasSignedInPlaceholder(false)
    }
  }, [])

  const steps = [
    { num: 1, label: "Patient" },
    { num: 2, label: "Record" },
    { num: 3, label: "Notes & Rx" },
  ] as const

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-teal-700 text-white shadow-xs">
            <Stethoscope className="size-5" />
          </span>
          <div>
            <p className="text-base font-semibold leading-tight tracking-tight text-slate-900">Vaidhya AI</p>
            <p className="text-[11px] font-medium text-teal-700">Cloud Clinical Scribe</p>
          </div>
        </Link>

        {activeStep ? (
          <nav aria-label="Consultation progress" className="hidden items-center gap-1.5 sm:flex">
            {steps.map((step) => {
              const isCurrent = step.num === activeStep
              const isDone = step.num < activeStep
              return (
                <span
                  key={step.num}
                  className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                    isCurrent
                      ? "bg-teal-700 text-white"
                      : isDone
                        ? "bg-teal-50 text-teal-800"
                        : "bg-slate-100 text-slate-500"
                  }`}
                >
                  {step.num}. {step.label}
                </span>
              )
            })}
          </nav>
        ) : null}

        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
        >
          <UserCheck className="size-3.5 text-teal-700" />
          <span>{hasSignedInPlaceholder ? "Doctor Account" : "Sign in"}</span>
        </Link>
      </div>
    </header>
  )
}
