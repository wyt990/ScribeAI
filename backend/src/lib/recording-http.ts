import fs from 'fs';
import type { Response } from 'express';
import { getRecordingFilePath, getRecordingMeta } from './audio-archive';
import { transcribeRecordingFile } from './asr-transcribe';

export function respondRecordingMeta(
  res: Response,
  userId: string,
  recordingId: string | null | undefined
): void {
  if (!recordingId) {
    res.json({ hasRecording: false, exists: false, finalized: false, sizeBytes: null, finalizedAt: null });
    return;
  }
  const meta = getRecordingMeta(userId, recordingId);
  res.json({
    hasRecording: meta.exists,
    recordingId,
    ...meta,
  });
}

export function streamRecording(
  res: Response,
  userId: string,
  recordingId: string | null | undefined
): void {
  if (!recordingId) {
    res.status(404).json({ error: 'No recording linked' });
    return;
  }
  const filePath = getRecordingFilePath(userId, recordingId);
  if (!filePath) {
    res.status(404).json({ error: 'Recording file not found' });
    return;
  }

  const isWav = filePath.endsWith('.wav');
  res.setHeader('Content-Type', isWav ? 'audio/wav' : 'audio/webm');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="recording-${recordingId}.${isWav ? 'wav' : 'webm'}"`
  );
  fs.createReadStream(filePath).pipe(res);
}

export async function retranscribeRecording(
  userId: string,
  recordingId: string | null | undefined
): Promise<{ fullText: string; durationMs: number }> {
  if (!recordingId) {
    throw new Error('No recording linked');
  }
  const filePath = getRecordingFilePath(userId, recordingId);
  if (!filePath) {
    throw new Error('Recording file not found');
  }

  const started = Date.now();
  const fullText = await transcribeRecordingFile(filePath);
  if (!fullText.trim()) {
    throw new Error('ASR returned empty transcript');
  }

  return { fullText: fullText.trim(), durationMs: Date.now() - started };
}
