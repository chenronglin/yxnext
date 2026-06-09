import Link from "next/link"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

interface StatCardProps {
  label: string
  value: string | number
  icon?: LucideIcon
  href?: string
  tone?: "default" | "warning" | "danger" | "success"
  hint?: string
}

const toneIcon: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "bg-accent text-accent-foreground",
  warning: "bg-amber-100 text-amber-600",
  danger: "bg-red-100 text-red-600",
  success: "bg-emerald-100 text-emerald-600",
}

export function StatCard({ label, value, icon: Icon, href, tone = "default", hint }: StatCardProps) {
  const content = (
    <Card
      className={cn(
        "flex flex-row items-center justify-between gap-3 p-4 transition-colors",
        href && "cursor-pointer hover:border-primary/40 hover:bg-secondary/40",
      )}
    >
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("flex size-10 items-center justify-center rounded-lg", toneIcon[tone])}>
          <Icon className="size-5" />
        </div>
      )}
    </Card>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }
  return content
}
