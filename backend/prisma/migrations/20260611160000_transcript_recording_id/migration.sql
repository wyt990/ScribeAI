-- AlterTable
ALTER TABLE `Transcript` ADD COLUMN `recordingId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `Transcript_recordingId_idx` ON `Transcript`(`recordingId`);
