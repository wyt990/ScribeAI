-- Add summaryType, allow multiple summaries per transcript (by type)

-- 1. Add column (existing rows default to meeting-notes)
ALTER TABLE `Summary` ADD COLUMN `summaryType` VARCHAR(191) NOT NULL DEFAULT 'meeting-notes';

-- 2. Widen text for long structured summaries
ALTER TABLE `Summary` MODIFY `text` TEXT NOT NULL;

-- 3. Replace 1:1 unique with composite unique (MySQL FK needs index on transcriptId)
ALTER TABLE `Summary` DROP FOREIGN KEY `Summary_transcriptId_fkey`;
DROP INDEX `Summary_transcriptId_key` ON `Summary`;
CREATE UNIQUE INDEX `Summary_transcriptId_summaryType_key` ON `Summary`(`transcriptId`, `summaryType`);
ALTER TABLE `Summary` ADD CONSTRAINT `Summary_transcriptId_fkey` FOREIGN KEY (`transcriptId`) REFERENCES `Transcript`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
