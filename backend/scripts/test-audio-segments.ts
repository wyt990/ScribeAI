/**
 * 分段归档 + master 合并冒烟测试（无需真实录音）
 * 运行: npx ts-node scripts/test-audio-segments.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

function makeMinimalWav(pcmByteLength: number, sampleRate = 16000): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcmByteLength, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcmByteLength, 40);
  const pcm = Buffer.alloc(pcmByteLength, 0x7f);
  return Buffer.concat([header, pcm]);
}

async function main() {
  const uploadsRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'scribeai-seg-test-'));
  process.env.STORAGE_UPLOADS_DIR = uploadsRoot;

  const {
    appendRecordingChunk,
    ensureMasterRecording,
    finalizeRecordingArchive,
    getRecordingMeta,
    prepareRecordingArchive,
  } = await import('../src/lib/audio-archive');

  const userId = 'test-user';
  const recordingId = 'rec-001';

  prepareRecordingArchive(userId, recordingId, 'wav');
  appendRecordingChunk(userId, recordingId, makeMinimalWav(3200), 'wav', { seq: 1 });
  finalizeRecordingArchive(userId, recordingId, 'wav');

  let meta = getRecordingMeta(userId, recordingId);
  if (!meta.finalized || !meta.exists) {
    throw new Error('segment 1 finalize failed');
  }

  prepareRecordingArchive(userId, recordingId, 'wav');
  appendRecordingChunk(userId, recordingId, makeMinimalWav(4800), 'wav', { seq: 1 });
  finalizeRecordingArchive(userId, recordingId, 'wav');

  meta = getRecordingMeta(userId, recordingId);
  if (meta.segmentCount !== 2) {
    throw new Error(`expected 2 segments, got ${meta.segmentCount}`);
  }

  const masterPath = ensureMasterRecording(userId, recordingId);
  const masterSize = fs.statSync(masterPath).size;
  const expectedMaster = 44 + 3200 + 4800;
  if (Math.abs(masterSize - expectedMaster) > 100) {
    throw new Error(`master size ${masterSize} not ~${expectedMaster}`);
  }

  console.log('OK: WAV 2-segment merge');
  console.log(`  master: ${masterPath} (${masterSize} bytes)`);
  console.log(`  segments: ${meta.segmentCount}, finalized: ${meta.finalized}`);

  fs.rmSync(uploadsRoot, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
