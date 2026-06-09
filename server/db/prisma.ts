// server/db/prisma.ts
import "server-only"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

function createPrismaClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error("缺少 DATABASE_URL，Prisma 无法连接 MySQL 数据库")
  }

  // Prisma 7 使用 client engine 访问 MySQL 时需要 driver adapter；这里仍然由 Prisma Client 统一管理查询。
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL)

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })
}

export const prisma =
  globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
