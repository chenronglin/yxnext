# Agent 项目只读 API 对外交接文档

> 文档版本：1.0  
> 交接日期：2026-08-03  
> 保密级别：机密（本文包含 API Token，请勿公开传播或提交到公共代码仓库）

## 1. 接口用途

该接口用于外部 Agent 或数据看板只读获取项目、负责人、当前阶段、阶段计划及章节进度。

- 生产地址：`https://www.yxwriting.com`
- 接口地址：`https://www.yxwriting.com/api/open/projects`
- 请求方法：`GET`
- 数据格式：`application/json`
- 权限范围：只读；该 Token 不能调用系统中的新增、修改或删除接口

## 2. 认证信息

请在每次请求的 `Authorization` 请求头中携带以下 Bearer Token。

```text
OPEN_PROJECTS_API_TOKEN="2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50"
```

实际请求头：

```http
Authorization: Bearer 2b87d0092e654a7adbcf90108e9a34897c93aeb0082a766cfb1512a38ba4eb50
```

Token 缺失、格式错误或不匹配时，接口返回 HTTP `401`。请妥善保存该 Token，不要放入前端网页、公开仓库、截图或普通日志中。

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

## 4. 查询参数

| 参数 | 是否必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `page` | 否 | `1` | 页码，必须是大于 0 的整数 |
| `pageSize` | 否 | `20` | 每页数量，必须是 1～100 的整数 |
| `updatedSince` | 否 | 无 | 增量更新时间，必须是包含时区的 ISO 8601 时间戳，例如 `2026-08-01T00:00:00.000Z` |
| `includeChapters` | 否 | `false` | 是否返回章节明细，只接受 `true` 或 `false` |

未传 `updatedSince` 时返回全量分页列表，并优先返回最近发生业务变化的项目。传入 `updatedSince` 时，只返回 `syncUpdatedAt` 晚于该时间的项目。

## 5. 成功响应结构

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

## 6. 项目字段说明

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

## 7. 阶段计划字段说明

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `stage` | string | 阶段编码 |
| `planDays` | number | 计划工期天数 |
| `startAt` | string \| null | 实际开始时间 |
| `dueAt` | string \| null | 计划完成时间 |
| `finishedAt` | string \| null | 实际完成时间 |
| `status` | string | 阶段计划状态编码 |
| `timingNote` | string | 阶段开始条件说明 |

## 8. 章节字段说明

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

## 9. 稳定编码及中文解释

### 9.1 项目阶段 `stage`

| 编码 | 中文解释 |
| --- | --- |
| `synopsis` | 梗概阶段 |
| `outline` | 细纲阶段 |
| `chapter` | 正文章节阶段 |
| `release` | 质检阶段 |
| `completed` | 项目已完成 |

### 9.2 项目生命周期 `lifecycle`

| 编码 | 中文解释 |
| --- | --- |
| `draft` | 草稿 |
| `active` | 进行中 |
| `completed` | 已完成 |
| `archived` | 已归档 |
| `cancelled` | 已取消 |

### 9.3 阶段计划状态 `stagePlans[].status`

| 编码 | 中文解释 |
| --- | --- |
| `not_started` | 未开始 |
| `in_progress` | 进行中 |
| `due_soon` | 即将到期 |
| `overdue` | 已逾期 |
| `completed` | 已完成 |

### 9.4 章节状态 `chapters[].status`

| 编码 | 中文解释 |
| --- | --- |
| `draft` | 草稿 |
| `submitted` | 已提交，等待审核 |
| `returned` | 已退回，等待修改 |
| `approved` | 审核通过 |

## 10. 增量同步建议

1. 首次同步不传 `updatedSince`，按分页获取全部项目。
2. 将项目 `id` 作为幂等键保存或覆盖，ID 不要转换成数字。
3. 处理完当前查询条件下的全部分页后，记录本批数据中最大的 `syncUpdatedAt`。
4. 下一次调用时把该时间作为 `updatedSince`。
5. 增量结果按 `syncUpdatedAt`、`id` 升序返回；不要只处理第一页就推进时间检查点。

`updatedAt` 只代表项目主记录的更新时间；章节或阶段计划更新不一定改变它。因此增量拉取必须使用 `syncUpdatedAt`，不要使用 `updatedAt`。

## 11. 错误响应

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
| `400` | `VALIDATION_ERROR` | 检查分页、时间格式和 `includeChapters` 参数 |
| `401` | `OPEN_API_UNAUTHORIZED` | 检查 Bearer Token 是否完整、是否包含多余空格 |
| `405` | 请求方法错误 | 该接口只支持 GET |
| `500` | `INTERNAL_ERROR` | 稍后重试；持续失败时联系接口提供方 |
| `503` | `OPEN_API_TOKEN_NOT_CONFIGURED` | 联系接口提供方检查服务端 Token 配置 |

## 12. 契约稳定性

- 现有字段只增不删。
- 已发布字段含义和稳定编码不随页面展示文案改变。
- 新字段可能在未来以兼容方式增加，调用方应忽略暂不识别的字段。
- 如需进行不兼容调整，接口提供方会提前通知对接方。
