# 整改计划（基于 `docs/BUS.md` 与当前代码核验）

更新时间：2026-06-10

## 1. 核验范围与结论

本计划基于以下两类信息整理：

- 业务基线：[`docs/BUS.md`](docs/BUS.md)
- 代码现状：`app/`、`components/`、`server/modules/`、`prisma/`、`.env`

综合结论：

- 后端服务层在 **SI 转项目、Doc 提交/退回/通过、事务、通知、待办、审计日志** 上已经具备较高成熟度。
- 但系统仍存在 **凭据泄露、注册提权、数据库核心唯一约束失效、协作前端未接真实 API、阶段计划逾期状态永不落库** 五类严重问题。
- 对照 BUS，当前系统呈现明显的“**后端已具备、前端未接通**”割裂：治理侧、选题侧基本可用；Doc 协作、编辑/作者工作台、报表、逾期预警、Word 导出尚未真正贯通。

---

## 2. 审计项逐条核验

### 2.1 严重问题（5 项）

| 编号 | 问题 | BUS 对照 | 代码核验 | 结论 | 整改方向 |
| --- | --- | --- | --- | --- | --- |
| S1 | `.env` 已入 Git，含数据库凭据 | 不属于 BUS 业务规则，但属于上线安全红线 | `git ls-files .env` 命中；`.env` 中存在 `DATABASE_URL`、`SESSION_SECRET` | 已确认 | 立刻移出版本库、轮换数据库口令和会话密钥、补 `.env.example` 与密钥管理规范 |
| S2 | 注册可自选 `editor`，审批通过时不重置角色 | BUS §2.4：外部注册用户仅提交邮箱注册申请，审批通过前不可进入业务；BUS 未允许外部自选编辑角色 | `app/(auth)/register/page.tsx` 提供“作者/编辑”选择；`app/api/auth/register/route.ts` 接收 `role`；`server/modules/auth/auth.service.ts` 直接持久化 `role: input.role`；`approveApprovalRequest` 仅把 `status` 改为 `active` | 已确认 | 外部注册入口固定写死 `author`；审批页如需设角色，必须由管理员显式决定且默认作者 |
| S3 | 唯一约束集体失效，核心不变量没有 DB 保护 | BUS §1.4、§5.3、§6.3：每个 Doc 只能有一个 `active` CurrentDraft；单一 Doc/预发/绑定不变量必须成立 | `prisma/schema.prisma` 定义了 `active_pair_key`、`effective_pair_key`、`active_doc_key`、`single_doc_key`、`chapter_order_key`；全仓库检索几乎无写入，仅见 `activeDocKey: null`；`admin.service.ts` 还误注释为“GENERATED ALWAYS” | 已确认 | 先清洗历史脏数据，再补回生成逻辑/应用层写入逻辑，并为冲突返回 409 而非 500 |
| S4 | 协作核心前端大面积仍是 mock，主链未接 API | BUS §5.3、§6.1-§6.9：四类 Doc 必须跑通“当前稿件/历史版本/提交/退回/通过”闭环 | `components/doc/*` 直接读取 `@/mocks/doc-data`；`app/(app)/review/page.tsx` 使用 `INITIAL_REVIEWS`；`app/(app)/projects/page.tsx`、`components/project/project-detail.tsx`、`components/project/project-list.tsx`、`components/dashboard/editor-dashboard.tsx`、`components/dashboard/author-dashboard.tsx`、`app/(app)/reports/page.tsx` 仍存在 mock/硬编码；而 `/api/review`、`/api/dashboard`、`/api/reports`、`/api/projects` 已存在真实后端 | 已确认 | 以现有后端接口为准完成前端接线，优先打通 Doc 编辑器、我的项目、审稿台、编辑/作者看板 |
| S5 | `due_soon` / `overdue` 从不写入，逾期统计恒为 0 | BUS §4、§8.1：阶段计划必须维护“未开始/进行中/即将到期/已逾期/已完成”并提供通知 | `server/modules/doc/doc.service.ts`、`server/modules/project/project.service.ts`、`server/modules/si/si.service.ts` 仅把 `timelineStatus` 写成 `not_started` / `in_progress` / `completed`；`due_soon`、`overdue` 仅出现在查询条件与 DTO 中，没有写入路径 | 已确认 | 增加阶段计划状态计算器与定时任务/触发器，并补齐预警通知、待办、报表口径 |

### 2.2 中等问题（13 项）

| 编号 | 问题 | BUS 对照 | 代码核验 | 结论 | 整改方向 |
| --- | --- | --- | --- | --- | --- |
| M1 | `restore` 后协作链可能断裂 | BUS §3.3、§9：已完成/归档项目恢复后应能继续协作 | `transitionGovernanceProject(..., "restore")` 仅把 `lifecycleStatus` 改回 `active`、写 `restoredAt`；不恢复 `currentStage`、`holder_role`、`active_draft_id`、Release 状态 | 已确认 | 恢复时按 Doc/Release 实际状态重建项目阶段和当前可编辑稿件 |
| M2 | 禁用账号不撤销现有会话 | BUS 治理要求未明写，但属于权限收口基本要求 | `toggleManagedUserStatus` 只改 `users.status` 和通知，不处理 `user_sessions` | 已确认 | 禁用时批量撤销该用户全部未撤销会话 |
| M3 | 改密/管理员重置密码不撤销现有会话 | 同上 | `changeAccountPassword`、`resetManagedUserPassword` 仅更新 `password_hash`，不处理 `user_sessions` | 已确认 | 改密、重置密码后统一吊销旧会话；管理员重置密码后应要求下次登录强制改密 |
| M4 | 管理员可自锁 | BUS §2.1 要求管理员承担治理职责，不能把自己锁死造成治理中断 | `toggleManagedUserStatus` 未拦截 `actor.userId === userId` | 已确认 | 禁止管理员禁用自己；如仅剩一个活动管理员，禁止相互锁死 |
| M5 | 项目归属调整不校验编辑-作者绑定 | BUS §7：可见性与协作关系应随真实归属生效 | `updateGovernanceProjectAssignment` 仅校验用户角色有效，不校验 `editor_author_bindings` 是否存在活动绑定 | 已确认 | 调整归属前强制校验绑定；无绑定则阻断或同步建立绑定 |
| M6 | 质检解锁后仍可新增/排序/删除章节 | BUS §5.2、§5.4、§9：进入质检后应以 Release Doc 为协作对象，章节不应继续被结构性修改 | `createProjectChapter`、`reorderProjectChapters`、`deleteProjectChapter` 仅检查项目是否 `active` 与协作者身份，不检查 `currentStage`；`unlockProjectQc` 会把项目推进到 `release` | 已确认 | 进入 `release` 后锁定章节结构变更，仅允许查看已通过章节与编辑质检 Doc |
| M7 | Clean 正文无校验 | BUS §1.2、§6.2、§6.6、§9：Clean 正文必须是去掉修订/批注/建议后的原文 | `docSaveSchema` 中 `cleanText` 可选；`normalizeSavePayload` 直接回退为 `plainText` | 已确认 | 后端至少校验 `cleanText` 非空且与工作稿派生字段口径一致；更理想方案是前端计算并附带签名/版本校验 |
| M8 | 枚举命名分裂，映射散落 | BUS 统一口径要求：页面叫“质检”，内部编码为 `release`；退回状态应统一 | `rejected -> returned`、`release -> 质检` 的映射分别散落在 `doc.service.ts`、`project.service.ts`、`admin.service.ts`、`workbench.service.ts` 等多个模块 | 已确认 | 收敛为单一共享映射层，避免前后端和不同模块口径继续分叉 |
| M9 | Doc 主行/创建流程缺少并发保护，补回唯一约束后易出现 `P2002 -> 500` | BUS §1.4、§5.3：单一当前稿、单一阶段 Doc 等约束要稳定成立 | 现有创建流程多为“先查后写”（如 `ensureOutlineDocForProject`、`convertSiPreissueToProject`、章节创建等）；全仓库无 `PrismaClientKnownRequestError` / `P2002` 映射 | 已确认 | 先补唯一约束，再补冲突翻译和并发测试；必要时为关键主行增加版本字段或事务重试 |
| M10 | 无登录限流 | BUS 未明写，但属于基础安全要求 | `/api/auth/login` 直接调用 `loginWithPassword`；代码中无 429、rate limit、throttle 逻辑 | 已确认 | 增加基于 IP + account 的限流与失败计数 |
| M11 | 存在账号枚举 | BUS §2.4 要求审批前不可进入流程，不等于允许暴露账号状态 | `/api/auth/login` 对不存在/密码错返回 401，对 `pending/rejected/disabled` 返回 403 和具体 `status`；登录页据此跳转 `/account-status?status=...` | 已确认 | 登录失败对外统一提示；账号状态提示改为二次验证后的安全路径 |
| M12 | 无强制改密机制 | BUS 未明确，但管理员“重置密码”后若无强制改密，治理闭环不完整 | Schema 与服务层均无 `must_change_password` / `password_reset_required` 字段；管理员重置密码仅返回临时密码 | 已确认 | 新增强制改密标志；重置后首次登录只能进入改密流程 |
| M13 | Word 导出未实现，与 BUS 冲突 | BUS §8.2：以 Word 下载为主，Markdown 作为扩展 | `app/api/projects/[projectId]/export/route.ts` 仅允许 `format=markdown`；`exportProjectContent` 非 Markdown 直接报错；管理员终稿下载也返回 `.md` | 已确认 | 实现 Docx 导出链路，Markdown 保留为次级格式 |

---

## 3. 按 BUS 六个模块的落实情况

| 模块 | BUS 目标 | 当前落实情况 | 主要缺口 |
| --- | --- | --- | --- |
| 1. 认证与治理 | BUS §2、§7、§8.4：注册审批、账号治理、绑定、密码、通知、待办闭环 | 后端已具备注册、审批、忘记密码通知、用户管理、绑定管理、审计日志 | 外部注册可提权；禁用/改密不撤销会话；自锁风险；无登录限流；存在账号枚举；无强制改密 |
| 2. SI 选题与预发 | BUS §3.1、§3.2、§5.1、§9：SI 创建/编辑/预发/收回/转项目、版本追溯 | 后端已具备 SI 新增、编辑、预发、收回、转项目、版本快照 | 前端版本回退按钮禁用；归档/删除入口禁用；预发唯一约束依赖应用层、DB 未兜底 |
| 3. 项目与阶段推进 | BUS §3.3、§5.2、§5.4、§8.1：阶段门禁、手动解锁质检、项目完成、恢复协作 | 后端已具备项目创建、阶段计划、质检解锁、项目完成、治理列表 | 我的项目详情/章节/质检页仍读 mock；恢复项目只改生命周期；归属调整不校验绑定；质检后仍可改章节；逾期状态不计算 |
| 4. Doc 协作闭环 | BUS §1.2、§1.4、§5.3、§6、§9：CurrentDraft + Revision + 单一持有人 + Clean 阅读 | 后端已具备当前稿读取、保存、提交、退回、通过、Revision 历史、通知待办、乐观锁 | 前端 Doc 页面全部使用 mock；路由按 `docType` 而非真实 `docId` 组织；核心唯一约束未生效；Clean 正文无校验 |
| 5. 工作台 / 看板 / 报表 | BUS §8.3、§8.4：管理员/编辑/作者按角色看到真实统计和待处理项 | 后端已具备 `/api/dashboard`、`/api/reports`、`/api/review`、`/api/todos`、`/api/notifications` | 只有通知/待办和管理员统计部分接通；编辑/作者看板、审稿工作台、我的项目、作者/编辑报表仍是 mock/硬编码 |
| 6. 导出 / 预警 / 通知 | BUS §8.1、§8.2、§8.4：逾期预警、跳转通知、Word 导出、终稿下载 | Doc 协作通知、注册审批通知、忘记密码通知、质检解锁通知已具备；Markdown 导出可用 | `due_soon` / `overdue` 不落库；无 `stage_warning` 通知生成；Word 导出未实现；终稿仍是 Markdown |

---

## 4. 分阶段整改计划

### P0：立刻止血（1 天内）

目标：先把安全红线和明显提权口堵上，避免继续产生高风险数据与凭据泄露。

1. 移除 Git 中的 `.env`，新增 `.env.example`，立即轮换：
   - 数据库账号/密码
   - `SESSION_SECRET`
2. 外部注册入口强制 `role=author`：
   - 移除注册页角色选择
   - 后端注册接口忽略外部传入角色
   - 审批接口默认仅激活账号，不继承外部可控角色
3. 会话强制撤销：
   - 禁用账号时撤销所有活动会话
   - 用户改密时撤销所有活动会话
   - 管理员重置密码时撤销所有活动会话
4. 禁止管理员自锁：
   - 禁用自己时直接返回 409
   - 如仅剩一个活动管理员，禁止将其禁用
5. 登录面安全收口：
   - 对外统一失败提示，不回传具体状态
   - 增加登录限流

验收标准：

- `git ls-files .env` 无结果
- 外部注册后数据库中只能落 `author + pending`
- 被禁用/改密/重置密码的账号原有 cookie 立即失效
- 登录接口不会通过状态码或返回体暴露账号是否存在/待审批

### P1：修复数据库不变量与并发保护（2-3 天）

目标：恢复 BUS 核心约束，让“单一当前稿、单一有效预发、单一有效绑定、单一阶段 Doc”真正由数据库兜底。

1. 明确唯一约束实现方案：
   - `editor_author_bindings.active_pair_key`
   - `si_preissues.effective_pair_key`
   - `doc_current_drafts.active_doc_key`
   - `docs.single_doc_key`
   - `docs.chapter_order_key`
2. 编写数据清洗脚本：
   - 找出重复 active draft / 重复有效预发 / 重复有效绑定 / 重复单阶段 Doc / 重复章节排序
   - 给出人工修复清单或自动修复策略
3. 落地 migration/backfill：
   - 先修数据，再启唯一约束
   - 不允许直接在脏数据上“硬加约束”
4. 统一冲突错误码：
   - 为 `P2002` 等唯一冲突返回 409 和稳定业务码
   - 不再让数据库冲突冒成 500

验收标准：

- 同一 Doc 不可能同时存在两条 `active` 草稿
- 同一 SI 对同一作者不可能存在两条有效预发
- 同一作者不可能同时绑定多个活动编辑
- 梗概/细纲/质检 Doc 不可能在同一项目下重复创建
- 并发创建/提交/预发场景返回 409，而非 500

### P2：修复治理与阶段流转（2-3 天）

目标：补齐恢复、归属、质检等治理动作的业务完整性。

1. 重写项目 `restore`：
   - 按 Release 状态、最终 Revision、当前 Doc 状态回推 `currentStage`
   - 必要时重建 `activeDraftId`、`holderRole`
2. 归属调整前校验编辑-作者绑定：
   - 未绑定则阻断
   - 或提供“先建绑定再换归属”的显式流程
3. 进入 `release` 后锁定章节结构：
   - 禁止新增章节
   - 禁止删除/重排章节
   - 若确需返工，应通过“恢复到正文阶段”或“管理员恢复项目”显式处理
4. 增加强制改密机制：
   - 管理员重置密码后标记 `password_reset_required`
   - 首次登录只能去改密页

验收标准：

- 恢复后的项目可以重新进入合法协作态，而不是“生命周期 active，但阶段/稿件链断裂”
- 治理页无法把项目分配给未绑定的编辑-作者组合
- 质检解锁后章节结构变更接口全部返回阻断错误
- 管理员重置密码后用户必须先改密才能继续使用

### P3：接通协作前端主链（4-6 天）

目标：让现有后端真正服务到业务前台，结束“后端有、前端 mock”的割裂。

1. Doc 页面全部接真实接口：
   - 当前稿件：`/api/docs/[docId]/current`
   - 保存：`/api/docs/[docId]/save`
   - 提交：`/api/docs/[docId]/submit`
   - 退回：`/api/docs/[docId]/return`
   - 通过：`/api/docs/[docId]/approve`
   - 版本列表/详情：`/api/docs/[docId]/revisions`
2. 路由从“按 `docType` 假定唯一”切到“按真实 `docId` 导航”：
   - 项目详情先取 `docDirectory`
   - 再跳转到具体 Doc
3. 接通以下页面：
   - 我的项目列表与项目详情
   - 正文章节页
   - 质检页
   - 审稿工作台
   - 编辑/作者首页看板
   - 编辑/作者统计报表
4. 清除协作主链中的 `@/mocks/*` 依赖

验收标准：

- 协作主链页面不再依赖 `@/mocks/doc-data` / `@/mocks/project-data`
- 审稿台“通过/退回”真实落库、真实发通知、真实关闭/创建待办
- 编辑/作者看板与报表数据来自真实接口

### P4：补齐逾期预警、Clean 校验与导出（2-4 天）

目标：把 BUS 明确要求但当前缺失的统计、预警、导出能力补全。

1. 实现阶段计划状态计算器：
   - `not_started`
   - `in_progress`
   - `due_soon`
   - `overdue`
   - `completed`
2. 实现阶段预警通知/待办：
   - `stage_warning` 通知
   - 去重键与重复发送策略
3. 收紧 Clean 正文口径：
   - 前端明确提交 `cleanText`
   - 后端校验 `cleanText` 与 `contentJson`、`plainText` 的最小一致性
4. 实现 Word 导出：
   - 项目导出
   - 质检导出
   - 管理员终稿下载
   - Markdown 继续保留为扩展格式

验收标准：

- 到期前项目能进入 `due_soon`，过期后进入 `overdue`
- 通知中心能看到阶段预警通知并跳转到对应项目/Doc
- Docx 可下载，且默认优先于 Markdown
- Clean 正文不再允许直接等同于未清洗正文

### P5：测试、回归与上线（2-3 天）

目标：保证整改不是一次性补丁，而是可持续维护的稳定基线。

1. 补自动化测试：
   - 注册/审批/禁用/改密/重置密码
   - 会话撤销
   - 唯一约束与并发冲突
   - 作者提交 -> 编辑退回/通过
   - 质检解锁与项目完成
   - 逾期状态计算
2. 增加回归清单：
   - SI -> 预发 -> 转项目
   - 梗概 -> 细纲 -> 正文 -> 质检 -> 完成
   - 管理员恢复项目
   - Word/Markdown 导出
3. 上线步骤：
   - 先轮换密钥与撤销老会话
   - 再做数据修复与 migration
   - 最后切前端真实接口

验收标准：

- `pnpm test` 覆盖上述关键路径
- 关键流程回归通过后再上线
- 上线后无重复 active draft、无重复有效预发、无重复绑定

---

## 5. 推荐执行顺序

必须严格按以下顺序推进，避免“先接前端、后补约束”导致数据继续扩散：

1. `P0` 安全止血
2. `P1` 数据清洗 + 约束回补
3. `P2` 治理与阶段流转修复
4. `P3` 前端主链接线
5. `P4` 预警、Clean、Word 导出
6. `P5` 全链路回归后上线

---

## 6. 最高优先级任务清单

如果只能先做最小闭环，建议按下面 8 项落地：

1. 移除 Git 中的 `.env` 并轮换密钥
2. 外部注册固定为 `author`
3. 禁用/改密/重置密码统一撤销会话
4. 修复 `active_pair_key` / `effective_pair_key` / `active_doc_key` / `single_doc_key` / `chapter_order_key`
5. 给唯一冲突补 409 级错误翻译
6. 接通 Doc 编辑器与审稿台真实 API
7. 接通编辑/作者看板与我的项目真实 API
8. 实现 `due_soon` / `overdue` 计算与 Word 导出
