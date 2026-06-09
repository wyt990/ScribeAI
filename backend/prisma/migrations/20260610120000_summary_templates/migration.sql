-- SummarySkill + SummaryTemplate + Summary.templateId

CREATE TABLE `SummarySkill` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `rulesMd` TEXT NOT NULL,
    `stepsMd` TEXT NULL,
    `outputMd` TEXT NOT NULL,
    `meta` JSON NULL,
    `parentId` VARCHAR(191) NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'approved',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SummarySkill_userId_idx`(`userId`),
    INDEX `SummarySkill_slug_idx`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SummaryTemplate` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `skillId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `reviewStatus` VARCHAR(191) NOT NULL DEFAULT 'approved',
    `legacySummaryType` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `SummaryTemplate_userId_idx`(`userId`),
    INDEX `SummaryTemplate_legacySummaryType_idx`(`legacySummaryType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `SummarySkill` ADD CONSTRAINT `SummarySkill_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SummarySkill` ADD CONSTRAINT `SummarySkill_parentId_fkey` FOREIGN KEY (`parentId`) REFERENCES `SummarySkill`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `SummaryTemplate` ADD CONSTRAINT `SummaryTemplate_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `SummaryTemplate` ADD CONSTRAINT `SummaryTemplate_skillId_fkey` FOREIGN KEY (`skillId`) REFERENCES `SummarySkill`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 系统种子（固定 UUID，便于回填）
INSERT INTO `SummarySkill` (`id`, `userId`, `slug`, `name`, `rulesMd`, `stepsMd`, `outputMd`, `version`, `isPublic`, `reviewStatus`, `updatedAt`)
VALUES
(
  'sys-skill-meeting-notes',
  NULL,
  'transcript-to-meeting-notes',
  '行政会议纪要',
  '你是一位专业的学校行政会议纪要整理助手。将语音转录稿整理为**行政例会/校务会议**风格的 Markdown 纪要。\n\n## 核心原则\n\n1. **忠实于转录**：只写转录中实际出现或可直接推断的内容；不要编造时间、地点、出席人员、主持或责任部门。若「已知元数据」提供了记录人，须将其填入「记录」字段，不得改写或替换为转录中的其他人名。\n2. **缺失标 TBD**：元数据无法确定时写 TBD。\n3. **ASR 容错**：语音识别可能有误，不确定处标注「待确认」。\n4. **公文纪要体**：简洁、客观、条目化，避免口语堆砌和英文产品文档结构。\n5. **输出语言**：中文。',
  '### Step 1: 阅读转录\n- 提取时间、地点、出席、主持、记录人（缺失标 TBD）\n- 按议题归类\n- 识别决策、安排、交办事项与责任部门\n\n### Step 2: 按输出模板生成\n\n### Step 3: 质量规则\n- 一条一事，避免长段落\n- 责任部门无法确定时写（待定）或省略',
  '# [会议标题]\n\n**时间**：[YYYY 年 M 月 D 日 上午/下午 H:MM-H:MM，或 TBD]\n\n**地点**：[地点，或 TBD]\n\n**出席**：[出席人员；缺席注明，或 TBD]\n\n**主持**：[姓名，或 TBD]\n\n**记录**：[姓名，或 TBD]\n\n---\n\n## 会议内容摘要\n\n[1–3 句概括]\n\n---\n\n### 一、[大议题名称]\n\n1. **[事项要点]**（[责任部门]）\n   - [具体安排]',
  1,
  false,
  'approved',
  CURRENT_TIMESTAMP(3)
),
(
  'sys-skill-brief',
  NULL,
  'brief-summary',
  '简要纪要',
  '请用中文对会议转录生成简要纪要，包含关键要点、主要决策和待办（如有）。忠实于转录，不要编造。',
  NULL,
  '## 简要纪要\n\n### 关键要点\n- …\n\n### 主要决策\n- …\n\n### 待办事项\n- …',
  1,
  false,
  'approved',
  CURRENT_TIMESTAMP(3)
);

INSERT INTO `SummaryTemplate` (`id`, `userId`, `skillId`, `name`, `description`, `isDefault`, `isPublic`, `reviewStatus`, `legacySummaryType`, `updatedAt`)
VALUES
(
  'sys-tpl-meeting-notes',
  NULL,
  'sys-skill-meeting-notes',
  '会议纪要（结构化）',
  '学校行政例会风格结构化纪要',
  false,
  false,
  'approved',
  'meeting-notes',
  CURRENT_TIMESTAMP(3)
),
(
  'sys-tpl-brief',
  NULL,
  'sys-skill-brief',
  '简要纪要',
  '关键要点与待办简要摘要',
  false,
  false,
  'approved',
  'brief',
  CURRENT_TIMESTAMP(3)
);

-- Summary: 增加 templateId，回填，切换唯一索引
ALTER TABLE `Summary` ADD COLUMN `templateId` VARCHAR(191) NULL;
ALTER TABLE `Summary` ADD COLUMN `templateVersion` INTEGER NOT NULL DEFAULT 1;

UPDATE `Summary` SET `templateId` = 'sys-tpl-meeting-notes' WHERE `summaryType` = 'meeting-notes' OR `summaryType` IS NULL;
UPDATE `Summary` SET `templateId` = 'sys-tpl-brief' WHERE `summaryType` = 'brief';
UPDATE `Summary` SET `templateId` = 'sys-tpl-meeting-notes' WHERE `templateId` IS NULL;

ALTER TABLE `Summary` MODIFY `templateId` VARCHAR(191) NOT NULL;

DROP INDEX `Summary_transcriptId_summaryType_key` ON `Summary`;
CREATE UNIQUE INDEX `Summary_transcriptId_templateId_key` ON `Summary`(`transcriptId`, `templateId`);
CREATE INDEX `Summary_templateId_idx` ON `Summary`(`templateId`);

ALTER TABLE `Summary` ADD CONSTRAINT `Summary_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `SummaryTemplate`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
