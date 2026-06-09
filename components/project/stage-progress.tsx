import { cn } from "@/lib/utils"
import { STAGE_ORDER, type ProjectItem } from "@/lib/project-data"
import { PROJECT_STAGE_LABELS } from "@/lib/types"
import { Check, Lock } from "lucide-react"

interface StageProgressProps {
  project: ProjectItem
}

// 阶段进度条：梗概 → 细纲 → 正文 → 全文质检 → 完成
export function StageProgress({ project }: StageProgressProps) {
  const currentIndex = STAGE_ORDER.indexOf(project.stage)

  return (
    <div className="flex items-center">
      {STAGE_ORDER.map((stage, i) => {
        const done = i < currentIndex || project.lifecycle === "completed"
        const active = i === currentIndex && project.lifecycle !== "completed"
        const locked = i > currentIndex && project.lifecycle !== "completed"
        return (
          <div key={stage} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  "flex size-9 items-center justify-center rounded-full border text-xs font-medium",
                  done && "border-emerald-500 bg-emerald-500 text-white",
                  active && "border-primary bg-primary text-primary-foreground",
                  locked && "border-border bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : locked ? <Lock className="size-3.5" /> : i + 1}
              </div>
              <span
                className={cn(
                  "whitespace-nowrap text-xs",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {PROJECT_STAGE_LABELS[stage]}
              </span>
            </div>
            {i < STAGE_ORDER.length - 1 && (
              <div className={cn("mx-2 h-0.5 flex-1 rounded", i < currentIndex ? "bg-emerald-500" : "bg-border")} />
            )}
          </div>
        )
      })}
    </div>
  )
}
