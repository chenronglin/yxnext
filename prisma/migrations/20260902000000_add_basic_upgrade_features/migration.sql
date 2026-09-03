-- 悦享小说创作平台基础升级：SI 扩展、批注回复、工作日日历和阶段计划修改历史。
-- 所有 SI 新字段与计划日期均允许为空，保证存量记录无需回填即可继续使用。

CREATE TABLE `si_metadata_options` (
  `option_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `category` ENUM('si_type', 'creative_difficulty') NOT NULL,
  `code` VARCHAR(64) NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `sort_order` INT UNSIGNED NOT NULL DEFAULT 0,
  `is_active` BOOLEAN NOT NULL DEFAULT true,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `uk_si_metadata_options_category_code`(`category`, `code`),
  INDEX `idx_si_metadata_options_category_active_sort`(`category`, `is_active`, `sort_order`),
  PRIMARY KEY (`option_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `story_ideas`
  ADD COLUMN `si_type_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `creative_difficulty_id` BIGINT UNSIGNED NULL,
  ADD COLUMN `reference_book_title` VARCHAR(255) NULL,
  ADD COLUMN `reference_book_url` VARCHAR(1024) NULL,
  ADD INDEX `idx_story_ideas_si_type`(`si_type_id`),
  ADD INDEX `idx_story_ideas_creative_difficulty`(`creative_difficulty_id`),
  ADD CONSTRAINT `story_ideas_si_type_id_fkey`
    FOREIGN KEY (`si_type_id`) REFERENCES `si_metadata_options`(`option_id`)
    ON DELETE SET NULL ON UPDATE NO ACTION,
  ADD CONSTRAINT `story_ideas_creative_difficulty_id_fkey`
    FOREIGN KEY (`creative_difficulty_id`) REFERENCES `si_metadata_options`(`option_id`)
    ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE TABLE `doc_comment_replies` (
  `reply_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `doc_id` BIGINT UNSIGNED NOT NULL,
  `comment_id` VARCHAR(191) NOT NULL,
  `reply_author_id` BIGINT UNSIGNED NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `idx_comment_replies_doc_comment_created`(`doc_id`, `comment_id`, `created_at`),
  INDEX `idx_comment_replies_author`(`reply_author_id`),
  PRIMARY KEY (`reply_id`),
  CONSTRAINT `doc_comment_replies_doc_id_fkey`
    FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `doc_comment_replies_reply_author_id_fkey`
    FOREIGN KEY (`reply_author_id`) REFERENCES `users`(`user_id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `workday_exceptions` (
  `exception_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `date` DATE NOT NULL,
  `is_workday` BOOLEAN NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `maintained_by` BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `workday_exceptions_date_key`(`date`),
  INDEX `idx_workday_exceptions_type_date`(`is_workday`, `date`),
  PRIMARY KEY (`exception_id`),
  CONSTRAINT `workday_exceptions_maintained_by_fkey`
    FOREIGN KEY (`maintained_by`) REFERENCES `users`(`user_id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `project_stage_plans`
  ADD COLUMN `planned_start_at` DATE NULL,
  ADD COLUMN `planned_end_at` DATE NULL,
  ADD COLUMN `lock_version` INT UNSIGNED NOT NULL DEFAULT 0;

-- 仅把当前已有计划时间映射到新增计划字段，不改写实际开始/完成时间。
UPDATE `project_stage_plans`
SET
  `planned_start_at` = DATE(COALESCE(`started_at`, `unlocked_at`)),
  `planned_end_at` = DATE(`due_at`)
WHERE `started_at` IS NOT NULL OR `unlocked_at` IS NOT NULL OR `due_at` IS NOT NULL;

CREATE TABLE `project_stage_plan_changes` (
  `change_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `stage_plan_id` BIGINT UNSIGNED NOT NULL,
  `changed_by` BIGINT UNSIGNED NOT NULL,
  `reason` VARCHAR(500) NOT NULL,
  `before_json` JSON NOT NULL,
  `after_json` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  INDEX `idx_stage_plan_changes_plan_created`(`stage_plan_id`, `created_at`),
  INDEX `idx_stage_plan_changes_actor`(`changed_by`),
  PRIMARY KEY (`change_id`),
  CONSTRAINT `project_stage_plan_changes_stage_plan_id_fkey`
    FOREIGN KEY (`stage_plan_id`) REFERENCES `project_stage_plans`(`stage_plan_id`)
    ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `project_stage_plan_changes_changed_by_fkey`
    FOREIGN KEY (`changed_by`) REFERENCES `users`(`user_id`)
    ON DELETE NO ACTION ON UPDATE NO ACTION
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
