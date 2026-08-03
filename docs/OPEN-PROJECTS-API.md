# Agent 项目只读接口

## 认证

接口使用独立 Bearer Token，不接受管理员账号密码或浏览器 Session：

```http
Authorization: Bearer <OPEN_PROJECTS_API_TOKEN>
```

Token 仅被 `/api/open/projects` 识别。缺失、格式错误或值不匹配均返回 `401 OPEN_API_UNAUTHORIZED`。

## 项目列表

```http
GET /api/open/projects
```

查询参数：

| 参数 | 默认值 | 说明 |
| --- | --- | --- |
| `page` | `1` | 正整数页码 |
| `pageSize` | `20` | 每页数量，最大 100 |
| `updatedSince` | 无 | 带时区的 ISO 8601 时间戳，只返回此时间之后发生同步变化的项目 |
| `includeChapters` | `false` | 设为 `true` 时返回章节明细 |

`updatedAt` 沿用当前系统语义，只表示项目记录本身的更新时间。`syncUpdatedAt` 是只读接口计算出的同步时间，取项目、阶段计划和未删除文档更新时间的最大值；增量拉取应使用 `syncUpdatedAt` 推进检查点。

增量调用按 `syncUpdatedAt`、`id` 升序返回。调用方应先处理完当前条件下的全部分页，再把已处理结果中的最大 `syncUpdatedAt` 用作下一次 `updatedSince`。项目以 `id` 为幂等键覆盖写入看板。

## 项目字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 项目 ID；数据库 BigInt 对外统一序列化为字符串 |
| `title` | string | 项目名称 |
| `author` / `authorId` | string | 作者显示名和 ID |
| `editor` / `editorId` | string | 编辑显示名和 ID |
| `mainType` | string \| null | 来源 SI 的现有主类型；当前系统没有 category 字段 |
| `stage` | string | 当前阶段稳定编码 |
| `lifecycle` | string | 项目生命周期稳定编码 |
| `createdAt` | string | ISO 8601 立项时间 |
| `updatedAt` | string | ISO 8601 项目记录更新时间 |
| `syncUpdatedAt` | string | ISO 8601 聚合同步时间 |
| `totalChapters` | number | 未删除章节总数 |
| `approvedChapters` | number | 已审核通过章节数 |
| `stagePlans` | array | 四个阶段的计划信息 |
| `chapters` | array，可选 | 仅在 `includeChapters=true` 时出现 |

当前稳定枚举：

- `stage`：`synopsis`、`outline`、`chapter`、`release`、`completed`
- `lifecycle`：`draft`、`active`、`completed`、`archived`、`cancelled`
- 阶段计划 `status`：`not_started`、`in_progress`、`due_soon`、`overdue`、`completed`
- 章节 `status`：`draft`、`submitted`、`returned`、`approved`

当前系统没有可可靠映射的“内容组”，因此第一版契约不返回 `group`；后续只有在现有系统出现明确数据来源后才会按“字段只增不删”的原则增加。

## 成功响应示例

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
      "stagePlans": []
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1,
  "totalPages": 1
}
```

响应字段遵循只增不删、既有字段语义不变的兼容原则。错误响应沿用系统统一结构：`{ "ok": false, "code": "...", "message": "..." }`。
