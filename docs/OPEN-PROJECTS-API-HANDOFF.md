# Agent 项目只读 API 对外交接文档

> 文档版本：1.2
>
> 更新日期：2026-08-15
>
> 保密级别：机密（本文包含 API Token，请勿公开传播或提交到公共代码仓库）

## 1. 接口用途

该组接口用于外部 Agent 或数据看板只读获取项目进度、项目操作审计日志，以及按需读取梗概、细纲和正文章节的纯文本内容。

- 生产地址：`https://www.yxwriting.com`
- 项目列表：`https://www.yxwriting.com/api/open/projects`
- 操作审计日志：`https://www.yxwriting.com/api/open/audit-logs`
- 单篇正文：`https://www.yxwriting.com/api/open/docs/{docId}/content`
- 项目阶段正文：`https://www.yxwriting.com/api/open/projects/{projectId}/content`
- 请求方法：`GET`
- 数据格式：`application/json`
- 权限范围：只读；正文不会默认混入项目元数据响应，必须按需调用正文接口

## 2. 认证信息

项目列表和操作审计日志使用元数据 Token：

```text
OPEN_PROJECTS_API_TOKEN="2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50"
```

实际请求头：

```http
Authorization: Bearer 2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50
```

Token 缺失、格式错误或不匹配时，接口返回 HTTP `401`。请妥善保存该 Token，不要放入前端网页、公开仓库、截图或普通日志中。

正文属于核心 IP，两个正文接口必须改用以下独立正文 Token：

```text
OPEN_CONTENT_API_TOKEN="f9ace0c00e0cc58fe640d05018d2481a29b8d970a3ee05e3e16144f494343d2e"
```

正文请求头：

```http
Authorization: Bearer f9ace0c00e0cc58fe640d05018d2481a29b8d970a3ee05e3e16144f494343d2e
```

两个 Token 的权限严格分离：元数据 Token 不能读取正文，正文 Token 也不能替代元数据 Token。若服务端误将两个 Token 配置成相同值，正文接口会以 HTTP `503` 主动关闭。正文 Token 同样不得放入浏览器前端、公开仓库、截图或普通日志。

## 3. 快速调用示例

获取第一页项目，每页 20 条，不返回章节明细：

```bash
curl --request GET \
  --url 'https://www.yxwriting.com/api/open/projects?page=1&pageSize=20' \
  --header 'Authorization: Bearer 2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50'
```

获取增量更新并包含章节明细：

```bash
curl --request GET \
  --url 'https://www.yxwriting.com/api/open/projects?page=1&pageSize=20&updatedSince=2026-08-01T00%3A00%3A00.000Z&includeChapters=true' \
  --header 'Authorization: Bearer 2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50'
```

获取指定项目在某一时间范围内的文档操作日志：

```bash
curl --request GET \
  --url 'https://www.yxwriting.com/api/open/audit-logs?projectId=123&action=doc.return&startAt=2026-08-01T00%3A00%3A00.000Z&endAt=2026-08-10T23%3A59%3A59.999Z&page=1&pageSize=20' \
  --header 'Authorization: Bearer 2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50'
```

按 Doc ID 获取单篇正文：

```bash
curl --request GET \
  --url 'https://www.yxwriting.com/api/open/docs/456/content' \
  --header 'Authorization: Bearer f9ace0c00e0cc58fe640d05018d2481a29b8d970a3ee05e3e16144f494343d2e'
```

获取某项目的前 3 章正文：

```bash
curl --request GET \
  --url 'https://www.yxwriting.com/api/open/projects/123/content?stage=chapter&order=1-3' \
  --header 'Authorization: Bearer f9ace0c00e0cc58fe640d05018d2481a29b8d970a3ee05e3e16144f494343d2e'
```

## 4. 项目列表接口

### 4.1 请求地址

```http
GET /api/open/projects
```

### 4.2 查询参数

| 参数 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | 否 | `1` | 页码，必须是大于 0 的整数 |
| `pageSize` | 否 | `20` | 每页数量，必须是 1～100 的整数 |
| `updatedSince` | 否 | 无 | 增量更新时间，必须是包含时区的 ISO 8601 时间戳，例如 `2026-08-01T00:00:00.000Z` |
| `includeChapters` | 否 | `false` | 是否返回章节明细，只接受 `true` 或 `false` |

未传 `updatedSince` 时返回全量分页列表，并优先返回最近发生业务变化的项目。传入 `updatedSince` 时，只返回 `syncUpdatedAt` 晚于该时间的项目。

### 4.3 成功响应结构

接口成功时返回 HTTP `200`：

```json
{
  "ok": true,
  "items": [
    {
      "id": "123",
      "title": "项目名称",
      "author": "作者名",
      "authorId": "45",
      "editor": "编辑名",
      "editorId": "12",
      "mainType": "狼人文",
      "stage": "chapter",
      "lifecycle": "active",
      "createdAt": "2026-07-01T08:00:00.000Z",
      "updatedAt": "2026-07-20T09:00:00.000Z",
      "syncUpdatedAt": "2026-08-02T10:30:00.000Z",
      "totalChapters": 20,
      "approvedChapters": 12,
      "stagePlans": [
        {
          "stage": "chapter",
          "planDays": 30,
          "startAt": "2026-07-10T00:00:00.000Z",
          "dueAt": "2026-08-09T00:00:00.000Z",
          "finishedAt": null,
          "status": "in_progress",
          "timingNote": "细纲通过后开始"
        }
      ],
      "chapters": [
        {
          "id": "456",
          "order": 1,
          "title": "第一章",
          "status": "approved",
          "holder": "none",
          "words": 3200,
          "lastNote": "审核通过",
          "lastOperator": "编辑名",
          "lastOperatedAt": "2026-08-02T10:30:00.000Z",
          "approved": true
        }
      ]
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1
}
```

当 `includeChapters=false` 或未传该参数时，项目对象中不会出现 `chapters` 字段。

### 4.4 项目字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 项目唯一 ID；请始终按字符串处理 |
| `title` | string | 项目名称 |
| `author` | string | 作者显示名 |
| `authorId` | string | 作者 ID |
| `editor` | string | 编辑显示名 |
| `editorId` | string | 编辑 ID |
| `mainType` | string \| null | 来源 SI 的主类型；当前系统对应需求中的品类概念，但字段名称以现有系统 `mainType` 为准 |
| `stage` | string | 当前项目阶段，编码见第 9 节 |
| `lifecycle` | string | 项目生命周期，编码见第 9 节 |
| `createdAt` | string | 立项时间，ISO 8601 格式 |
| `updatedAt` | string | 项目记录本身的更新时间，ISO 8601 格式 |
| `syncUpdatedAt` | string | 用于增量同步的聚合更新时间，ISO 8601 格式 |
| `totalChapters` | number | 未删除章节总数 |
| `approvedChapters` | number | 已审核通过章节数 |
| `stagePlans` | array | 阶段计划列表 |
| `chapters` | array，可选 | 章节明细；仅在 `includeChapters=true` 时返回 |

说明：当前系统没有可可靠映射的“内容组”字段，因此本接口不返回 `group`；当前系统也没有名为 `category` 的字段，对应信息使用现有字段 `mainType`。

### 4.5 阶段计划字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stage` | string | 阶段编码 |
| `planDays` | number | 计划工期天数 |
| `startAt` | string \| null | 实际开始时间 |
| `dueAt` | string \| null | 计划完成时间 |
| `finishedAt` | string \| null | 实际完成时间 |
| `status` | string | 阶段计划状态编码 |
| `timingNote` | string | 阶段开始条件说明 |

### 4.6 章节字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 章节 Doc ID |
| `order` | number | 章序；优先使用结构化章节号，历史数据没有章节号时使用显示顺序 |
| `title` | string | 章节标题 |
| `status` | string | 章节状态编码 |
| `holder` | string | 当前编辑权持有方：`author` 作者、`editor` 编辑、`none` 无人持有 |
| `words` | number | 当前字数 |
| `lastNote` | string | 最近一次交接备注；没有备注时为空字符串 |
| `lastOperator` | string | 最近操作人；无法确定时为“系统” |
| `lastOperatedAt` | string | 最近操作时间，ISO 8601 格式 |
| `approved` | boolean | 是否已经审核通过 |

## 5. 项目稳定编码及中文解释

### 5.1 项目阶段 `stage`

| 编码 | 中文解释 |
| --- | --- |
| `synopsis` | 梗概阶段 |
| `outline` | 细纲阶段 |
| `chapter` | 正文章节阶段 |
| `release` | 质检阶段 |
| `completed` | 项目已完成 |

### 5.2 项目生命周期 `lifecycle`

| 编码 | 中文解释 |
| --- | --- |
| `draft` | 草稿 |
| `active` | 进行中 |
| `completed` | 已完成 |
| `archived` | 已归档 |
| `cancelled` | 已取消 |

### 5.3 阶段计划状态 `stagePlans[].status`

| 编码 | 中文解释 |
| --- | --- |
| `not_started` | 未开始 |
| `in_progress` | 进行中 |
| `due_soon` | 即将到期 |
| `overdue` | 已逾期 |
| `completed` | 已完成 |

### 5.4 章节状态 `chapters[].status`

| 编码 | 中文解释 |
| --- | --- |
| `draft` | 草稿 |
| `submitted` | 已提交，等待审核 |
| `returned` | 已退回，等待修改 |
| `approved` | 审核通过 |

## 6. 项目增量同步建议

1. 首次同步不传 `updatedSince`，按分页获取全部项目。
2. 将项目 `id` 作为幂等键保存或覆盖，ID 不要转换成数字。
3. 处理完当前查询条件下的全部分页后，记录本批数据中最大的 `syncUpdatedAt`。
4. 下一次调用时把该时间作为 `updatedSince`。
5. 增量结果按 `syncUpdatedAt`、`id` 升序返回；不要只处理第一页就推进时间检查点。

`updatedAt` 只代表项目主记录的更新时间；章节或阶段计划更新不一定改变它。因此增量拉取必须使用 `syncUpdatedAt`，不要使用 `updatedAt`。

## 7. 操作审计日志接口

### 7.1 请求地址及用途

```http
GET /api/open/audit-logs
```

该接口返回与项目关联的只读操作日志，可用于统计各项目在梗概、细纲、正文和质检阶段的作者保存/提交、编辑打回、编辑通过等操作次数与协作轮次。账号审批、密码重置和系统运维等不属于项目的数据不会通过该接口暴露。

### 7.2 查询参数

| 参数 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | 否 | `1` | 页码，必须是大于 0 的整数 |
| `pageSize` | 否 | `20` | 每页数量，必须是 1～100 的整数 |
| `projectId` | 否 | 无 | 按项目 ID 精确筛选；ID 必须按数字字符串传入 |
| `docId` | 否 | 无 | 按章节或其他 Doc ID 精确筛选 |
| `actorId` | 否 | 无 | 按操作人用户 ID 精确筛选 |
| `operator` | 否 | 无 | 按操作人的显示名称或用户名模糊筛选，最长 100 个字符 |
| `action` | 否 | 无 | 按操作类型稳定编码精确筛选，例如 `doc.return` |
| `startAt` | 否 | 无 | 操作时间范围起点，包含边界，必须是带时区的 ISO 8601 时间戳 |
| `endAt` | 否 | 无 | 操作时间范围终点，包含边界，必须是带时区的 ISO 8601 时间戳 |
| `updatedSince` | 否 | 无 | 只返回该时间之后新增的日志，使用严格大于条件 |

所有筛选参数可以组合使用。`updatedSince` 与 `startAt`、`endAt` 同时出现时，日志必须同时满足增量条件和指定时间范围。

### 7.3 成功响应示例

```json
{
  "ok": true,
  "logs": [
    {
      "id": "501",
      "time": "2026-08-08T08:30:00.000Z",
      "operator": "编辑甲",
      "operatorId": "30",
      "role": "editor",
      "action": "doc.return",
      "actionLabel": "退回文档修改",
      "target": "项目：项目甲 · Doc：第一章",
      "entityType": "doc",
      "entityId": "200",
      "projectId": "100",
      "projectTitle": "项目甲",
      "docId": "200",
      "docTitle": "第一章",
      "stage": "chapter"
    }
  ],
  "actions": [
    {
      "value": "doc.save",
      "label": "保存文档"
    },
    {
      "value": "doc.submit",
      "label": "提交文档审核"
    },
    {
      "value": "doc.return",
      "label": "退回文档修改"
    },
    {
      "value": "doc.approve",
      "label": "通过文档审核"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1
}
```

`actions` 是当前项目日志范围内可用的操作类型选项，不随本次筛选条件收缩。调用方可以直接使用 `value` 构建 `action` 筛选，并用 `label` 展示中文名称。

### 7.4 日志字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 操作日志唯一 ID；请始终按字符串处理 |
| `time` | string | 操作发生时间，ISO 8601 格式；也是增量同步依据 |
| `operator` | string | 操作人显示名；主体已删除时为“已删除用户”，系统日志为“系统” |
| `operatorId` | string \| null | 操作人用户 ID；无法关联用户时为 `null` |
| `role` | string | 操作发生时的角色快照：`admin`、`editor`、`author`、`api` 或 `system`；正文接口调用使用 `api` |
| `action` | string | 操作类型稳定编码，建议统计和筛选使用该字段 |
| `actionLabel` | string | 操作类型中文名称，仅用于展示 |
| `target` | string | 可读业务对象，例如“项目：项目甲 · Doc：第一章” |
| `entityType` | string | 日志记录的业务对象类型，例如 `project` 或 `doc` |
| `entityId` | string | 日志记录的业务对象 ID |
| `projectId` | string | 关联项目 ID；Open API 返回的日志始终有关联项目 |
| `projectTitle` | string \| null | 项目名称；历史关联对象不可读取时为 `null` |
| `docId` | string \| null | 关联 Doc ID；项目级操作为 `null` |
| `docTitle` | string \| null | Doc 标题；项目级操作为 `null` |
| `stage` | string \| null | 操作所属阶段：`synopsis`、`outline`、`chapter`、`release` 或 `completed`；无法从历史记录可靠确定时为 `null` |

文档操作的 `stage` 来自 Doc 自身稳定的所属阶段，因此保存、提交、打回和通过可以准确归入梗概、细纲、正文或质检。项目级操作只在历史快照或动作本身可以可靠确定阶段时返回阶段值，不会用项目当前阶段伪造历史阶段。

### 7.5 常用操作类型

| 稳定编码 | 中文解释 | 统计用途 |
| --- | --- | --- |
| `doc.save` | 保存文档 | 作者或编辑保存当前稿件；可统计修改活跃度，但一次业务修改可能包含多次保存 |
| `doc.submit` | 提交文档审核 | 作者完成一轮修改并提交审核 |
| `doc.return` | 退回文档修改 | 编辑打回一轮；统计“编辑打回轮次”的推荐口径 |
| `doc.approve` | 通过文档审核 | 编辑通过一轮审核 |
| `doc.cancel_approval` | 取消文档定稿 | 已通过后重新打开并要求修改 |
| `open.content.read` | 读取 Open API 正文 | 外部调用方按 Doc 或按项目阶段读取正文 |
| `project.chapter.create` | 新建项目章节 | 正文阶段新建章节 |
| `project.chapter.metadata.update` | 更新章节信息 | 修改章节标题或章节号 |
| `project.chapter.reorder` | 调整章节顺序 | 正文章节重新排序 |
| `project.chapter.delete` | 删除项目章节 | 软删除正文项目章节 |
| `project.qc.unlock` | 解锁项目质检 | 项目首次进入质检协作 |
| `project.qc.regenerate` | 重新生成项目质检 | 重新生成质检稿 |
| `project.complete` | 完成项目 | 项目协作完成 |

`actions` 可能包含上表之外的项目管理动作。调用方应以响应中的 `action` 原值为准，并忽略暂不识别的新动作编码。

### 7.6 修改与打回轮次统计建议

- 编辑打回轮次：按 `projectId + stage` 分组统计 `action=doc.return` 的日志数。
- 作者修改提交轮次：按 `projectId + stage` 分组统计 `action=doc.submit` 且 `role=author` 的日志数。
- 审核通过次数：按 `projectId + stage` 分组统计 `action=doc.approve` 的日志数。
- 保存次数：可统计 `action=doc.save`，但自动保存或连续保存可能产生多条记录，不应直接等同于完整修改轮次。
- 需要统计某一章节时增加 `docId` 维度；仅统计正文章节时筛选或分组使用 `stage=chapter`（`stage` 当前是响应字段，不是请求筛选参数）。

### 7.7 审计日志增量同步建议

1. 首次同步不传 `updatedSince`，按分页拉取全部项目日志。
2. 将日志 `id` 作为幂等键保存，ID 不要转换成数字。
3. 处理完当前筛选条件下的全部分页后，记录本批最大的 `time`。
4. 下一次把该时间作为 `updatedSince`；增量结果按 `time`、`id` 升序返回。
5. 不要只处理第一页就推进时间检查点。

操作日志为追加式只读记录，不会被更新；因此该接口的 `updatedSince` 实际按日志 `time`（创建时间）进行严格增量筛选。

## 8. 正文读取接口

### 8.1 使用范围与内容口径

正文接口覆盖 `synopsis`（梗概）、`outline`（细纲）和 `chapter`（正文章节）三类 Doc，不开放 `release`（质检稿）。`docId` 与项目列表 `chapters[].id`、审计日志 `docId` 使用同一套现有 Doc ID。

返回的 `content` 为纯文本。系统优先读取当前活跃草稿；Doc 已通过且没有活跃草稿时读取最终定稿版本。`wordCount` 和 `updatedAt` 始终来自与 `content` 相同的内容快照。当前版本不额外返回 Markdown 或 HTML。

正文只按需返回，不会出现在 `GET /api/open/projects` 或 `GET /api/open/audit-logs` 的默认响应中。所有成功响应均带 `Cache-Control: private, no-store`，调用方也不应在共享缓存中保存正文。

### 8.2 按 Doc 获取单篇正文

```http
GET /api/open/docs/{docId}/content
```

路径参数：

| 参数 | 是否必填 | 说明 |
| --- | --- | --- |
| `docId` | 是 | 大于 0 的 Doc ID 数字字符串；可来自 `projects.chapters[].id` 或 `audit-logs.docId` |

成功响应：

```json
{
  "ok": true,
  "docId": "456",
  "projectId": "123",
  "stage": "chapter",
  "title": "第一章",
  "order": 1,
  "wordCount": 3200,
  "updatedAt": "2026-08-15T08:00:00.000Z",
  "content": "第一章的纯文本正文……"
}
```

### 8.3 按项目和阶段批量获取正文

```http
GET /api/open/projects/{projectId}/content?stage=synopsis|outline|chapter&order=1-3
```

查询参数：

| 参数 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `stage` | 是 | 无 | 只接受 `synopsis`、`outline` 或 `chapter` |
| `order` | 否 | 无 | 单个正整数或闭区间，例如 `1`、`1-3`；仅适用于 `stage=chapter` |
| `page` | 否 | `1` | 正整数页码；使用非第 1 页时必须同时提供 `pageSize` |
| `pageSize` | 否 | 无 | 1～100；不传时一次返回该阶段或章序范围内的全部匹配 Doc |

批量结果按对外 `order` 升序排列。正文章序优先使用现有结构化章节号，历史数据没有章节号时使用显示顺序。梗概和细纲的 `order` 为 `null`。

成功响应：

```json
{
  "ok": true,
  "items": [
    {
      "docId": "456",
      "projectId": "123",
      "stage": "chapter",
      "title": "第一章",
      "order": 1,
      "wordCount": 3200,
      "updatedAt": "2026-08-15T08:00:00.000Z",
      "content": "第一章的纯文本正文……"
    }
  ],
  "page": 1,
  "pageSize": 1,
  "total": 1,
  "totalPages": 1
}
```

不传 `pageSize` 时，`pageSize` 表示本次全部匹配结果的数量；没有匹配 Doc 时为 `1`。传入 `pageSize` 时，分页外壳与其他 Open API 保持一致。

### 8.4 正文字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `docId` | string | Doc ID；请始终按字符串处理 |
| `projectId` | string | 所属项目 ID；请始终按字符串处理 |
| `stage` | string | `synopsis` 梗概、`outline` 细纲、`chapter` 正文章节 |
| `title` | string | Doc 标题 |
| `order` | number \| null | 正文章序；梗概和细纲为 `null` |
| `wordCount` | number | 当前返回内容快照的字数 |
| `updatedAt` | string | 当前返回内容快照的更新时间，ISO 8601 格式 |
| `content` | string | 纯文本内容；可能为空字符串 |

### 8.5 项目授权与调用审计

- 正文 Token 可由接口提供方配置项目 ID 白名单；启用后只能读取获准项目，越权返回 HTTP `403 OPEN_CONTENT_PROJECT_FORBIDDEN`。未配置白名单时允许读取全部项目。
- 每次成功读取都会先写入现有 `operation_logs` 审计表；审计写入失败时不会返回正文。
- 审计记录包含调用方、时间、请求 ID、来源 IP、User-Agent、读取模式、所属阶段、实际返回的 Doc ID，以及批量读取时的章序和分页范围；不会复制正文内容。
- 这类日志的稳定动作编码为 `open.content.read`，角色为 `api`，可通过元数据 Token 调用 `GET /api/open/audit-logs?action=open.content.read` 查询。

## 9. 错误响应

错误响应统一采用以下结构：

```json
{
  "ok": false,
  "code": "OPEN_API_UNAUTHORIZED",
  "message": "Open API Token 无效"
}
```

常见 HTTP 状态码：

| HTTP 状态码 | 常见错误码/场景 | 处理建议 |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR`、`OPEN_CONTENT_DOC_TYPE_UNSUPPORTED` | 检查分页、ID、阶段、章序范围、时间格式；质检 Doc 不支持正文读取 |
| `401` | `OPEN_API_UNAUTHORIZED`、`OPEN_CONTENT_API_UNAUTHORIZED` | 检查当前接口使用的是元数据 Token 还是正文 Token |
| `403` | `OPEN_CONTENT_PROJECT_FORBIDDEN` | 当前正文 Token 未获准读取该项目 |
| `404` | `OPEN_CONTENT_DOC_NOT_FOUND`、`OPEN_CONTENT_PROJECT_NOT_FOUND` | 检查 Doc ID 或项目 ID；已软删除 Doc 也按不存在处理 |
| `409` | `OPEN_CONTENT_SOURCE_MISSING` | Doc 当前没有可读取的活跃草稿或最终定稿 |
| `405` | 请求方法错误 | 该接口只支持 GET |
| `500` | `INTERNAL_ERROR` | 稍后重试；持续失败时联系接口提供方 |
| `503` | Token 未配置、项目授权配置错误或两个 Token 冲突 | 联系接口提供方检查服务端环境变量配置 |

## 10. 契约稳定性

- 现有字段只增不删。
- 已发布字段含义和稳定编码不随页面展示文案改变。
- 新字段可能在未来以兼容方式增加，调用方应忽略暂不识别的字段。
- 如需进行不兼容调整，接口提供方会提前通知对接方。
