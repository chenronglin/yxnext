"use client"

import { useEffect, useMemo, useState } from "react"
import { Eye, KeyRound, Pencil, Plus, Power, Search } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useConfirmDialog } from "@/components/ui/app-feedback"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { ROLE_LABELS, USER_STATUS_LABELS, type Role, type UserStatus } from "@/types/domain"
import { ROLE_TONE, USER_STATUS_TONE, type ManagedUser } from "@/types/admin"

type UsersResponse = {
  users: ManagedUser[]
}

type UserMutationResponse = {
  user: ManagedUser
}

type ResetPasswordResponse = {
  temporaryPassword: string
}

type UserFormState = {
  username: string
  name: string
  role: Role
  email: string
  phone: string
  biography: string
  password: string
}

const EMPTY_FORM: UserFormState = {
  username: "",
  name: "",
  role: "author",
  email: "",
  phone: "",
  biography: "",
  password: "",
}

export default function UsersPage() {
  const confirm = useConfirmDialog()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [keyword, setKeyword] = useState("")
  const [role, setRole] = useState<Role | "all">("all")
  const [status, setStatus] = useState<UserStatus | "all">("all")
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null)
  const [detailUser, setDetailUser] = useState<ManagedUser | null>(null)
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState<UserFormState>(EMPTY_FORM)
  const [resetPasswordResult, setResetPasswordResult] = useState<{ user: ManagedUser; password: string } | null>(null)

  async function loadUsers() {
    // 用户列表由管理员全局治理接口返回，前端只做筛选和展示，不自己拼状态。
    setLoading(true)
    setMessage(null)

    try {
      const response = await fetchJson<UsersResponse>("/api/admin/users")
      setUsers(response.users)
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "用户列表读取失败",
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadUsers()
  }, [])

  const filtered = useMemo(() => {
    return users.filter((user) => {
      if (keyword && !user.username.includes(keyword) && !user.name.includes(keyword)) return false
      if (role !== "all" && user.role !== role) return false
      if (status !== "all" && user.status !== status) return false
      return true
    })
  }, [users, keyword, role, status])

  function openCreateDialog() {
    // 新增用户走独立表单，默认按作者创建，管理员可在弹窗里改角色。
    setEditingUser(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEditDialog(user: ManagedUser) {
    // 编辑只允许修改基础资料和角色；密码改动统一通过“重置密码”动作处理。
    setEditingUser(user)
    setForm({
      username: user.username,
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone ?? "",
      biography: user.biography ?? "",
      password: "",
    })
    setFormOpen(true)
  }

  async function handleSubmitUser() {
    if (submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      const payload = editingUser
        ? {
            username: form.username,
            name: form.name,
            role: form.role,
            email: form.email,
            phone: form.phone || null,
            biography: form.biography || null,
          }
        : {
            username: form.username,
            name: form.name,
            role: form.role,
            email: form.email,
            phone: form.phone || null,
            biography: form.biography || null,
            password: form.password,
          }

      const response = editingUser
        ? await fetchJson<UserMutationResponse>(`/api/admin/users/${editingUser.id}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })
        : await fetchJson<UserMutationResponse>("/api/admin/users", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          })

      setMessage({
        type: "success",
        text: editingUser ? `用户「${response.user.name}」已更新` : `用户「${response.user.name}」已创建`,
      })
      setFormOpen(false)
      await loadUsers()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "用户保存失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggleStatus(user: ManagedUser) {
    const confirmed = await confirm({
      title: user.status === "active" ? "确认禁用用户" : "确认启用用户",
      description:
        user.status === "active"
          ? `禁用后，用户「${user.name}」将不能继续登录。`
          : `启用后，用户「${user.name}」可以重新登录。`,
      confirmText: user.status === "active" ? "确认禁用" : "确认启用",
      tone: user.status === "active" ? "danger" : "default",
    })

    if (!confirmed || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      await fetchJson<UserMutationResponse>(`/api/admin/users/${user.id}/toggle-status`, {
        method: "POST",
      })

      setMessage({
        type: "success",
        text: user.status === "active" ? `用户「${user.name}」已禁用` : `用户「${user.name}」已启用`,
      })
      await loadUsers()
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "状态切换失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  async function handleResetPassword(user: ManagedUser) {
    const confirmed = await confirm({
      title: "确认重置密码",
      description: `重置后，用户「${user.name}」需要使用临时密码登录并修改密码。`,
      confirmText: "确认重置",
    })
    if (!confirmed || submitting) return

    setSubmitting(true)
    setMessage(null)

    try {
      const response = await fetchJson<ResetPasswordResponse>(`/api/admin/users/${user.id}/reset-password`, {
        method: "POST",
      })

      setResetPasswordResult({
        user,
        password: response.temporaryPassword,
      })
      setMessage({
        type: "success",
        text: `用户「${user.name}」的密码已重置`,
      })
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "重置密码失败",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["用户管理"]}
        title="用户管理"
        description="管理平台用户，包括新增、编辑、启用、禁用与重置密码"
        actions={
          <Button onClick={openCreateDialog}>
            <Plus className="mr-1.5 size-4" />
            新增用户
          </Button>
        }
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

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="搜索用户名、姓名/笔名"
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <Select value={role} onValueChange={(value) => setRole(value as Role | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{role === "all" ? "全部角色" : ROLE_LABELS[role]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部角色</SelectItem>
              {(Object.keys(ROLE_LABELS) as Role[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {ROLE_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(value) => setStatus(value as UserStatus | "all")}>
            <SelectTrigger className="w-32">
              <SelectValue>{status === "all" ? "全部状态" : USER_STATUS_LABELS[status]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {(Object.keys(USER_STATUS_LABELS) as UserStatus[]).map((item) => (
                <SelectItem key={item} value={item}>
                  {USER_STATUS_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Card>

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
              {loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    正在加载用户...
                  </td>
                </tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    暂无符合条件的用户
                  </td>
                </tr>
              )}
              {!loading &&
                filtered.map((user) => (
                  <tr key={user.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium text-foreground">{user.username}</td>
                    <td className="px-4 py-3 text-muted-foreground">{user.name}</td>
                    <td className="px-4 py-3">
                      <StatusBadge label={ROLE_LABELS[user.role]} tone={ROLE_TONE[user.role]} />
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge label={USER_STATUS_LABELS[user.status]} tone={USER_STATUS_TONE[user.status]} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{user.contact}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(user.lastLogin)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDateOnly(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          title="查看"
                          onClick={() => setDetailUser(user)}
                        >
                          <Eye className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          title="编辑"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2"
                          title="重置密码"
                          disabled={submitting}
                          onClick={() => void handleResetPassword(user)}
                        >
                          <KeyRound className="size-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={
                            "h-8 px-2 " +
                            (user.status === "active"
                              ? "text-red-600 hover:text-red-600"
                              : "text-emerald-600 hover:text-emerald-600")
                          }
                          title={user.status === "active" ? "禁用" : "启用"}
                          disabled={submitting || !["active", "disabled"].includes(user.status)}
                          onClick={() => void handleToggleStatus(user)}
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
        作者注册审批在「作者审批」页完成，本页展示审批后形成的正式用户。禁用、重置密码均会写入操作日志。
      </p>

      <Dialog open={formOpen} onOpenChange={(open) => !open && !submitting && setFormOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingUser ? "编辑用户" : "新增用户"}</DialogTitle>
            <DialogDescription>
              {editingUser ? "修改用户基础资料与角色。" : "创建新用户并设置初始登录密码。"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="请输入用户名"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="name">姓名/笔名</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="请输入姓名或笔名"
              />
            </div>
            <div className="grid gap-2">
              <Label>角色</Label>
              <Select value={form.role} onValueChange={(value) => setForm({ ...form, role: value as Role })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(ROLE_LABELS) as Role[]).map((item) => (
                    <SelectItem key={item} value={item}>
                      {ROLE_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="请输入邮箱"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">手机号</Label>
              <Input
                id="phone"
                value={form.phone}
                onChange={(event) => setForm({ ...form, phone: event.target.value })}
                placeholder="请输入手机号，可留空"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="biography">个人简介</Label>
              <Textarea
                id="biography"
                rows={4}
                value={form.biography}
                onChange={(event) => setForm({ ...form, biography: event.target.value })}
                placeholder="请输入个人简介，可留空"
              />
            </div>
            {!editingUser && (
              <div className="grid gap-2">
                <Label htmlFor="password">初始密码</Label>
                <Input
                  id="password"
                  type="password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  placeholder="请输入初始密码"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="bg-transparent" disabled={submitting} onClick={() => setFormOpen(false)}>
              取消
            </Button>
            <Button disabled={submitting} onClick={() => void handleSubmitUser()}>
              {submitting ? "保存中..." : "确认保存"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={detailUser !== null} onOpenChange={(open) => !open && setDetailUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>{detailUser ? `@${detailUser.username}` : "—"}</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <dl className="grid grid-cols-3 gap-y-3 text-sm">
              <DetailRow label="姓名/笔名" value={detailUser.name} />
              <DetailRow label="角色" value={ROLE_LABELS[detailUser.role]} />
              <DetailRow label="状态" value={USER_STATUS_LABELS[detailUser.status]} />
              <DetailRow label="邮箱" value={detailUser.email} />
              <DetailRow label="手机号" value={detailUser.phone ?? "—"} />
              <DetailRow label="联系方式" value={detailUser.contact} />
              <DetailRow label="个人简介" value={detailUser.biography ?? "—"} />
              <DetailRow label="最近登录" value={formatDateOnly(detailUser.lastLogin)} />
              <DetailRow label="创建时间" value={formatDateOnly(detailUser.createdAt)} />
            </dl>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={resetPasswordResult !== null} onOpenChange={(open) => !open && setResetPasswordResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>临时密码</DialogTitle>
            <DialogDescription>
              {resetPasswordResult ? `用户「${resetPasswordResult.user.name}」的新临时密码如下。` : "—"}
            </DialogDescription>
          </DialogHeader>
          {resetPasswordResult && (
            <div className="rounded-md border border-border bg-muted/40 px-4 py-3">
              <p className="text-xs text-muted-foreground">请通过安全渠道把临时密码发送给用户。</p>
              <p className="mt-2 font-mono text-sm text-foreground">{resetPasswordResult.password}</p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResetPasswordResult(null)}>我知道了</Button>
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
