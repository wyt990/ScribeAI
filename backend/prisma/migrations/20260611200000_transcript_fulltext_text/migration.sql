-- Transcript.fullText 须为 TEXT，否则从草稿转正时长转录会超出 varchar(191) 限制
ALTER TABLE `Transcript` MODIFY `fullText` TEXT NULL;
