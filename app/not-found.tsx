"use client"

import Link from "next/link"
import { FileQuestion, Home, ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Decorative gradient glowing spots */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-[10%] -top-[10%] h-[40%] w-[40%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute -bottom-[10%] -right-[10%] h-[40%] w-[40%] rounded-full bg-accent/25 blur-[120px]" />
      </div>

      <div className="relative flex max-w-md flex-col items-center text-center">
        {/* Animated Icon Container */}
        <div className="mb-6 flex size-20 items-center justify-center rounded-2xl bg-muted border border-border shadow-sm animate-bounce">
          <FileQuestion className="size-10 text-primary" />
        </div>

        {/* 404 text with gradient */}
        <h1 className="bg-gradient-to-r from-primary to-blue-600 bg-clip-text text-8xl font-black tracking-tight text-transparent">
          404
        </h1>
        
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          页面未找到
        </h2>
        
        <p className="mt-3 text-pretty text-sm text-muted-foreground leading-relaxed">
          很抱歉，您访问的页面不存在、已被移除或正在开发中。
          请检查输入的 URL 路径是否正确。
        </p>

        {/* Action Buttons */}
        <div className="mt-8 flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <Button
            variant="outline"
            className="gap-2 bg-transparent w-full sm:w-auto hover:bg-muted"
            onClick={() => window.history.back()}
          >
            <ArrowLeft className="size-4" />
            返回上一页
          </Button>
          
          <Button asChild className="gap-2 w-full sm:w-auto">
            <Link href="/dashboard">
              <Home className="size-4" />
              回到首页看板
            </Link>
          </Button>
        </div>

        <div className="mt-12 text-xs text-muted-foreground">
          阅享协作管理与审稿平台
        </div>
      </div>
    </div>
  )
}
