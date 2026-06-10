-- Add recordedAt column to Transcript table (stores the original recording start time from Draft.startedAt)
ALTER TABLE transcript ADD COLUMN recordedAt datetime(3) NULL AFTER fullText;
