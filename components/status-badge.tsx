import { cn } from "@/lib/utils"
import type { BadgeTone } from "@/types/domain"

const toneStyles: Record<BadgeTone, string> = {
  neutral: "bg-secondary text-secondary-foreground border-transparent",
  info: "bg-accent text-accent-foreground border-transparent",
  success: "bg-emerald-100 text-emerald-700 border-transparent",
  warning: "bg-amber-100 text-amber-700 border-transparent",
  danger: "bg-red-100 text-red-700 border-transparent",
}

interface StatusBadgeProps {
  label: string
  tone?: BadgeTone
  title?: string
  className?: string
}

export function StatusBadge({ label, tone = "neutral", title, className }: StatusBadgeProps) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        toneStyles[tone],
        className,
      )}
    >
      {label}
    </span>
  )
}
