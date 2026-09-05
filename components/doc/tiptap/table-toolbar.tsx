"use client"

import type { Editor } from "@tiptap/core"
import { useEditorState } from "@tiptap/react"
import { Table2 } from "lucide-react"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { isTableSizeAllowed } from "@/lib/novel-table"
import { isRevisionCompositionBusy } from "./extensions"
import { TABLE_NOTICE_EVENT } from "./table-extensions"

function selectTableState({ editor }: { editor: Editor }) {
  const { $from } = editor.state.selection
  let rows = 0
  let columns = 0
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth)
    if (node.type.name === "table") { rows = node.childCount; columns = node.firstChild?.childCount ?? 0; break }
  }
  return { active: rows > 0, rows, columns }
}

export function TableToolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({ editor, selector: selectTableState })
  const [notice, setNotice] = useState("")
  useEffect(() => {
    function onNotice(event: Event) {
      // 历史版本和其它挂载中的编辑器不响应当前编辑窗口的提示。
      if (editor.isFocused) setNotice((event as CustomEvent<string>).detail)
    }
    window.addEventListener(TABLE_NOTICE_EVENT, onNotice)
    return () => window.removeEventListener(TABLE_NOTICE_EVENT, onNotice)
  }, [editor])

  function run(command: () => boolean) {
    // 输入法尚未收口时不改变表格结构，防止选区被移走后把预编辑文字写到其它单元格。
    if (isRevisionCompositionBusy(editor)) { setNotice("请先完成当前输入，再操作表格。"); return }
    setNotice(command() ? "" : "当前位置无法执行此表格操作。")
  }

  const addRowDisabled = !state.active || !isTableSizeAllowed(state.rows + 1, state.columns)
  const addColumnDisabled = !state.active || !isTableSizeAllowed(state.rows, state.columns + 1)
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 pb-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="h-8" />}>
          <Table2 className="mr-1 size-4" />表格{state.active ? ` · ${state.rows} × ${state.columns}` : ""}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-44">
          <DropdownMenuItem disabled={state.active} onClick={() => run(() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run())}>插入 3 × 3 表格（含表头）</DropdownMenuItem>
          <DropdownMenuItem disabled={state.active} onClick={() => run(() => editor.chain().focus().insertTable({ rows: 2, cols: 2, withHeaderRow: false }).run())}>插入 2 × 2 表格</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={addRowDisabled} onClick={() => run(() => editor.chain().focus().addRowBefore().run())}>在上方插入行</DropdownMenuItem>
          <DropdownMenuItem disabled={addRowDisabled} onClick={() => run(() => editor.chain().focus().addRowAfter().run())}>在下方插入行</DropdownMenuItem>
          <DropdownMenuItem disabled={addColumnDisabled} onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}>在左侧插入列</DropdownMenuItem>
          <DropdownMenuItem disabled={addColumnDisabled} onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}>在右侧插入列</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.active} onClick={() => run(() => editor.chain().focus().toggleHeaderRow().run())}>切换当前行表头</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!state.active} onClick={() => run(() => editor.chain().focus().deleteRow().run())}>删除当前行</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.active} onClick={() => run(() => editor.chain().focus().deleteColumn().run())}>删除当前列</DropdownMenuItem>
          <DropdownMenuItem disabled={!state.active} onClick={() => run(() => editor.chain().focus().deleteTable().run())}>删除表格</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {notice && <span role="status" className="text-xs text-amber-700">{notice}<button type="button" aria-label="关闭表格提示" className="ml-2 underline" onClick={() => setNotice("")}>关闭</button></span>}
    </div>
  )
}
