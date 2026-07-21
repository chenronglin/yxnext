"use client"

import { ChevronLeft, ChevronRight, FileText, ListTree, LoaderCircle, PanelLeftClose } from "lucide-react"
import { useEffect, useRef } from "react"

import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import { cn } from "@/lib/utils"
import { DOC_STATUS_LABEL_KEYS } from "@/types/domain"
import { DOC_STATUS_TONE, type ProjectChapterLocator } from "@/types/project"

type ChapterNavigationActionsProps = {
  currentIndex: number
  totalChapters: number
  previousChapter: ProjectChapterLocator | null
  nextChapter: ProjectChapterLocator | null
  directoryOpen: boolean
  switchingDocId: string | null
  onDirectoryOpenChange: (open: boolean) => void
  onNavigate: (chapter: ProjectChapterLocator) => void
}

type ChapterDirectoryProps = {
  chapters: ProjectChapterLocator[]
  currentDocId: string
  currentIndex: number
  open: boolean
  switchingDocId: string | null
  onOpenChange: (open: boolean) => void
  onNavigate: (chapter: ProjectChapterLocator) => void
}

function chapterNumberLabel(chapter: ProjectChapterLocator) {
  // 新数据优先展示结构化章节号；历史数据可能没有 chapterNo，此时使用人工排序值作为可识别的兜底。
  return chapter.chapterNo !== null ? `第 ${chapter.chapterNo} 章` : `排序 ${chapter.sortOrder}`
}

export function ChapterNavigationActions({
  currentIndex,
  totalChapters,
  previousChapter,
  nextChapter,
  directoryOpen,
  switchingDocId,
  onDirectoryOpenChange,
  onNavigate,
}: ChapterNavigationActionsProps) {
  const navigationBusy = switchingDocId !== null

  return (
    // 紧凑控件组直接进入 PageHeader 操作区，不再单独占用正文上方的一整行高度。
    <div className="flex h-7 shrink-0 items-center gap-0.5 rounded-md border border-border bg-muted/40 p-0.5">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className={cn("size-6 shrink-0", directoryOpen && "bg-primary/10 text-primary")}
        aria-expanded={directoryOpen}
        aria-controls="chapter-directory"
        aria-label={directoryOpen ? "收起章节目录" : "展开章节目录"}
        title={directoryOpen ? "收起章节目录" : "展开章节目录"}
        onClick={() => onDirectoryOpenChange(!directoryOpen)}
      >
        <ListTree className="size-3.5" />
      </Button>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0"
        aria-label={previousChapter ? `上一章：${previousChapter.title}` : "已经是第一章"}
        title={previousChapter ? `上一章：${previousChapter.title}` : "已经是第一章"}
        disabled={!previousChapter || navigationBusy}
        onClick={() => previousChapter && onNavigate(previousChapter)}
      >
        {switchingDocId === previousChapter?.docId ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <ChevronLeft className="size-3.5" />
        )}
      </Button>

      {/* tabular-nums 保证切换到两位数章节时数字宽度稳定，控件组不会左右跳动。 */}
      <span className="min-w-11 whitespace-nowrap px-1 text-center text-xs font-medium tabular-nums text-muted-foreground">
        {currentIndex >= 0 ? `${currentIndex + 1} / ${totalChapters}` : `- / ${totalChapters}`}
      </span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="size-6 shrink-0"
        aria-label={nextChapter ? `下一章：${nextChapter.title}` : "已经是最后一章"}
        title={nextChapter ? `下一章：${nextChapter.title}` : "已经是最后一章"}
        disabled={!nextChapter || navigationBusy}
        onClick={() => nextChapter && onNavigate(nextChapter)}
      >
        {switchingDocId === nextChapter?.docId ? (
          <LoaderCircle className="size-3.5 animate-spin" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
      </Button>
    </div>
  )
}

export function ChapterDirectory({
  chapters,
  currentDocId,
  currentIndex,
  open,
  switchingDocId,
  onOpenChange,
  onNavigate,
}: ChapterDirectoryProps) {
  const t = useT()
  const activeItemRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) {
      return
    }

    // 直接访问深层章节或用上一章/下一章切换时，将当前项滚入目录中部，避免用户再次手工寻找位置。
    activeItemRef.current?.scrollIntoView({ block: "center" })
  }, [currentDocId, open])

  if (!open) {
    // 收起后统一由页头中的目录图标重新打开，正文左缘不再保留重复的悬浮按钮。
    return null
  }

  return (
    <aside
      id="chapter-directory"
      className={cn(
        "absolute inset-y-0 left-0 z-30 flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xl",
        // 超宽工作区把目录固定成真正的左栏；常规宽度改用覆盖层，避免与 340px 批注栏共同挤压正文。
        "2xl:relative 2xl:inset-auto 2xl:z-auto 2xl:w-56 2xl:shadow-sm",
      )}
      aria-label="章节目录"
    >
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ListTree className="size-4 text-primary" />
            <span>章节目录</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {currentIndex >= 0 ? `当前第 ${currentIndex + 1} 章，共 ${chapters.length} 章` : `共 ${chapters.length} 章`}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          title="收起章节目录"
          aria-label="收起章节目录"
          onClick={() => onOpenChange(false)}
        >
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto p-2" aria-label="快速切换章节">
        <ul className="space-y-1">
          {chapters.map((chapter) => {
            const active = chapter.docId === currentDocId
            const switching = chapter.docId === switchingDocId

            return (
              <li key={chapter.docId}>
                <button
                  ref={active ? activeItemRef : undefined}
                  type="button"
                  className={cn(
                    "flex w-full items-start gap-2 rounded-lg px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground hover:bg-muted",
                  )}
                  aria-current={active ? "page" : undefined}
                  disabled={switchingDocId !== null}
                  onClick={() => !active && onNavigate(chapter)}
                >
                  {switching ? (
                    <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin" />
                  ) : (
                    <FileText className={cn("mt-0.5 size-4 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground")} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-[11px]", active ? "text-primary-foreground/80" : "text-muted-foreground")}>
                      {chapterNumberLabel(chapter)}
                    </span>
                    <span className="mt-0.5 block truncate text-sm font-medium" title={chapter.title}>
                      {chapter.title}
                    </span>
                    <StatusBadge
                      label={t(DOC_STATUS_LABEL_KEYS[chapter.status])}
                      tone={DOC_STATUS_TONE[chapter.status]}
                      className={cn("mt-1.5", active && "border-white/25 bg-white/15 text-primary-foreground")}
                    />
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>
    </aside>
  )
}
