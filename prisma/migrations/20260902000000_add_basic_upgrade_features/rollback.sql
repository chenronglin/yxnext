-- 本脚本仅用于“应用尚未产生需要保留的新业务数据”时回滚本次基础升级。
-- 若批注回复、工作日日历或阶段计划修改历史已经投入使用，必须先导出备份，再由实施人员确认后执行。

DROP TABLE `project_stage_plan_changes`;

ALTER TABLE `project_stage_plans`
  DROP COLUMN `planned_start_at`,
  DROP COLUMN `planned_end_at`,
  DROP COLUMN `lock_version`;

DROP TABLE `workday_exceptions`;
DROP TABLE `doc_comment_replies`;

ALTER TABLE `story_ideas`
  DROP FOREIGN KEY `story_ideas_si_type_id_fkey`,
  DROP FOREIGN KEY `story_ideas_creative_difficulty_id_fkey`,
  DROP INDEX `idx_story_ideas_si_type`,
  DROP INDEX `idx_story_ideas_creative_difficulty`,
  DROP COLUMN `si_type_id`,
  DROP COLUMN `creative_difficulty_id`,
  DROP COLUMN `reference_book_title`,
  DROP COLUMN `reference_book_url`;

DROP TABLE `si_metadata_options`;
