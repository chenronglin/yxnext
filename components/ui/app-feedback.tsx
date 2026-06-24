"use client"

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { useT } from "@/hooks/use-t"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react"

type ConfirmOptions = {
  title: string
  description?: string
  confirmText?: string
  cancelText?: string
  tone?: "default" | "danger"
}

type ToastOptions = {
  type?: "success" | "error" | "info"
  title: string
  description?: string
}

type FeedbackContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
  toast: (options: ToastOptions) => void
}

type ToastItem = ToastOptions & {
  id: number
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null)

export function AppFeedbackProvider({ children }: { children: ReactNode }) {
  const t = useT()
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const [confirmOptions, setConfirmOptions] = useState<ConfirmOptions | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const closeConfirm = useCallback((value: boolean) => {
    const resolver = resolverRef.current

    resolverRef.current = null
    setConfirmOptions(null)
    resolver?.(value)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => {
    // 同一时间只展示一个确认弹窗，避免危险操作连续点击时出现多个未决 Promise。
    resolverRef.current?.(false)
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve
      setConfirmOptions(options)
    })
  }, [])

  const toast = useCallback((options: ToastOptions) => {
    const id = Date.now() + Math.random()
    const item = { id, ...options }

    setToasts((current) => [...current, item])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toastItem) => toastItem.id !== id))
    }, 3200)
  }, [])

  const value = useMemo(() => ({ confirm, toast }), [confirm, toast])
  const confirmTone = confirmOptions?.tone ?? "default"

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(confirmOptions)} onOpenChange={(open) => !open && closeConfirm(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className={confirmTone === "danger" ? "size-5 text-red-500" : "size-5 text-amber-500"} />
              {confirmOptions?.title ?? t("common.confirmAction")}
            </DialogTitle>
            {confirmOptions?.description && <DialogDescription>{confirmOptions.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => closeConfirm(false)}>
              {confirmOptions?.cancelText ?? t("common.cancel")}
            </Button>
            <Button variant={confirmTone === "danger" ? "destructive" : "default"} onClick={() => closeConfirm(true)}>
              {confirmOptions?.confirmText ?? t("common.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="fixed right-4 top-4 z-[60] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
        {toasts.map((item) => {
          const type = item.type ?? "info"
          const Icon = type === "success" ? CheckCircle2 : type === "error" ? XCircle : Info
          const toneClass =
            type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : type === "error"
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-border bg-popover text-popover-foreground"

          return (
            <div key={item.id} className={`rounded-lg border p-3 text-sm shadow-sm ${toneClass}`}>
              <div className="flex items-start gap-2">
                <Icon className="mt-0.5 size-4 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium">{item.title}</p>
                  {item.description && <p className="mt-1 text-xs opacity-80">{item.description}</p>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </FeedbackContext.Provider>
  )
}

export function useConfirmDialog() {
  const context = useContext(FeedbackContext)

  if (!context) {
    throw new Error("useConfirmDialog must be used within AppFeedbackProvider")
  }

  return context.confirm
}

export function useToast() {
  const context = useContext(FeedbackContext)

  if (!context) {
    throw new Error("useToast must be used within AppFeedbackProvider")
  }

  return context.toast
}
