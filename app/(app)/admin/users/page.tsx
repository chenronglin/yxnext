"use client"

import { useMemo, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { MANAGED_USERS, USER_STATUS_TONE, ROLE_TONE } from "@/mocks/admin-data"
import { ROLE_LABELS, USER_STATUS_LABELS, type Role, type UserStatus } from "@/types/domain"
import { Plus, Search, Eye, Pencil, Power, KeyRound } from "lucide-react"

export default function UsersPage() {
  const [keyword, setKeyword] = useState("")
  const [role, setRole] = useState<Role | "all">("all")
  const [status, setStatus] = useState<UserStatus | "all">("all")

  const filtered = useMemo(() => {
    return MANAGED_USERS.filter((u) => {
      if (keyword && !u.username.includes(keyword) && !u.name.includes(keyword)) return false
      if (role !== "all" && u.role !== role) return false
      if (status !== "all" && u.status !== status) return false
      return true
    })
  }, [keyword, role, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["用户管理"]}
        title="用户管理"
        description="管理平台用户，包括新增、编辑、启用、禁用与重置密码"
        actions={
          <Button>
            <Plus className="mr-1.5 size-4" />
            新增用户
          </Button>
        }
      />

      {/* 筛选区 */}
      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索用户名、姓名/笔名"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={role} onValueChange={(v) => setRole(v as Role | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{role === "all" ? "全部角色" : ROLE_LABELS[role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => setStatus(v as UserStatus | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{status === "all" ? "全部状态" : USER_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {USER_STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {/* 用户列表 */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">用户名</th>
                <th className="px-4 py-3 font-medium">姓名/笔名</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">手机/邮箱</th>
                <th className="px-4 py-3 font-medium">最近登录</th>
                <th className="px-4 py-3 font-medium">创建时间</th>
                <th className="px-4 py-3 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的用户
                  </td>
                </tr>
              )}
              {filtered.map((u) => (
                <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium text-foreground">{u.username}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.name}</td>
                  <td className="px-4 py-3">
                    <StatusBadge label={ROLE_LABELS[u.role]} tone={ROLE_TONE[u.role]} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge label={USER_STATUS_LABELS[u.status]} tone={USER_STATUS_TONE[u.status]} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{u.contact}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.lastLogin ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.createdAt}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" className="h-8 px-2" title="查看">
                        <Eye className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" title="编辑">
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2" title="重置密码">
                        <KeyRound className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className={
                          "h-8 px-2 " + (u.status === "active" ? "text-red-600 hover:text-red-600" : "text-emerald-600 hover:text-emerald-600")
                        }
                        title={u.status === "active" ? "禁用" : "启用"}
                      >
                        <Power className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        作者注册审批在「作者审批」页完成，本页展示审批后形成的正式用户。禁用、重置密码均需二次确认。
      </p>
    </div>
  )
}
