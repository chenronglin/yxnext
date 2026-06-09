"use client"

import { useState } from "react"
import Link from "next/link"
import { useRole } from "@/components/role-provider"
import { PageHeader } from "@/components/page-header"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/status-badge"
import { Separator } from "@/components/ui/separator"
import { Textarea } from "@/components/ui/textarea"
import {
  FileCheck2,
  FileText,
  User,
  Clock,
  ExternalLink,
  ChevronRight,
  ThumbsUp,
  RotateCcw,
  Sparkles,
  Info,
  CheckCircle,
  Undo2
} from "lucide-react"

interface ReviewItem {
  id: string
  projectId: string
  docType: string
  title: string
  projectName: string
  authorName: string
  words: number
  submittedAt: string
  submitNote: string
  previewText: string
  oldPreviewText?: string
}

const INITIAL_REVIEWS: ReviewItem[] = [
  {
    id: "rev-1",
    projectId: "p1",
    docType: "chapter",
    title: "第四章 暗巷的修士",
    projectName: "都市修真：外卖小哥的逆袭",
    authorName: "苏小白",
    words: 3680,
    submittedAt: "2026-06-08 09:30",
    submitNote: "第四章写完啦，加入了男主在暗巷利用破自行车阵法击退低阶散修的情节，求林大大审核批注！",
    previewText: "清冷的月光洒在石板路上，陈默推着链条断裂的飞鸽自行车走在狭窄的胡同里。突然，空气骤冷，四周泛起淡淡的灰色大雾。‘道友请留步。’一个沙哑的声音从雾气深处飘出，伴随着不怀好意的灵压压迫感。",
    oldPreviewText: "陈默走在没有路灯的巷子里，车子坏了。前面起雾了，走出来一个怪人，让他站住。陈默觉得很奇怪，戒备着看着那个人。"
  },
  {
    id: "rev-2",
    projectId: "p2",
    docType: "outline",
    title: "《锦衣探案录》大纲修改稿",
    projectName: "锦衣探案录",
    authorName: "墨清欢",
    words: 5200,
    submittedAt: "2026-06-07 11:20",
    submitNote: "按照之前的沟通，丰富了前五章银库案的冲突反转，加入了次辅别苑夜探被围的伏笔，请查看。",
    previewText: "故事围绕锦衣卫百户沈炼展开。沈炼受命调查大明朝银库十万两雪花银离奇失踪案。在夜探别苑过程中，主角撞见次辅别苑的阴谋，并被陷害成为弑臣凶手，踏上流亡路。",
    oldPreviewText: "故事讲一个锦衣卫调查朝廷银库案。别苑里的人不让他查，他在现场发现了线索，但也惊动了反派，只能连夜跑路。"
  },
  {
    id: "rev-3",
    projectId: "p4",
    docType: "release",
    title: "《山海食肆》质检 Doc",
    projectName: "山海食肆",
    authorName: "江临",
    words: 28500,
    submittedAt: "2026-06-05 15:40",
    submitNote: "已完成所有章节的校对及精细修改，申请质检核验并正式标记项目完结交付。",
    previewText: "山海食肆座落于人妖两界交汇的忘川渡口。守店人陆羽擅长以山海异兽为食材，烹饪调理人妖执念。第一章：清炖讹兽与谎言的滋味；第二章：爆炒毕方与心火的释怀……",
    oldPreviewText: "故事说一个在渡口开小吃店的人，用妖怪做菜。每一章解决一个故事，最终项目交稿完结。"
  }
]

export default function ReviewWorkbenchPage() {
  const { role } = useRole()
  const [reviews, setReviews] = useState<ReviewItem[]>(INITIAL_REVIEWS)
  const [selectedId, setSelectedId] = useState<string>(INITIAL_REVIEWS[0]?.id ?? "")
  const [feedback, setFeedback] = useState("")
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  const selectedItem = reviews.find((r) => r.id === selectedId)

  // Trigger toast notification
  const triggerToast = (msg: string) => {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 3000)
  }

  // Handle Quick Approve
  const handleApprove = () => {
    if (!selectedItem) return
    triggerToast(`【${selectedItem.title}】已快速审核通过！`)
    const nextReviews = reviews.filter((r) => r.id !== selectedItem.id)
    setReviews(nextReviews)
    if (nextReviews.length > 0) {
      setSelectedId(nextReviews[0].id)
    } else {
      setSelectedId("")
    }
    setFeedback("")
  }

  // Handle Return for revision
  const handleReturn = () => {
    if (!selectedItem) return
    if (!feedback.trim()) {
      triggerToast("请在下方输入退回修改的具体批注和意见！")
      return
    }
    triggerToast(`【${selectedItem.title}】已退回给作者进行修改。`)
    const nextReviews = reviews.filter((r) => r.id !== selectedItem.id)
    setReviews(nextReviews)
    if (nextReviews.length > 0) {
      setSelectedId(nextReviews[0].id)
    } else {
      setSelectedId("")
    }
    setFeedback("")
  }

  // Simulated role switch warning
  const isAuthorized = role === "editor" || role === "admin"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={["审稿工作台"]}
        title="审稿工作台"
        description="聚合编辑辖下所有项目中，作者最新提交审核的各阶段大纲与正文稿件"
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm text-primary-foreground shadow-lg animate-in fade-in slide-in-from-bottom-5">
          <CheckCircle className="size-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Role Notice */}
      {!isAuthorized && (
        <div className="flex items-center gap-3.5 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <Info className="size-4 shrink-0 text-amber-600" />
          <div>
            <span className="font-semibold">角色预览提示：</span>
            当前登录角色为【作者】。该页面仅供【编辑】和【管理员】使用。已为您模拟切换至编辑（林编辑）的视角进行界面展示。
          </div>
        </div>
      )}

      {reviews.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-20 text-center gap-4 border-dashed border-2">
          <div className="flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle className="size-7" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-medium text-foreground">所有待审稿件已处理完毕</h3>
            <p className="text-sm text-muted-foreground">干得漂亮！当前没有任何待审核的章节、大纲或质检文档。</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 左侧：待审稿件列表 (1/3 宽) */}
          <div className="flex flex-col gap-3 lg:col-span-1">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 py-1">
              待审稿件 ({reviews.length})
            </div>
            
            <div className="flex flex-col gap-3">
              {reviews.map((item) => {
                const active = item.id === selectedId
                return (
                  <Card
                    key={item.id}
                    className={`flex flex-col gap-3 p-4 cursor-pointer border transition-all hover:border-primary/50 hover:shadow-xs ${
                      active ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border bg-card"
                    }`}
                    onClick={() => {
                      setSelectedId(item.id)
                      setFeedback("")
                    }}
                  >
                    <div className="flex flex-col gap-1">
                      <span className="text-xs text-muted-foreground truncate">{item.projectName}</span>
                      <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        {item.authorName}
                      </span>
                      <span>{item.words} 字</span>
                    </div>

                    <div className="flex items-center justify-between border-t border-border/40 pt-2.5 mt-0.5 text-[11px] text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        提交：{item.submittedAt.split(" ")[1]}
                      </span>
                      <ChevronRight className={`size-4 transition-transform ${active ? "text-primary translate-x-1" : "text-muted-foreground"}`} />
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>

          {/* 右侧：审稿与对比详情 (2/3 宽) */}
          {selectedItem && (
            <Card className="flex flex-col lg:col-span-2 p-5 border border-border bg-card shadow-sm gap-5">
              {/* 头部信息 */}
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground">{selectedItem.projectName}</span>
                  <h2 className="text-lg font-bold text-foreground">{selectedItem.title}</h2>
                </div>
                <Button asChild size="sm" variant="outline" className="bg-transparent self-start sm:self-auto">
                  <Link href={`/projects/${selectedItem.projectId}/docs/${selectedItem.docType}`}>
                    <ExternalLink className="mr-1.5 size-3.5" />
                    进入详细审稿流
                  </Link>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-4">
                <div>
                  <p className="text-muted-foreground">提交作者</p>
                  <p className="mt-1 font-semibold text-foreground">{selectedItem.authorName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">字数</p>
                  <p className="mt-1 font-semibold text-foreground">{selectedItem.words} 字</p>
                </div>
                <div>
                  <p className="text-muted-foreground">提交时间</p>
                  <p className="mt-1 font-semibold text-foreground">{selectedItem.submittedAt}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">状态</p>
                  <p className="mt-0.5">
                    <StatusBadge label="待审核" tone="warning" />
                  </p>
                </div>
              </div>

              {/* 作者留言 */}
              <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 text-xs leading-relaxed text-foreground">
                <span className="font-semibold text-primary block mb-1">💬 作者留言：</span>
                {selectedItem.submitNote}
              </div>

              <Separator />

              {/* 稿件内容对比 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">内容预览与历史修改对比</h3>
                  <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    <Sparkles className="size-3" />
                    对比前次草稿
                  </span>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                    <span className="text-[11px] font-medium text-muted-foreground block border-b border-border pb-1.5">上个版本</span>
                    <p className="text-xs text-muted-foreground/80 leading-relaxed line-through">
                      {selectedItem.oldPreviewText || "暂无前次修改对比"}
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background p-3 space-y-2">
                    <span className="text-[11px] font-medium text-primary block border-b border-primary/20 pb-1.5">新提交待审版</span>
                    <p className="text-xs text-foreground leading-relaxed">
                      {selectedItem.previewText}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* 快捷处理区 */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">快捷审核处理</h3>
                <div className="space-y-2">
                  <Textarea
                    placeholder="输入退回修改的批注意见，或者同意通过的寄语..."
                    value={feedback}
                    onChange={(e) => setFeedback(e.target.value)}
                    className="border-border bg-background text-sm min-h-[70px]"
                  />
                  <p className="text-[10px] text-muted-foreground">批注字数将同步记录在章节 Doc 的最后一次修改记录中。</p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  <Button variant="outline" className="bg-transparent text-red-600 border-red-200 hover:bg-red-50" onClick={handleReturn}>
                    <Undo2 className="mr-1.5 size-4" />
                    退回修改
                  </Button>
                  <Button className="ml-auto" onClick={handleApprove}>
                    <ThumbsUp className="mr-1.5 size-4" />
                    审核通过
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
