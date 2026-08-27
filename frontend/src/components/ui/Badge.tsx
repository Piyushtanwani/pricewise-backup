import type { ReactNode } from "react"

type Variant = "success" | "warning" | "info" | "neutral" | "primary" | "error"

const styles: Record<Variant, string> = {
  success: "bg-emerald-50 text-emerald-700 border border-emerald-200",
  warning: "bg-amber-50 text-amber-700 border border-amber-200",
  info: "bg-blue-50 text-blue-700 border border-blue-200",
  neutral: "bg-slate-100 text-slate-600 border border-slate-200",
  primary: "bg-indigo-50 text-indigo-700 border border-indigo-200",
  error: "bg-red-50 text-red-700 border border-red-200",
}

export default function Badge({
  children,
  variant = "neutral",
  className = "",
}: {
  children: ReactNode
  variant?: Variant
  className?: string
}) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${styles[variant]} ${className}`}>
      {children}
    </span>
  )
}
