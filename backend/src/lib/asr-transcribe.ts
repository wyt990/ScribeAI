import fs from 'fs';
import { createClient } from '@deepgram/sdk';

function openaiAsrConfig() {
  return {
    apiKey: process.env.OPENAI_ASR_API_KEY || '',
    baseUrl: process.env.OPENAI_ASR_BASE_URL || 'http://10.100.0.130:8000/v1',
    model: process.env.OPENAI_ASR_MODEL || 'funasr-nano',
    language: process.env.OPENAI_ASR_LANGUAGE || 'zh',
  };
}

async function transcribeOpenAI(
  audioBuffer: Buffer,
  mimeType = 'audio/webm;codecs=opus',
  extension = 'webm'
): Promise<string> {
  const { apiKey, baseUrl, model, language } = openaiAsrConfig();
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
  formData.append('file', blob, `audio-${Date.now()}.${extension}`);
  formData.append('model', model);
  formData.append('language', language);

  const response = await fetch(`${baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const errBody = await response.text().catch(() => '');
    throw new Error(`ASR API error ${response.status}: ${errBody}`);
  }

  const data = (await response.json()) as { text?: string };
  return data.text || '';
}

async function transcribeDeepgramBuffer(
  audioBuffer: Buffer,
  mimeType = 'audio/webm'
): Promise<string> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) throw new Error('DEEPGRAM_API_KEY is not configured');

  const deepgram = createClient(apiKey);
  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(audioBuffer, {
    model: 'nova-2-general',
    punctuate: true,
    language: process.env.OPENAI_ASR_LANGUAGE || 'zh',
    mimetype: mimeType,
  });

  if (error) {
    throw new Error(error.message || 'Deepgram transcription failed');
  }

  return result?.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim() || '';
}

/** 对音频 Buffer 执行批量转写（用于归档重跑 ASR） */
export async function transcribeAudioBuffer(
  audioBuffer: Buffer,
  mimeType = 'audio/webm;codecs=opus',
  extension = 'webm'
): Promise<string> {
  const provider = process.env.STT_PROVIDER || 'deepgram';
  const text =
    provider === 'openai_asr'
      ? await transcribeOpenAI(audioBuffer, mimeType, extension)
      : await transcribeDeepgramBuffer(audioBuffer, mimeType.split(';')[0] || 'audio/webm');

  return text.trim();
}

/** 对归档录音文件执行批量转写 */
export async function transcribeRecordingFile(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const isWav = filePath.toLowerCase().endsWith('.wav');
  return transcribeAudioBuffer(
    buffer,
    isWav ? 'audio/wav' : 'audio/webm;codecs=opus',
    isWav ? 'wav' : 'webm'
  );
}

export function getSttProviderLabel(): string {
  return process.env.STT_PROVIDER || 'deepgram';
}
