"use client"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import type { Role } from "@/types/domain"
import {
  Upload,
  ClipboardPaste,
  Save,
  Undo2,
  Redo2,
  MessageSquarePlus,
  Trash2,
  Replace,
  PlusCircle,
  Lightbulb,
  Search,
} from "lucide-react"

interface EditorToolbarProps {
  role: Role
  disabled?: boolean
}

// 编辑器工具栏（P22 / P24）
export function EditorToolbar({ role, disabled }: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-card p-2">
      {/* 通用：导入 / 粘贴 / 保存 / 撤销重做 */}
      <ToolButton icon={Upload} label="导入" disabled={disabled} />
      <ToolButton icon={ClipboardPaste} label="粘贴" disabled={disabled} />
      <ToolButton icon={Save} label="保存" disabled={disabled} />
      <Separator orientation="vertical" className="mx-1 h-6" />
      <ToolButton icon={Undo2} label="撤销" iconOnly disabled={disabled} />
      <ToolButton icon={Redo2} label="重做" iconOnly disabled={disabled} />
      <Separator orientation="vertical" className="mx-1 h-6" />

      {/* 编辑专属：批注与建议 */}
      {role === "editor" && (
        <>
          <ToolButton icon={MessageSquarePlus} label="添加批注" disabled={disabled} />
          <ToolButton icon={Trash2} label="删除批注" disabled={disabled} />
          <ToolButton icon={Replace} label="替换批注" disabled={disabled} />
          <ToolButton icon={PlusCircle} label="增加批注" disabled={disabled} />
          <ToolButton icon={Lightbulb} label="编辑建议" disabled={disabled} />
          <Separator orientation="vertical" className="mx-1 h-6" />
        </>
      )}

      {/* 搜索：常驻右侧 */}
      <div className="ml-auto">
        <ToolButton icon={Search} label="搜索" />
      </div>
    </div>
  )
}

function ToolButton({
  icon: Icon,
  label,
  iconOnly,
  disabled,
}: {
  icon: typeof Save
  label: string
  iconOnly?: boolean
  disabled?: boolean
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-8 px-2 text-muted-foreground hover:text-foreground"
      disabled={disabled}
      title={label}
    >
      <Icon className="size-3.5" />
      {!iconOnly && <span className="ml-1.5 hidden sm:inline">{label}</span>}
      {iconOnly && <span className="sr-only">{label}</span>}
    </Button>
  )
}
