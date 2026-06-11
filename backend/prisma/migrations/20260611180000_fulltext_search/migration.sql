-- Full-text search indexes (ngram parser for Chinese)
CREATE FULLTEXT INDEX `Transcript_ft_title_fulltext` ON `Transcript`(`title`, `fullText`) WITH PARSER ngram;
CREATE FULLTEXT INDEX `Summary_ft_text` ON `Summary`(`text`) WITH PARSER ngram;
