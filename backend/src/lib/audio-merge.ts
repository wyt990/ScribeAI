import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomUUID } from 'crypto';

const WAV_HEADER_BYTES = 44;

function isWavBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.toString('ascii', 0, 4) === 'RIFF';
}

function extractPcmFromWav(buffer: Buffer): Buffer {
  if (!isWavBuffer(buffer)) return buffer;
  if (buffer.length <= WAV_HEADER_BYTES) return Buffer.alloc(0);
  return buffer.subarray(WAV_HEADER_BYTES);
}

/** 修正 WAV 头中的文件长度字段 */
export function patchWavHeaderSizes(filePath: string): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  if (fileSize < WAV_HEADER_BYTES) return;

  const fd = fs.openSync(filePath, 'r+');
  try {
    const riffSize = Buffer.alloc(4);
    riffSize.writeUInt32LE(fileSize - 8, 0);
    fs.writeSync(fd, riffSize, 0, 4, 4);

    const dataSize = Buffer.alloc(4);
    dataSize.writeUInt32LE(fileSize - WAV_HEADER_BYTES, 0);
    fs.writeSync(fd, dataSize, 0, 4, 40);
  } finally {
    fs.closeSync(fd);
  }
}

/** 将多个 WAV segment 合并为单个 WAV 文件 */
export function mergeWavSegmentFiles(segmentPaths: string[], outputPath: string): void {
  if (segmentPaths.length === 0) {
    throw new Error('No WAV segments to merge');
  }

  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0]!, outputPath);
    patchWavHeaderSizes(outputPath);
    return;
  }

  const pcmParts: Buffer[] = [];
  let header: Buffer | null = null;

  for (const segmentPath of segmentPaths) {
    if (!fs.existsSync(segmentPath)) continue;
    const buf = fs.readFileSync(segmentPath);
    if (!isWavBuffer(buf)) {
      console.warn(`[AudioMerge] skip non-WAV segment: ${segmentPath}`);
      continue;
    }
    if (!header) header = Buffer.from(buf.subarray(0, WAV_HEADER_BYTES));
    const pcm = extractPcmFromWav(buf);
    if (pcm.length > 0) pcmParts.push(pcm);
  }

  if (!header || pcmParts.length === 0) {
    throw new Error('No valid WAV PCM data in segments');
  }

  const pcm = Buffer.concat(pcmParts);
  const out = Buffer.alloc(WAV_HEADER_BYTES + pcm.length);
  header.copy(out, 0);
  pcm.copy(out, WAV_HEADER_BYTES);
  fs.writeFileSync(outputPath, out);
  patchWavHeaderSizes(outputPath);
}

function escapeConcatPath(filePath: string): string {
  return filePath.replace(/'/g, "'\\''");
}

function runFfmpegConcat(listFile: string, outputPath: string, reencode: boolean): void {
  const args = reencode
    ? ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c:a', 'libopus', '-b:a', '64k', outputPath]
    : ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', outputPath];
  execFileSync('ffmpeg', args, { stdio: 'pipe' });
}

/** 将多个 WebM segment 合并为单个 WebM（需系统安装 ffmpeg） */
export function mergeWebmSegmentFiles(segmentPaths: string[], outputPath: string): void {
  if (segmentPaths.length === 0) {
    throw new Error('No WebM segments to merge');
  }

  if (segmentPaths.length === 1) {
    fs.copyFileSync(segmentPaths[0]!, outputPath);
    return;
  }

  const listFile = path.join(os.tmpdir(), `scribeai-concat-${randomUUID()}.txt`);
  const content = segmentPaths
    .filter((p) => fs.existsSync(p))
    .map((p) => `file '${escapeConcatPath(path.resolve(p))}'`)
    .join('\n');

  if (!content.trim()) {
    throw new Error('No WebM segment files found on disk');
  }

  fs.writeFileSync(listFile, content);
  try {
    try {
      runFfmpegConcat(listFile, outputPath, false);
    } catch (copyErr) {
      console.warn('[AudioMerge] ffmpeg -c copy failed, retry with libopus:', copyErr);
      runFfmpegConcat(listFile, outputPath, true);
    }
  } finally {
    try {
      fs.unlinkSync(listFile);
    } catch {
      /* ignore */
    }
  }

  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    throw new Error('ffmpeg produced empty WebM output');
  }
}

export function isFfmpegAvailable(): boolean {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}
