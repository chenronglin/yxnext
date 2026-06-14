"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Eye, Search, XCircle } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import type { ApprovalRequest } from "@/types/admin"

type ApprovalsResponse = {
  requests: ApprovalRequest[]
}

export default function ApprovalsPage() {
  const [requests, setRequests] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [detail, setDetail] = useState<ApprovalRequest | null>(null)
  const [rejectTarget, setRejectTarget] = useState<ApprovalRequest | null>(null)
  const [reason, setReason] = useState("")
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)

  async function loadRequests() {
    // 审批页只关心待审批和已驳回两类作者申请，服务端已经按状态聚合好了。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<ApprovalsResponse>("/api/admin/approvals")
      setRequests(response.requests)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "审批列表读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadRequests()
  }, [])

  const pending = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.status === "pending" &&
          (!keyword || request.username.includes(keyword) || request.penName.includes(keyword)),
      ),
    [requests, keyword],
  )

  const rejected = useMemo(
    () =>
      requests.filter(
        (request) =>
          request.status === "rejected" &&
          (!keyword || request.username.includes(keyword) || request.penName.includes(keyword)),
      ),
    [requests, keyword],
  )

  async function handleApprove(request: ApprovalRequest) {
    const confirmed = window.confirm(`确认通过作者「${request.penName}」的注册申请吗？`)
    if (!confirmed || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson(`/api/admin/approvals/${request.id}/approve`, {
        method: "POST",
      })
      setMessage({
        type: "success",
        text: `作者「${request.penName}」已审批通过`,
      })
      await loadRequests()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "审批通过失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleReject() {
    if (!rejectTarget || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson(`/api/admin/approvals/${rejectTarget.id}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason }),
      })

      setMessage({
        type: "success",
        text: `作者「${rejectTarget.penName}」已驳回`,
      })
      setRejectTarget(null)
      setReason("")
      await loadRequests()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "驳回失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["作者审批"]}
        title="作者注册审批"
        description="审批外部注册用户，通过后用户状态变为正常，驳回需填写原因"
      />

      {message && (
        <div
          className={
            message.type === "error"
              ? "rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600"
              : "rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
          }
        >
          {message.text}
        </div>
      )}

      <Card className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
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
            {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载审批记录...</Card>}
            {!loading && pending.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">暂无待审批申请</Card>
            )}
            {!loading &&
              pending.map((request) => (
                <Card
                  key={request.id}
                  className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{request.penName}</span>
                      <span className="text-xs text-muted-foreground">@{request.username}</span>
                      <StatusBadge label="待审批" tone="warning" />
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>联系方式：{request.contact}</span>
                      <span>申请时间：{formatDateOnly(request.appliedAt)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">个人简介：{request.biography || "—"}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="bg-transparent" onClick={() => setDetail(request)}>
                      <Eye className="mr-1 size-3.5" />
                      查看详情
                    </Button>
                    <Button size="sm" disabled={submitting} onClick={() => void handleApprove(request)}>
                      <CheckCircle2 className="mr-1 size-3.5" />
                      审批通过
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="bg-transparent text-red-600 hover:text-red-600"
                      disabled={submitting}
                      onClick={() => {
                        setRejectTarget(request)
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
            {loading && <Card className="p-10 text-center text-sm text-muted-foreground">正在加载审批记录...</Card>}
            {!loading && rejected.length === 0 && (
              <Card className="p-10 text-center text-sm text-muted-foreground">暂无驳回记录</Card>
            )}
            {!loading &&
              rejected.map((request) => (
                <Card key={request.id} className="flex flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{request.penName}</span>
                    <span className="text-xs text-muted-foreground">@{request.username}</span>
                    <StatusBadge label="已驳回" tone="neutral" />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>联系方式：{request.contact}</span>
                    <span>申请时间：{formatDateOnly(request.appliedAt)}</span>
                  </div>
                  <p className="text-sm text-muted-foreground">个人简介：{request.biography || "—"}</p>
                  {request.rejectReason && <p className="text-sm text-red-600">驳回原因：{request.rejectReason}</p>}
                </Card>
              ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>申请详情</DialogTitle>
            <DialogDescription>{detail ? `@${detail.username}` : "—"}</DialogDescription>
          </DialogHeader>
          {detail && (
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <DetailRow label="笔名" value={detail.penName} />
              <DetailRow label="账号" value={detail.username} />
              <DetailRow label="联系方式" value={detail.contact} />
              <DetailRow label="申请时间" value={formatDateOnly(detail.appliedAt)} />
              <DetailRow label="状态" value={detail.status === "pending" ? "待审批" : "已驳回"} />
              <DetailRow label="个人简介" value={detail.biography || "—"} />
              <DetailRow label="驳回原因" value={detail.rejectReason ?? "—"} />
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={rejectTarget !== null} onOpenChange={(open) => !open && setRejectTarget(null)}>
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
              onChange={(event) => setReason(event.target.value)}
              placeholder="请说明驳回原因"
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setRejectTarget(null)}>
              取消
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700"
              disabled={!reason.trim() || submitting}
              onClick={() => void handleReject()}
            >
              {submitting ? "提交中..." : "确认驳回"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="col-span-1 text-muted-foreground">{label}</dt>
      <dd className="col-span-2 text-foreground">{value}</dd>
    </>
  )
}
