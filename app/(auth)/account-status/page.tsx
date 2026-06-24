import Link from "next/link"
import { Clock, XCircle, Ban } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { getServerT } from "@/lib/i18n/server"
import type { I18nKey } from "@/lib/i18n/dictionary"

type Status = "pending" | "rejected" | "disabled"

const STATUS_CONFIG: Record<
  Status,
  { titleKey: I18nKey; descKey: I18nKey; icon: typeof Clock; tone: string }
> = {
  pending: {
    titleKey: "auth.accountStatus.pending.title",
    descKey: "auth.accountStatus.pending.desc",
    icon: Clock,
    tone: "bg-amber-100 text-amber-600",
  },
  rejected: {
    titleKey: "auth.accountStatus.rejected.title",
    descKey: "auth.accountStatus.rejected.desc",
    icon: XCircle,
    tone: "bg-red-100 text-red-600",
  },
  disabled: {
    titleKey: "auth.accountStatus.disabled.title",
    descKey: "auth.accountStatus.disabled.desc",
    icon: Ban,
    tone: "bg-secondary text-secondary-foreground",
  },
}

export default async function AccountStatusPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; from?: string }>
}) {
  const { status: rawStatus } = await searchParams
  const status = (["pending", "rejected", "disabled"].includes(rawStatus ?? "")
    ? rawStatus
    : "pending") as Status
  const config = STATUS_CONFIG[status]
  const Icon = config.icon
  const t = await getServerT()

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="items-center text-center">
        <div className={`flex size-14 items-center justify-center rounded-full ${config.tone}`}>
          <Icon className="size-7" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{t(config.titleKey)}</h2>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{t(config.descKey)}</p>
        </div>

        <div className="flex w-full flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/login">{t("auth.register.backToLogin")}</Link>
          </Button>
          {status === "rejected" && (
            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/register">{t("auth.accountStatus.reapply")}</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
