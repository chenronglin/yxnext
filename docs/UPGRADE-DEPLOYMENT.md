# 悦享小说创作平台基础升级部署说明

| 项目 | 内容 |
| --- | --- |
| 升级范围 | SI 信息扩展、正文第 0 章、批注回复、工作日计划 |
| 应用技术栈 | Next.js 16、Prisma 7、MySQL/MariaDB |
| 数据库迁移 | `20260902000000_add_basic_upgrade_features` |
| 默认服务端口 | `13100` |
| 进程管理 | 项目根目录 `run.sh` |
| 反向代理 | `nginx_deploy.conf`，本次无需修改 |

本文用于测试环境演练及生产环境升级。示例中的发布目录、数据库名、备份目录和发布提交号必须替换为实际值，不得把生产数据库密码写入命令历史、日志或版本库。

---

## 1. 本次升级内容

### 1.1 应用功能

1. SI 增加 SI 类型、创作难度、参考书籍标题和参考书籍链接；SI 类型与创作难度由编辑手工输入，并接入版本快照、预发布及回滚。
2. 新增和修改章节弹窗支持勾选“设为第 0 章”；选中后章节号自动设为 0、标题自动填写“作品介绍”，并固定显示在普通章节之前。
3. 项目作者可以对编辑创建且当前有效的批注进行一级纯文字回复；回复独立存储，不修改稿件 JSON，不生成新的稿件版本。
4. 阶段计划改用工作日计算，支持节假日和调休例外日期、起止日与工作日数互算、修改原因、历史留痕及并发保护；管理员和项目负责编辑可修改，作者只读。

本次不包含正文表格、附件替代、消息通知扩展或正文持有人规则调整。

### 1.2 数据库变更

迁移将增加：

- `si_metadata_options`：保存手工输入的 SI 类型和创作难度内部关联记录，无需管理员预配置；
- `story_ideas` 的四个 SI 扩展字段；
- `doc_comment_replies`：批注回复；
- `workday_exceptions`：节假日和调休工作日；
- `project_stage_plans` 的计划开始日、计划结束日和锁版本；
- `project_stage_plan_changes`：阶段计划修改历史。

兼容策略：

- SI 新字段允许为空，存量 SI 不要求补录；
- 存量项目不要求创建第 0 章；
- 不修改现有稿件 JSON；
- 不覆盖阶段的实际开始时间和实际完成时间；
- 迁移会把已有 `started_at`/`unlocked_at` 和 `due_at` 映射到新增计划日期字段。

---

## 2. 部署前提

生产部署前应满足：

1. 已在与生产结构一致的测试数据库完整演练一次。
2. 已确认本次发布的 Git 提交号或发布包校验值，并记录为 `RELEASE_COMMIT`。
3. 服务器上的 Node.js、Bun、Nginx、MySQL/MariaDB 版本与当前生产运行环境一致。
4. `.env` 中的 `DATABASE_URL` 指向正确环境；生产环境不得使用测试数据库。
5. 已预留维护窗口，建议至少 30 分钟。
6. 数据库和现有应用目录均已完成可恢复备份，并验证备份文件非空。
7. 已准备管理员、编辑、作者三个验收账号和至少一个可用于验证的测试项目。
8. 已取得当前年度及下一年度的节假日、调休工作日清单。

生产环境不要执行 `npm run seed`。该命令会写入初始化/演示数据，不属于升级步骤。

---

## 3. 上线前备份

### 3.1 数据库备份

优先使用现有云数据库快照或运维备份流程。若使用 `mysqldump`，建议把凭据放在权限为 `600` 的专用配置文件中，避免密码出现在进程列表或 Shell 历史中。

示例：

```bash
mkdir -p /secure/backup/yuexiang
backup_stamp="$(date +%Y%m%d-%H%M%S)"
mysqldump \
  --defaults-extra-file=/secure/mysql-backup.cnf \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  yuexiang_database \
  | gzip > "/secure/backup/yuexiang/before-basic-upgrade-${backup_stamp}.sql.gz"
test -s "/secure/backup/yuexiang/before-basic-upgrade-${backup_stamp}.sql.gz"
gzip -t "/secure/backup/yuexiang/before-basic-upgrade-${backup_stamp}.sql.gz"
```

命令成功后，部署记录中应写明备份文件路径、大小、生成时间和执行人。

### 3.2 应用备份

至少保留以下内容：

- 上一个稳定版本的源码或构建包；
- 上一个稳定版本的 Git 提交号；
- 生产 `.env` 的安全备份；
- 当前 Nginx 配置；
- 当前 `app.log` 和进程状态。

`.env` 备份只能放在受限目录，不能加入 Git。

---

## 4. 测试环境演练

以下命令均在项目根目录执行。

### 4.1 准备代码与依赖

```bash
git status --short
git rev-parse --short HEAD
npm ci
npx prisma generate
npx prisma validate
```

`git status --short` 应无未确认的本地修改。若生产通过发布包部署，则记录发布包校验值代替 Git 状态。

### 4.2 执行质量门禁

```bash
npm run typecheck
npm run lint
npm test
npm run check:i18n
npm run build
```

当前自动化测试基准为 33 个测试文件、179 项测试全部通过。

注意：当前 `check:i18n` 是报告模式，会输出全仓中文字面量统计，但不会因发现字面量自动失败；部署人员仍需确认本次新增中英文 API 文案已存在且输出没有脚本异常。

### 4.3 检查迁移状态

```bash
npx prisma migrate status
```

确认待执行迁移中包含：

```text
20260902000000_add_basic_upgrade_features
```

### 4.4 在测试数据库执行迁移

```bash
npx prisma migrate deploy
```

不得在生产环境使用 `prisma migrate dev`、`prisma db push` 或 `prisma db pull` 代替 `prisma migrate deploy`。

### 4.5 检查迁移结果

```sql
SELECT migration_name, finished_at, rolled_back_at
FROM _prisma_migrations
WHERE migration_name = '20260902000000_add_basic_upgrade_features';

SHOW TABLES LIKE 'si_metadata_options';
SHOW TABLES LIKE 'doc_comment_replies';
SHOW TABLES LIKE 'workday_exceptions';
SHOW TABLES LIKE 'project_stage_plan_changes';

SHOW COLUMNS FROM story_ideas LIKE 'si_type_id';
SHOW COLUMNS FROM story_ideas LIKE 'creative_difficulty_id';
SHOW COLUMNS FROM story_ideas LIKE 'reference_book_title';
SHOW COLUMNS FROM story_ideas LIKE 'reference_book_url';

SHOW COLUMNS FROM project_stage_plans LIKE 'planned_start_at';
SHOW COLUMNS FROM project_stage_plans LIKE 'planned_end_at';
SHOW COLUMNS FROM project_stage_plans LIKE 'lock_version';
```

迁移记录应存在且 `finished_at` 非空、`rolled_back_at` 为空；所有新增表和字段均应存在。

### 4.6 测试环境业务验收

按第 8 章完成全部冒烟检查后，方可进入生产部署。

---

## 5. 生产部署步骤

推荐采用“先安装和构建、再进入维护窗口、最后迁移和切换”的顺序，缩短停机时间。

### 5.1 部署前构建

在新版本发布目录执行：

```bash
npm ci
npx prisma generate
npx prisma validate
npm run typecheck
npm run lint
npm test
npm run build
```

只有全部通过后才能停止现有服务。构建失败时保持旧服务运行，不执行数据库迁移。

### 5.2 确认生产环境变量

至少检查：

```text
DATABASE_URL
SESSION_COOKIE_SECURE
OPEN_PROJECTS_API_TOKEN
OPEN_CONTENT_API_TOKEN
OPEN_CONTENT_API_CALLER
```

要求：

- `DATABASE_URL` 指向生产数据库；
- HTTPS 生产环境的 `SESSION_COOKIE_SECURE` 为 `true` 或保持默认安全值；
- 两个 Open API Token 不得相同，不得使用示例值；
- 不在终端输出或提交任何真实 Token。

### 5.3 进入维护窗口并停止应用

在当前生产目录记录状态并停止应用：

```bash
./run.sh status
./run.sh stop
```

检查端口已释放：

```bash
lsof -nP -iTCP:13100 -sTCP:LISTEN
```

正常情况下该命令不应再返回应用进程。

### 5.4 再次确认备份和数据库目标

在迁移前最后确认：

- 数据库备份文件存在且校验通过；
- 当前终端所在目录是新版本发布目录；
- `.env` 指向生产数据库；
- 当前迁移状态与测试演练一致。

```bash
npx prisma migrate status
```

### 5.5 执行生产迁移

```bash
npx prisma migrate deploy
```

迁移成功后立即执行第 4.5 节的 SQL 检查。若迁移命令失败，不要重复执行或手工跳过失败步骤，应保留完整错误输出并按第 9 章处理。

### 5.6 启动新版本

项目当前使用 `run.sh` 启动生产态 Next.js，默认端口为 `13100`：

```bash
./run.sh start
./run.sh status
```

查看启动日志：

```bash
tail -n 200 app.log
```

确认日志没有数据库字段缺失、Prisma 初始化失败、端口占用或环境变量缺失错误。

### 5.7 检查本机服务

```bash
curl --fail --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}\n' \
  http://127.0.0.1:13100/login
```

应返回可接受的 HTTP 状态码，且不应出现 `5xx`。

### 5.8 检查 Nginx 与公网入口

本次升级不修改 `nginx_deploy.conf`。仍建议执行：

```bash
sudo nginx -t
curl --fail --silent --show-error \
  --output /dev/null \
  --write-out '%{http_code}\n' \
  https://www.yxwriting.com/login
```

除非 Nginx 配置本身发生了变化，否则不需要 reload。若确有配置变更，在 `nginx -t` 通过后执行：

```bash
sudo systemctl reload nginx
```

---

## 6. 上线后的初始化配置

迁移不会自动写入中国节假日数据。应用启动后，管理员必须配置工作日日历；SI 类型和创作难度无需初始化。

### 6.1 SI 类型和创作难度

无需管理员初始化。编辑在新建或编辑 SI 时直接手工输入，单项最长 100 个字符；系统自动匹配或留存内部关联记录，并把当时的输入名称保存到版本及预发布快照。

### 6.2 工作日日历

进入：

```text
参数管理 → 工作日日历
```

录入当前年度及下一年度：

- 周一至周五中的法定节假日，类型选择“非工作日”；
- 周六、周日中的调休工作日，类型选择“调休工作日”；
- 填写明确说明，例如“国庆节”“春节调休上班”。

未配置例外日期时，系统默认周一至周五为工作日、周六和周日为非工作日。因此生产验收前必须完成并复核年度日历。

---

## 7. 技术检查清单

部署后检查：

- [ ] 应用进程正在运行，端口 `13100` 正常监听；
- [ ] Nginx 公网入口无 `502`、`503` 或 `504`；
- [ ] 登录、会话和三类角色权限正常；
- [ ] Prisma 迁移记录成功；
- [ ] 四张新增表存在；
- [ ] `story_ideas` 四个新增字段存在；
- [ ] `project_stage_plans` 三个新增字段存在；
- [ ] 管理员已经维护当前年度及下一年度工作日日历；
- [ ] `app.log` 无持续数据库或运行时错误；
- [ ] 第 8 章业务冒烟验收全部通过。

---

## 8. 业务冒烟验收

### 8.1 SI 信息扩展

1. 编辑新建 SI，手工输入 SI 类型和创作难度，并填写参考书籍标题和链接后保存。
2. 再次编辑 SI，确认两个手工输入项正确回显且无需管理员预配置。
3. 打开 SI 详情，确认字段完整显示。
4. 查看版本快照，确认扩展字段存在。
5. 修改扩展字段后回滚旧版本，确认四字段随版本恢复。
6. 预发布给测试作者，确认作者看到的是预发布时的字段快照。
7. 验证原有 Trope/标签录入和再次选择功能没有回归。

### 8.2 正文第 0 章

1. 在新增章节弹窗勾选“设为第 0 章”，确认章节号控件禁用且标题自动填写“作品介绍”。
2. 在修改章节弹窗勾选相同选项，确认章节号自动改为 0、标题自动填写“作品介绍”。
3. 再创建第 1 章，确认第 0 章始终位于正文目录首位。
4. 尝试把第 0 章拖到其他位置，系统应阻止。
5. 完成第 0 章保存、提交、退回、再次提交和定稿。
6. 进入质检、清稿和导出流程，确认第 0 章仍位于第一项。
7. 打开没有第 0 章的存量项目，确认原流程不受影响。

### 8.3 批注回复

1. 编辑在测试稿件中创建批注并将稿件退回作者。
2. 记录回复前稿件的锁版本和 Revision 数量。
3. 作者在批注下发送一级纯文字回复。
4. 刷新页面并查看历史版本，确认回复仍存在。
5. 确认回复没有改变稿件锁版本，没有增加 Revision。
6. 移除或使原批注失效后，确认历史回复仍可查看，但不能继续新增。
7. 验证编辑和管理员可以读取回复，但不能代替作者新增回复。

### 8.4 工作日计划

1. 在管理员参数中设置一个工作日节假日和一个周末调休工作日。
2. 负责编辑修改本人项目的未完成阶段计划并填写原因。
3. 修改计划工作日数，确认结束日自动重算。
4. 修改结束日，确认工作日数自动反算。
5. 确认节假日被排除、调休工作日被计入。
6. 使用跨年日期验证当前年度和下一年度日历。
7. 确认修改历史展示修改人、时间、原因和前后值。
8. 使用作者账号确认计划只读。
9. 尝试修改已完成阶段，系统应拒绝。
10. 两个页面同时修改同一计划，后提交的旧版本请求应提示刷新重试。

---

## 9. 异常处理

### 9.1 构建失败

- 不停止旧服务；
- 不执行数据库迁移；
- 保存构建日志，修复后重新完成全部质量门禁。

### 9.2 迁移失败

1. 保持应用停止状态。
2. 保存 `prisma migrate deploy` 的完整输出。
3. 查询 `_prisma_migrations` 中该迁移的 `started_at`、`finished_at`、`logs` 和 `rolled_back_at`。
4. 检查实际已经创建的表、字段、索引和外键。
5. 不要重复执行 `migration.sql`，不要直接删除 `_prisma_migrations` 记录。
6. 由实施人员或 DBA 判断是修复并向前完成迁移，还是恢复上线前数据库备份。

### 9.3 新应用无法启动

1. 查看 `app.log`。
2. 检查 `.env`、数据库连通性和端口占用。
3. 如果无法在维护窗口内修复，按第 10.1 节回退应用。

### 9.4 上线后出现业务错误

- 立即停止继续录入 SI 扩展信息、批注回复和计划调整；
- 保存错误请求时间、用户、项目/稿件 ID 和应用日志；
- 优先采用应用回退或向前修复；
- 只有确认没有需要保留的新数据时，才考虑数据库结构回滚。

---

## 10. 回滚方案

### 10.1 推荐方案：仅回退应用

本次数据库变更以新增表、可空字段和新增索引为主，旧版本应用可以忽略这些结构。因此正常回滚优先保留数据库变更，只恢复上一个稳定应用版本。

步骤：

```bash
./run.sh stop
```

切换到上一个稳定发布目录或稳定提交后：

```bash
npm ci
npx prisma generate
npm run build
./run.sh start
./run.sh status
tail -n 200 app.log
```

随后检查登录、项目列表、SI、正文保存和原阶段流程。该方式不会删除已经产生的批注回复或计划历史，后续可修复后重新升级。

### 10.2 数据库恢复备份

若迁移过程失败并导致数据库结构不完整，且应用尚未恢复对外服务，最稳妥的方式是恢复第 3 章生成的完整数据库备份。恢复属于破坏性操作，必须由授权 DBA 执行，并再次核对目标数据库。

### 10.3 紧急结构回滚脚本

项目提供：

```text
prisma/migrations/20260902000000_add_basic_upgrade_features/rollback.sql
```

该脚本会删除新增表和字段，可能永久删除：

- 批注回复；
- 工作日日历；
- 阶段计划修改历史；
- SI 扩展字段值。

只有同时满足以下条件才可使用：

1. 新版本尚未对业务用户开放，或确认未产生需要保留的新数据；
2. 已再次生成数据库备份；
3. 已核对目标数据库；
4. 已由项目负责人和 DBA 书面确认；
5. 已制定 Prisma `_prisma_migrations` 历史的后续处理方案。

Prisma 不提供通用的自动 down migration。不要在没有确认迁移历史处理方式时直接执行该脚本，也不要手工删除 `_prisma_migrations` 记录。

---

## 11. 部署记录模板

| 项目 | 记录内容 |
| --- | --- |
| 部署日期与维护窗口 |  |
| 部署环境 | 测试 / 生产 |
| 发布提交号或包校验值 |  |
| 上一稳定版本 |  |
| 执行人 |  |
| 复核人 |  |
| 数据库备份路径及大小 |  |
| 应用备份位置 |  |
| 迁移名称 | `20260902000000_add_basic_upgrade_features` |
| 迁移开始/完成时间 |  |
| TypeScript / Lint / Test / Build 结果 |  |
| 数据库结构检查结果 |  |
| SI 手工输入及快照验证结果 |  |
| 工作日日历初始化结果 |  |
| 四项业务冒烟结果 |  |
| 应用日志检查结果 |  |
| 遗留问题 |  |
| 是否发生回滚 |  |
| 最终结论 |  |

部署记录、测试结果和备份信息应与本次发布版本一并归档。
