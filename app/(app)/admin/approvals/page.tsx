"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { APPROVAL_REQUESTS, type ApprovalRequest } from "@/mocks/admin-data"
import { Search, CheckCircle2, XCircle, Eye } from "lucide-react"

export default function ApprovalsPage() {
  const [keyword, setKeyword] = useState("")
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null)
  const [reason, setReason] = useState("")

  const pending = useMemo(
    () => APPROVAL_REQUESTS.filter((r) => r.status === "pending" && (!keyword || r.username.includes(keyword) || r.penName.includes(keyword))),
    [keyword],
  )
  const rejected = useMemo(
    () => APPROVAL_REQUESTS.filter((r) => r.status === "rejected" && (!keyword || r.username.includes(keyword) || r.penName.includes(keyword))),
    [keyword],
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["作者审批"]}
        title="作者注册审批"
        description="审批外部注册用户，通过后用户状态变为正常，驳回需填写原因"
      />

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索申请账号、笔名"
            className="pl-9"
          />
        </div>
      </Card>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">待审批 ({pending.length})</TabsTrigger>
          <TabsTrigger value="rejected">已驳回 ({rejected.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          <div className="flex flex-col gap-3">
            {pending.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">暂无待审批申请</Card>
            )}
            {pending.map((req) => (
              <Card key={req.id} className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{req.penName}</span>
                    <span className="text-xs text-muted-foreground">@{req.username}</span>
                    <StatusBadge label="待审批" tone="warning" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>联系方式：{req.contact}</span>
                    <span>申请时间：{req.appliedAt}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">申请说明：{req.note}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" className="bg-transparent">
                    <Eye className="mr-1 size-3.5" />
                    查看详情
                  </Button>
                  <Button size="sm">
                    <CheckCircle2 className="mr-1 size-3.5" />
                    审批通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-transparent text-red-600 hover:text-red-600"
                    onClick={() => {
                      setRejectTarget(req)
                      setReason("")
                    }}
                  >
                    <XCircle className="mr-1 size-3.5" />
                    驳回
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <div className="flex flex-col gap-3">
            {rejected.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">暂无驳回记录</Card>
            )}
            {rejected.map((req) => (
              <Card key={req.id} className="flex flex-col gap-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{req.penName}</span>
                  <span className="text-xs text-muted-foreground">@{req.username}</span>
                  <StatusBadge label="已驳回" tone="neutral" />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>联系方式：{req.contact}</span>
                  <span>申请时间：{req.appliedAt}</span>
                </div>
                {req.rejectReason && <p className="text-sm text-red-600">驳回原因：{req.rejectReason}</p>}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* 驳回原因弹窗 */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => !o && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>驳回申请</DialogTitle>
            <DialogDescription>
              驳回 {rejectTarget?.penName}（@{rejectTarget?.username}）的注册申请，请填写驳回原因，结果将通知申请人。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <Label htmlFor="reason">驳回原因（必填）</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请说明驳回原因"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setRejectTarget(null)}>
              取消
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!reason.trim()}
              onClick={() => setRejectTarget(null)}
            >
              确认驳回
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
