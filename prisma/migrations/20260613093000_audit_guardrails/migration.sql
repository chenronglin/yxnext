-- 审计整改：把“一个作者只能有一个活动编辑”从应用检查提升为数据库约束。
-- 旧值是 editor_id:author_id，会允许同一 author_id 对多个 editor_id 分别通过唯一索引。
UPDATE `editor_author_bindings`
SET `active_pair_key` = CAST(`author_id` AS CHAR)
WHERE `status` = 'active';

UPDATE `editor_author_bindings`
SET `active_pair_key` = NULL
WHERE `status` <> 'active';

-- 审计整改：同一 SI 只能转出一个项目，避免不同预发记录并发转换时产生多个项目。
-- MySQL/MariaDB 的外键要求被引用列所在表保留可用索引；
-- 因此必须先创建新唯一索引，再删除旧普通索引，避免删除旧索引时触发 1553。
CREATE UNIQUE INDEX `projects_source_si_id_key` ON `projects`(`source_si_id`);
DROP INDEX `idx_projects_source_si` ON `projects`;

-- 审计整改：章节号允许为空，但同一项目内填写后的活动章节号必须唯一。
ALTER TABLE `docs` ADD COLUMN `chapter_no_key` VARCHAR(191) NULL;

UPDATE `docs`
SET `chapter_no_key` = CONCAT(CAST(`project_id` AS CHAR), ':', CAST(`chapter_no` AS CHAR))
WHERE `doc_type` = 'chapter'
  AND `is_deleted` = false
  AND `chapter_no` IS NOT NULL;

CREATE UNIQUE INDEX `docs_chapter_no_key_key` ON `docs`(`chapter_no_key`);
