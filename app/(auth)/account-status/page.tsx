import Link from "next/link"
import { Clock, XCircle, Ban } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

type Status = "pending" | "rejected" | "disabled"

const STATUS_CONFIG: Record<
  Status,
  { title: string; desc: string; icon: typeof Clock; tone: string }
> = {
  pending: {
    title: "待审批",
    desc: "您的注册申请已提交，管理员审批通过后即可进入平台。请耐心等待审批结果。",
    icon: Clock,
    tone: "bg-amber-100 text-amber-600",
  },
  rejected: {
    title: "已驳回",
    desc: "很抱歉，您的注册申请未通过审批。您可以根据下方反馈修改信息后重新提交申请。",
    icon: XCircle,
    tone: "bg-red-100 text-red-600",
  },
  disabled: {
    title: "已禁用",
    desc: "您的账号已被禁用，暂时无法进入业务系统。如有疑问，请联系平台管理员。",
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

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="items-center text-center">
        <div className={`flex size-14 items-center justify-center rounded-full ${config.tone}`}>
          <Icon className="size-7" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-5 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">{config.title}</h2>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">{config.desc}</p>
        </div>

        {status === "rejected" && (
          <div className="w-full rounded-md border border-border bg-muted px-4 py-3 text-left">
            <p className="text-xs font-medium text-muted-foreground">管理员反馈原因</p>
            <p className="mt-1 text-sm text-foreground">
              提交的作品信息不完整，请补充代表作与联系方式后重新申请。
            </p>
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          <Button asChild className="w-full">
            <Link href="/login">返回登录</Link>
          </Button>
          {status === "rejected" && (
            <Button asChild variant="outline" className="w-full bg-transparent">
              <Link href="/register">修改并重新申请</Link>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
