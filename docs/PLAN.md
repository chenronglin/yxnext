你现在的目录很适合做成：

```txt
Next.js UI
+ app/api Route Handlers
+ server 业务服务层
+ Prisma
+ MySQL v8
```

不要把后端业务直接写进页面，也不要把 SQL 写进 `app/api/route.ts`。你的项目核心是 Doc、CurrentDraft、Revision、阶段门禁、权限互斥，这些规则非常重：业务说明里明确要求四类 Doc 都保存完整文档 JSON，后端整体存取、不解析内部节点；CurrentDraft 是唯一当前可编辑稿件，提交/退回/通过才生成 Revision；Doc 状态、`holder_role`、`active_draft_id` 共同决定编辑权。

------

# 1. 你的现有目录怎么处理

你现在大概是：

```txt
app/
  (app)/
    admin/
    dashboard/
    governance/
    my-si/
    notifications/
    projects/
    reports/
    settings/
    si/
    todos/
    layout.tsx
  (auth)/
  globals.css
  layout.tsx
  page.tsx

components/

lib/
  admin-data.ts
  doc-data.ts
  navigation.ts
  project-data.ts
  si-data.ts
  types.ts
  utils.ts

public/
```

这个结构不用推倒重来。`(app)` 和 `(auth)` 是 Next.js Route Groups，括号目录只用于组织路由，不会进入 URL 路径；很适合你这种“登录前页面”和“登录后后台页面”分组方式。([Next.js](https://nextjs.org/docs/app/building-your-application/routing/route-groups?utm_source=chatgpt.com))

你现在最应该做的是：**把 v0 生成的 mock data 层从真实业务层里隔离出来**。

建议改成：

```txt
app/
  (app)/
  (auth)/
  api/
components/
features/
server/
prisma/
mocks/
config/
types/
lib/
public/
```

具体迁移建议：

```txt
lib/admin-data.ts      -> mocks/admin-data.ts
lib/doc-data.ts        -> mocks/doc-data.ts
lib/project-data.ts    -> mocks/project-data.ts
lib/si-data.ts         -> mocks/si-data.ts

lib/navigation.ts      -> config/navigation.ts
lib/types.ts           -> types/domain.ts
lib/utils.ts           -> lib/utils.ts
```

`lib` 以后只放纯工具函数，例如：

```txt
lib/
  utils.ts
  cn.ts
  format.ts
  api-client.ts
```

不要再把业务 mock、数据库访问、权限判断、状态机都塞进 `lib`。

------

# 2. 推荐最终目录结构

我建议你先按这个落地：

```txt
app/
  (auth)/
    login/
      page.tsx
    register/
      page.tsx
    pending/
      page.tsx

  (app)/
    layout.tsx

    dashboard/
      page.tsx

    todos/
      page.tsx

    notifications/
      page.tsx

    si/
      page.tsx
      new/
        page.tsx
      [siId]/
        page.tsx
        edit/
          page.tsx
        versions/
          page.tsx

    my-si/
      page.tsx
      [recordId]/
        page.tsx

    projects/
      page.tsx
      [projectId]/
        page.tsx
        docs/
          [docId]/
            page.tsx
            revisions/
              page.tsx
              [revisionId]/
                page.tsx
        chapters/
          page.tsx
        release/
          page.tsx

    governance/
      projects/
        page.tsx
      users/
        page.tsx
      approvals/
        page.tsx
      bindings/
        page.tsx
      params/
        page.tsx
      logs/
        page.tsx

    reports/
      page.tsx

    settings/
      page.tsx

  api/
    auth/
    users/
    si/
    si-prepublish/
    projects/
    docs/
    notifications/
    todos/
    reports/
    admin/

components/
  ui/
  layout/
  common/

features/
  auth/
  user/
  si/
  project/
  doc/
  notification/
  todo/
  report/
  admin/

server/
  db/
  auth/
  modules/
  shared/

prisma/
  schema.prisma
  seed.ts

mocks/
  admin-data.ts
  doc-data.ts
  project-data.ts
  si-data.ts

config/
  navigation.ts

types/
  domain.ts
  api.ts
```

其中最关键的是这条调用链：

```txt
页面 / Client Component
  -> features/doc/api.ts
    -> app/api/docs/[docId]/save/route.ts
      -> server/modules/doc/doc.service.ts
        -> server/modules/doc/doc.repo.ts
          -> server/db/prisma.ts
            -> MySQL
```

`app/api` 只做 HTTP 入口。真正业务放在 `server/modules`。

------

# 3. ORM 用 Prisma 还是 Drizzle？

## 建议：先用 Prisma

你的情况更适合 Prisma，原因有三个。

第一，你已经完成 MySQL v8 数据库设计。如果数据库表已经建好，Prisma 可以通过 `prisma db pull` 从现有数据库反向生成 Prisma schema；官方文档也说明 `db pull` 会连接数据库并把当前数据库结构反映到 Prisma schema 里。注意先 commit，因为 `db pull` 会覆盖当前 schema。([Prisma文档](https://docs.prisma.io/docs/cli/db/pull?utm_source=chatgpt.com))

第二，你的业务有大量事务：SI 转项目、Doc 保存、提交、退回、通过、全文质检解锁、项目完成。这些都要在事务里同时更新多个表。Prisma 的 `$transaction` 支持顺序事务和 interactive transactions，后者适合“读 → 判断 → 写 → 创建通知 → 写日志”这种复杂业务流。([Prisma](https://www.prisma.io/docs/orm/v6/prisma-client/queries/transactions?utm_source=chatgpt.com))

第三，你的核心 Doc 内容是完整文档 JSON。Prisma 支持 `Json` 字段读取、写入和基础过滤；MySQL 下也支持 JSON path 语法。你这个项目虽然不建议后端解析文档内部节点，但 `CurrentDraft.content_json`、`Revision.content_json` 用 Prisma `Json` 字段是可行的。([Prisma](https://www.prisma.io/docs/orm/prisma-client/special-fields-and-types/working-with-json-fields?utm_source=chatgpt.com))

Drizzle 也可以用，尤其适合 SQL-first、极致控制 SQL、复杂报表查询很多的团队；Drizzle 原生支持 MySQL `mysql2`，也支持事务。([Drizzle ORM](https://orm.drizzle.team/docs/get-started-mysql?utm_source=chatgpt.com))
但考虑你要继续大量用 AI 编程，Prisma 的模型、关系、service 代码更容易让 AI 稳定生成和理解。

所以我建议：

```txt
主 ORM：Prisma
复杂统计报表：必要时用 prisma.$queryRaw 写 SQL
不要一开始上 Drizzle
```

------

# 4. Prisma 具体怎么接入

先装依赖：

```bash
pnpm add @prisma/client zod bcryptjs jose server-only
pnpm add -D prisma tsx vitest
```

初始化：

```bash
pnpm prisma init --datasource-provider mysql
```

`.env`：

```env
DATABASE_URL="mysql://root:123456@localhost/yuexiang"
SESSION_SECRET="replace-with-long-random-secret"
```

如果你的 MySQL 表已经建好了，先反向拉取：

```bash
pnpm prisma db pull
pnpm prisma generate
```

如果数据库还没真正落地，只是有设计文档，那就把设计转成 `prisma/schema.prisma`，再执行：

```bash
pnpm prisma migrate dev --name init
pnpm prisma generate
```

建议 `package.json` 加脚本：

```json
{
  "scripts": {
    "db:pull": "prisma db pull",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "test": "vitest"
  }
}
```

------

# 5. Prisma Client 放哪里

新增：

```txt
server/
  db/
    prisma.ts
```

示例：

```ts
// server/db/prisma.ts
import "server-only"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  })

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
```

`server-only` 的作用是防止服务端代码被误导入客户端组件；Next.js 官方也建议用它来阻止 server-only code 进入 client bundle。([Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components?utm_source=chatgpt.com))

所有 `server/**` 文件顶部建议都加：

```ts
import "server-only"
```

特别是这些：

```txt
server/db/prisma.ts
server/auth/session.ts
server/modules/**/*
```

------

# 6. `app/api` 应该怎么写

Next.js App Router 里，`route.ts` 可以作为 Route Handler，支持 `GET`、`POST`、`PUT`、`PATCH`、`DELETE` 等方法；它只在 `app` 目录里生效，并且相当于 Pages Router 里的 API Routes。([Next.js](https://nextjs.org/docs/app/getting-started/route-handlers?utm_source=chatgpt.com))

你的 `app/api` 建议这样划分：

```txt
app/api/
  auth/
    login/
      route.ts
    logout/
      route.ts
    me/
      route.ts

  si/
    route.ts
    [siId]/
      route.ts
      prepublish/
        route.ts
      versions/
        route.ts
      versions/
        [versionId]/
          restore/
            route.ts

  si-prepublish/
    [recordId]/
      withdraw/
        route.ts
      convert-to-project/
        route.ts

  projects/
    route.ts
    [projectId]/
      route.ts
      chapters/
        route.ts
      unlock-release/
        route.ts
      complete/
        route.ts
      archive/
        route.ts
      cancel/
        route.ts
      restore/
        route.ts
      export/
        route.ts

  docs/
    [docId]/
      current/
        route.ts
      save/
        route.ts
      submit/
        route.ts
      return/
        route.ts
      approve/
        route.ts
      revisions/
        route.ts
      revisions/
        [revisionId]/
          route.ts

  notifications/
    route.ts
    read/
      route.ts

  todos/
    route.ts

  reports/
    dashboard/
      route.ts

  admin/
    users/
      route.ts
    approvals/
      route.ts
    bindings/
      route.ts
    params/
      route.ts
    projects/
      route.ts
```

Route Handler 里不要写复杂业务。示例：

```ts
// app/api/docs/[docId]/submit/route.ts
import { NextRequest } from "next/server"
import { submitDoc } from "@/server/modules/doc/doc.service"
import { requireSession } from "@/server/auth/session"
import { ok, fail } from "@/server/shared/api-response"

export const runtime = "nodejs"

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ docId: string }> }
) {
  try {
    const session = await requireSession()
    const { docId } = await context.params
    const body = await request.json()

    const result = await submitDoc({
      docId,
      userId: session.userId,
      role: session.role,
      submitNote: body.submitNote,
      lockVersion: body.lockVersion,
    })

    return ok(result)
  } catch (error) {
    return fail(error)
  }
}
```

建议所有 API 都显式使用 Node.js Runtime：

```ts
export const runtime = "nodejs"
```

因为你要用 MySQL、Prisma、导出、文件处理、复杂事务。Next.js 官方文档说明 Node.js Runtime 是默认运行时，可访问所有 Node.js API；Edge Runtime API 更受限，部分包可能不可用。([Next.js](https://nextjs.org/docs/app/api-reference/edge?utm_source=chatgpt.com))

------

# 7. `server/modules` 怎么划分

你的后端业务模块建议这样：

```txt
server/
  modules/
    auth/
      auth.service.ts
      password.service.ts
      session.service.ts

    user/
      user.service.ts
      user.repo.ts
      user.policy.ts
      user.schema.ts

    binding/
      binding.service.ts
      binding.repo.ts
      binding.policy.ts

    si/
      si.service.ts
      si.repo.ts
      si-version.service.ts
      si-prepublish.service.ts
      si.policy.ts
      si.schema.ts

    project/
      project.service.ts
      project.repo.ts
      project-stage.service.ts
      project-plan.service.ts
      project-lifecycle.service.ts
      release.service.ts
      project.policy.ts
      project.schema.ts

    doc/
      doc.service.ts
      doc.repo.ts
      doc-workflow.service.ts
      doc-state-machine.ts
      current-draft.service.ts
      revision.service.ts
      clean-doc.service.ts
      doc.policy.ts
      doc.schema.ts

    notification/
      notification.service.ts
      notification.repo.ts

    todo/
      todo.service.ts
      todo.repo.ts

    audit/
      audit.service.ts
      audit.repo.ts

    report/
      report.service.ts
      report.repo.ts

    export/
      export.service.ts
      word-export.service.ts
      markdown-export.service.ts
```

我会把最复杂的 `doc` 单独拆细一点：

```txt
doc.service.ts
```

对外暴露用例：

```ts
getCurrentDoc()
saveCurrentDraft()
submitDoc()
returnDoc()
approveDoc()
getRevisions()
getRevisionDetail()
doc-workflow.service.ts
```

负责状态流转：

```ts
authorSubmit()
editorReturn()
editorApprove()
reopenApprovedDoc()
doc-state-machine.ts
```

集中定义合法状态：

```ts
export const DOC_STATUS = {
  DRAFT: "draft",
  SUBMITTED: "submitted",
  RETURNED: "returned",
  APPROVED: "approved",
} as const

export const HOLDER_ROLE = {
  AUTHOR: "author",
  EDITOR: "editor",
  NONE: "none",
} as const
current-draft.service.ts
```

负责：

```txt
读取 active draft
保存 draft
检查 lock_version
封存 draft
创建下一份 active draft
revision.service.ts
```

负责：

```txt
生成 R1/R2/R3
保存 author_submit / editor_return / editor_approve
设置 latest_revision_id
设置 final_revision_id
```

你的说明书要求提交、退回、通过都会封存 CurrentDraft 并生成 Revision；普通保存只更新 CurrentDraft，不生成历史快照。这个规则一定要放在 `doc-workflow.service.ts`，不要分散在各个 API 文件里。

------

# 8. `features` 目录怎么用

`features` 是前端业务模块，不碰数据库。

建议：

```txt
features/
  doc/
    api.ts
    hooks.ts
    types.ts
    components/
      doc-editor-shell.tsx
      doc-status-badge.tsx
      revision-list.tsx
      submit-dialog.tsx
      return-dialog.tsx
      approve-dialog.tsx

  si/
    api.ts
    hooks.ts
    types.ts
    components/
      si-form.tsx
      si-list.tsx
      si-version-list.tsx
      prepublish-dialog.tsx

  project/
    api.ts
    hooks.ts
    types.ts
    components/
      project-stage-bar.tsx
      project-doc-list.tsx
      release-unlock-dialog.tsx

  admin/
    users/
    bindings/
    approvals/
    params/

  notification/
  todo/
  report/
```

例如：

```ts
// features/doc/api.ts
import { apiClient } from "@/lib/api-client"

export async function saveDocDraft(docId: string, input: {
  contentJson: unknown
  plainText: string
  wordCount: number
  lockVersion: number
}) {
  return apiClient.post(`/api/docs/${docId}/save`, input)
}
```

页面里只调 `features`：

```tsx
import { saveDocDraft } from "@/features/doc/api"
```

不要让页面直接调：

```tsx
import { prisma } from "@/server/db/prisma"
```

也不要让页面直接写复杂 fetch。

------

# 9. `components` 目录保留 UI 组件

`components` 建议分三类：

```txt
components/
  ui/
    button.tsx
    dialog.tsx
    input.tsx
    table.tsx
    badge.tsx

  layout/
    app-sidebar.tsx
    app-header.tsx
    breadcrumb.tsx
    role-nav.tsx

  common/
    status-badge.tsx
    empty-state.tsx
    confirm-dialog.tsx
    pagination.tsx
    search-filter-bar.tsx
```

业务强相关组件不要长期堆在 `components` 根目录。比如 `doc-editor-shell.tsx`、`si-form.tsx`、`project-stage-bar.tsx` 更适合进 `features/doc/components`、`features/si/components`、`features/project/components`。

v0.dev 通常会生成大量 client component。Next.js 里只有需要交互、状态、事件、浏览器 API 的组件才需要 `"use client"`；官方文档也说明 `"use client"` 是 client/server 边界，不必给每个文件都加。([Next.js](https://nextjs.org/docs/app/api-reference/directives/use-client?utm_source=chatgpt.com))

------

# 10. Auth 怎么做

你这个系统是内部业务平台，不是 C 端开放系统。我建议第一版不要引入太复杂的 OAuth，先做：

```txt
users 表
sessions 表
httpOnly cookie
服务端 requireSession()
服务端权限校验
```

目录：

```txt
server/auth/
  session.ts
  password.ts
  permissions.ts
  role-check.ts
```

示例权限函数：

```ts
// server/auth/permissions.ts
import "server-only"

export function assertRole(
  actualRole: string,
  allowedRoles: string[]
) {
  if (!allowedRoles.includes(actualRole)) {
    throw new Error("FORBIDDEN")
  }
}
```

后续再细化：

```ts
assertProjectEditor(projectId, userId)
assertProjectAuthor(projectId, userId)
assertDocHolder(docId, userId)
assertAdmin(userId)
```

不要只靠前端隐藏按钮。你的业务说明里明确了管理员、编辑、作者在 SI、项目、Doc、全文质检、导出上的权限边界；这些必须在后端 service 中重复校验。

------

# 11. Prisma Model 设计注意点

你已经有 MySQL 设计，所以这里不是让你重做表，而是建议 Prisma 层重点关注这些模型。

核心表至少应该覆盖：

```txt
User
UserSession
EditorAuthorBinding

SI
SIVersion
SIPrepublishRecord

Project
ProjectStagePlan

Doc
CurrentDraft
Revision

Notification
Todo
AuditLog
ExportJob
```

Doc 相关 Prisma 模型大致像这样，字段名按你现有数据库实际调整：

```prisma
model Doc {
  id               String   @id
  projectId        String
  type             String
  title            String
  sortOrder        Int?
  status           String
  holderRole       String
  activeDraftId    String?
  latestRevisionId String?
  finalRevisionId  String?
  wordCount        Int      @default(0)
  summary          String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  currentDrafts    CurrentDraft[]
  revisions        Revision[]
}

model CurrentDraft {
  id             String   @id
  docId          String
  ownerRole      String
  ownerUserId    String
  baseRevisionId String?
  contentJson    Json
  plainText      String?  @db.LongText
  exportText     String?  @db.LongText
  status         String
  lockVersion    Int      @default(1)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  doc            Doc      @relation(fields: [docId], references: [id])
}

model Revision {
  id             String   @id
  docId          String
  versionNo      Int
  baseRevisionId String?
  action         String
  operatorRole   String
  operatorUserId String
  contentJson    Json
  plainText      String?  @db.LongText
  exportText     String?  @db.LongText
  note           String?
  contentHash    String?
  createdAt      DateTime @default(now())

  doc            Doc      @relation(fields: [docId], references: [id])
}
```

关于 `contentJson` 有两个选择：

```txt
方案 A：MySQL JSON + Prisma Json
```

适合第一版。好处是数据库层会保证合法 JSON，Prisma 读写方便。

```txt
方案 B：MySQL LONGTEXT + 应用层 JSON.stringify / JSON.parse
```

适合单章内容特别大、完全不查 JSON 内部、只做整体存取的情况。

结合你的业务说明“后端不解析文档 JSON 内部节点结构”，第一版可以先用 `Json`，后面如果发现文档非常大或写入性能不好，再切到 `LONGTEXT`。

------

# 12. 最先开发哪些 API

不要一口气做所有页面。第一阶段只做核心闭环。

## 第 1 批：Auth + 当前用户

```txt
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

目标：

```txt
登录后能进入 app/(app)
前端能拿到 currentUser
导航能按 role 显示
```

------

## 第 2 批：Doc 核心接口

```txt
GET  /api/docs/[docId]/current
POST /api/docs/[docId]/save
POST /api/docs/[docId]/submit
POST /api/docs/[docId]/return
POST /api/docs/[docId]/approve
GET  /api/docs/[docId]/revisions
GET  /api/docs/[docId]/revisions/[revisionId]
```

这是整个系统的心脏。先把这套做稳。

`save`：

```txt
校验登录
校验当前用户是 holder
校验 lock_version
更新 CurrentDraft
递增 lock_version
不生成 Revision
写 audit_log
```

`submit`：

```txt
校验作者持有编辑权
封存当前 CurrentDraft
生成 author_submit Revision
创建新的 active CurrentDraft 给编辑
更新 Doc.status = 已提交待审
更新 holder_role = editor
通知编辑
写 audit_log
```

`return`：

```txt
校验编辑持有编辑权
校验退回说明必填
封存当前 CurrentDraft
生成 editor_return Revision
创建新的 active CurrentDraft 给作者
更新 Doc.status = 退回待改
更新 holder_role = author
通知作者
写 audit_log
```

`approve`：

```txt
校验编辑持有编辑权
封存当前 CurrentDraft
生成 editor_approve Revision
设置 final_revision_id
更新 Doc.status = 审核通过
更新 holder_role = none
推进项目阶段
通知作者
写 audit_log
```

这些动作全部必须用事务。

------

## 第 3 批：SI 到项目

```txt
GET  /api/si
POST /api/si
GET  /api/si/[siId]
PATCH /api/si/[siId]

POST /api/si/[siId]/prepublish
POST /api/si-prepublish/[recordId]/withdraw
POST /api/si-prepublish/[recordId]/convert-to-project
```

`convert-to-project` 必须事务化：

```txt
校验预发记录有效
校验未转项目
创建 Project
创建 ProjectStagePlan
创建梗概 Doc
更新预发记录为已确认转项目
更新 SI 状态
通知作者
写 audit_log
```

SI 预发必须从预发记录确认转项目；已收回记录作者端隐藏，已转项目记录不可收回、不可重复建项目。

------

## 第 4 批：项目阶段推进

```txt
GET  /api/projects
GET  /api/projects/[projectId]
POST /api/projects/[projectId]/chapters
POST /api/projects/[projectId]/unlock-release
POST /api/projects/[projectId]/complete
```

`unlock-release` 要严格校验：

```txt
当前用户是项目编辑
项目处于正文阶段
所有正文 Doc 已审核通过
全文质检 Doc 尚未创建或尚未解锁
汇总正文最终 Revision 生成全文质检初始内容
创建全文质检 Doc
项目阶段转全文质检
通知作者
写 audit_log
```

全文质检必须全部正文通过后由编辑手动解锁，不能自动解锁；解锁后修改只作用于全文质检 Doc，不回写单章。

------

# 13. 统一响应、错误和校验

新增：

```txt
server/shared/
  api-response.ts
  errors.ts
  pagination.ts
  zod.ts
  logger.ts
  constants.ts
```

统一响应：

```ts
// server/shared/api-response.ts
import { NextResponse } from "next/server"

export function ok<T>(data: T) {
  return NextResponse.json({
    success: true,
    data,
  })
}

export function fail(error: unknown) {
  const normalized = normalizeError(error)

  return NextResponse.json(
    {
      success: false,
      error: {
        code: normalized.code,
        message: normalized.message,
        details: normalized.details,
      },
    },
    { status: normalized.status }
  )
}
```

统一业务错误：

```ts
export class AppError extends Error {
  constructor(
    public code: string,
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message)
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", 401, "请先登录"),
  forbidden: () => new AppError("FORBIDDEN", 403, "无权执行该操作"),
  notFound: (name = "资源") => new AppError("NOT_FOUND", 404, `${name}不存在`),
  conflict: (message = "数据已被更新，请刷新后重试") =>
    new AppError("CONFLICT", 409, message),
  invalidState: (message = "当前状态不允许该操作") =>
    new AppError("INVALID_STATE", 400, message),
}
```

所有输入用 Zod：

```txt
server/modules/doc/doc.schema.ts
server/modules/si/si.schema.ts
server/modules/project/project.schema.ts
```

------

# 14. 页面如何从 mock 切到真实数据

你现在 `lib/project-data.ts`、`lib/doc-data.ts` 很可能被页面直接 import。不要一次性全删，分三步替换。

## 第一步：移动 mock

```bash
mkdir -p mocks config types

git mv lib/admin-data.ts mocks/admin-data.ts
git mv lib/doc-data.ts mocks/doc-data.ts
git mv lib/project-data.ts mocks/project-data.ts
git mv lib/si-data.ts mocks/si-data.ts
git mv lib/navigation.ts config/navigation.ts
git mv lib/types.ts types/domain.ts
```

然后修复 import。

## 第二步：新增 API client

```ts
// lib/api-client.ts
export const apiClient = {
  async get<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      credentials: "include",
    })
    return handleResponse<T>(res)
  },

  async post<T>(url: string, body?: unknown): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(body ?? {}),
    })
    return handleResponse<T>(res)
  },
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json()

  if (!json.success) {
    throw new Error(json.error?.message ?? "请求失败")
  }

  return json.data as T
}
```

## 第三步：逐页替换

例如项目列表页原来可能是：

```ts
import { projects } from "@/lib/project-data"
```

逐步改成：

```ts
import { getProjects } from "@/features/project/api"
```

不要一天内把所有页面都接 API。先接：

```txt
登录
项目列表
项目详情
Doc 当前稿件
Doc 保存/提交/退回/通过
```

------

# 15. 测试优先级

你这个项目最容易出 bug 的地方不是 UI，而是状态流转。

先写 service 层测试：

```txt
tests/
  doc-workflow.test.ts
  si-convert-to-project.test.ts
  release-unlock.test.ts
  permission.test.ts
```

Doc workflow 至少测这些：

```txt
作者可保存草稿
非持有人不能保存
作者提交后 holder_role 变 editor
作者提交后生成 author_submit Revision
编辑退回必须填写说明
编辑退回后 holder_role 变 author
编辑通过后 holder_role 变 none
普通保存不生成 Revision
lock_version 冲突时报 409
审核通过后 final_revision_id 正确
```

这些正好对应你的业务验收要点：当前稿件只允许当前持有人编辑，历史版本只读，每次提交/退回/通过生成 Revision，退回必须保留反馈。

------

# 16. 第一周实际开发顺序

## Day 1：整理结构 + Prisma 接入

完成：

```txt
新增 server/
新增 features/
新增 prisma/
移动 mock data
配置 DATABASE_URL
prisma db pull / generate
创建 server/db/prisma.ts
```

不要改业务页面。

------

## Day 2：Auth

完成：

```txt
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me
requireSession()
middleware 或页面级登录保护
按角色展示导航
```

------

## Day 3：Doc 读取和保存

完成：

```txt
GET /api/docs/[docId]/current
POST /api/docs/[docId]/save
Doc 编辑器加载真实 CurrentDraft
保存 lock_version
保存 word_count / plain_text / content_json
```

------

## Day 4：Doc 提交、退回、通过

完成：

```txt
POST /api/docs/[docId]/submit
POST /api/docs/[docId]/return
POST /api/docs/[docId]/approve
Revision 生成
CurrentDraft 封存
新 CurrentDraft 创建
通知和 audit_log 写入
```

------

## Day 5：项目详情接真实数据

完成：

```txt
GET /api/projects
GET /api/projects/[projectId]
项目阶段展示
Doc 列表展示
当前阶段入口
```

这一步完成后，项目核心就基本“站起来”了。

------

# 17. 你现在应该立刻做的目录改造

可以直接按这个做：

```txt
mkdir -p server/db
mkdir -p server/auth
mkdir -p server/shared

mkdir -p server/modules/doc
mkdir -p server/modules/si
mkdir -p server/modules/project
mkdir -p server/modules/user
mkdir -p server/modules/binding
mkdir -p server/modules/notification
mkdir -p server/modules/todo
mkdir -p server/modules/audit
mkdir -p server/modules/report
mkdir -p server/modules/export

mkdir -p features/doc
mkdir -p features/si
mkdir -p features/project
mkdir -p features/user
mkdir -p features/admin
mkdir -p features/notification
mkdir -p features/todo
mkdir -p features/report

mkdir -p mocks
mkdir -p config
mkdir -p types
```

然后移动：

```txt
lib/admin-data.ts      -> mocks/admin-data.ts
lib/doc-data.ts        -> mocks/doc-data.ts
lib/project-data.ts    -> mocks/project-data.ts
lib/si-data.ts         -> mocks/si-data.ts
lib/navigation.ts      -> config/navigation.ts
lib/types.ts           -> types/domain.ts
```

保留：

```txt
lib/utils.ts
```

新增：

```txt
lib/api-client.ts
server/db/prisma.ts
server/shared/api-response.ts
server/shared/errors.ts
server/auth/session.ts
server/auth/permissions.ts
```

------

# 18. 最终建议

你当前项目最合适的路线是：

```txt
不拆独立后端
不重构掉 v0 UI
保留 app/(app) 和 app/(auth)
新增 app/api
新增 server/modules
新增 Prisma
逐步把 mock data 替换为 API
先做 Doc 协作闭环，再做 SI 和项目治理
```

ORM 用：

```txt
Prisma 优先
Drizzle 暂不采用
复杂报表必要时用 prisma.$queryRaw
```

最重要的工程边界是：

```txt
app/api = 请求入口
server/modules = 业务规则
server/db = 数据访问
features = 前端业务调用和组件
components = 通用 UI
mocks = v0 临时数据
```

