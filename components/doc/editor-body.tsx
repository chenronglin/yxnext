"use client"

import { useState } from "react"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { ContentBlock } from "@/lib/doc-data"
import { MessageSquare, Plus, GripVertical } from "lucide-react"

interface EditorBodyProps {
  blocks: ContentBlock[]
  editable?: boolean
  clean?: boolean
}

// 编辑器正文区：分块控件模拟富文本，支持修订标记与批注高亮（P22/P26/P27）
export function EditorBody({ blocks, editable = false, clean = false }: EditorBodyProps) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(blocks.map((b) => [b.id, b.text])),
  )

  return (
    <div className="flex flex-col gap-2">
      {blocks.map((block) => {
        const markStyle =
          !clean && block.revisionMark === "insert"
            ? "border-l-2 border-emerald-400 bg-emerald-50/60"
            : !clean && block.revisionMark === "delete"
              ? "border-l-2 border-red-300 bg-red-50/60 line-through decoration-red-400/70"
              : "border-l-2 border-transparent"

        return (
          <div key={block.id} className={cn("group relative rounded-md pl-3 pr-2 py-1.5", markStyle)}>
            <div className="flex items-start gap-2">
              {editable && !clean && (
                <button
                  type="button"
                  className="mt-2 cursor-grab text-muted-foreground/40 opacity-0 transition group-hover:opacity-100"
                  title="拖动排序"
                >
                  <GripVertical className="size-4" />
                </button>
              )}
              <div className="flex-1">
                {editable ? (
                  <Textarea
                    value={values[block.id]}
                    onChange={(e) => setValues((v) => ({ ...v, [block.id]: e.target.value }))}
                    rows={block.kind === "heading" ? 1 : 3}
                    className={cn(
                      "resize-none border-transparent bg-transparent px-1 shadow-none focus-visible:bg-background focus-visible:border-border",
                      block.kind === "heading" && "text-base font-semibold",
                    )}
                  />
                ) : (
                  <p
                    className={cn(
                      "px-1 py-1.5 leading-relaxed",
                      block.kind === "heading" ? "text-base font-semibold text-foreground" : "text-sm text-foreground/90",
                    )}
                  >
                    {values[block.id]}
                  </p>
                )}
              </div>
              {!clean && block.hasComment && (
                <span
                  className="mt-2 inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700"
                  title="此处有批注"
                >
                  <MessageSquare className="size-3" />
                </span>
              )}
            </div>
          </div>
        )
      })}

      {editable && !clean && (
        <Button variant="outline" size="sm" className="mt-2 w-fit bg-transparent text-muted-foreground">
          <Plus className="mr-1.5 size-3.5" />
          插入段落
        </Button>
      )}
    </div>
  )
}
