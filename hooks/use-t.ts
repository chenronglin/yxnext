"use client"

import { useI18n } from "@/components/i18n-provider"

// 页面组件只关心翻译函数时使用这个 hook，避免每个文件重复解构 i18n 上下文。
export function useT() {
  return useI18n().t
}
