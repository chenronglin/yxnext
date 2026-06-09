import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

// 测试环境需要解析 Next.js 项目里统一使用的 @/ 路径别名。
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/support/server-only.ts", import.meta.url)),
    },
  },
})
