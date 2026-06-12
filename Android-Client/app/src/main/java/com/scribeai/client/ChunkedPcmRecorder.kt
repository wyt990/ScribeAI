package com.scribeai.client

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.os.Handler
import android.os.HandlerThread
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * 16kHz PCM 采音 + DTLN 降噪 + 软件增益。
 * - 定时 [TIMER] 分片：连续归档（与 chunkMode 无关，始终运行）
 * - 静音分句 [AUTO]：仅用于实时 STT，不单独承担归档
 */
class ChunkedPcmRecorder(
    private val context: Context,
    private val onChunk: (ByteArray, Long, Long, String?) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val enhancer = NativeAudioEnhancer(context)
    private var worker: HandlerThread? = null
    private var handler: Handler? = null
    private var audioRecord: AudioRecord? = null

    @Volatile
    private var running = false

    @Volatile
    private var capturePaused = false

    private var lastLevelEmitAt = 0L
    private val denoiseScratch = ShortArray(4096)

    private var chunkSamples = ShortArray(SAMPLE_RATE * DEFAULT_CHUNK_SECONDS)
    private var chunkOffset = 0
    private var lastAutoGainEnabled = NativeAudioSettings.autoGainEnabled
    private var speechSegmenter: NativeSpeechSegmenter? = null
    private var archiveSeq = 0L
    private var sttSeq = 0L
    private var denoiseAutoRetried = false

    @Volatile
    private var shutdownKind = ShutdownKind.FULL

    private enum class ShutdownKind {
        FULL,
        AUDIO_ONLY,
    }

    fun pauseCapture() {
        capturePaused = true
    }

    fun resumeCapture() {
        capturePaused = false
    }

    fun start() {
        if (running) return
        beginCapture(resetSegmenter = true)
    }

    /** 错误恢复：重启采音线程并尽量保留分句器上下文 */
    fun recoverCapture() {
        if (running) {
            shutdownKind = ShutdownKind.AUDIO_ONLY
            haltCaptureThread()
        }
        shutdownKind = ShutdownKind.FULL
        if (!running) {
            beginCapture(resetSegmenter = false)
        }
    }

    fun stop() {
        shutdownKind = ShutdownKind.FULL
        haltCaptureThread()
    }

    private fun beginCapture(resetSegmenter: Boolean) {
        if (running) return
        if (resetSegmenter) {
            archiveSeq = 0L
            sttSeq = 0L
            denoiseAutoRetried = false
            savedSegmenterSnapshot = null
            speechSegmenter = if (NativeAudioSettings.chunkMode == NativeChunkMode.AUTO) {
                createSpeechSegmenter()
            } else {
                null
            }
        } else {
            if (speechSegmenter == null && NativeAudioSettings.chunkMode == NativeChunkMode.AUTO) {
                speechSegmenter = createSpeechSegmenter().also { segmenter ->
                    savedSegmenterSnapshot?.let { snapshot ->
                        segmenter.restore(snapshot)
                        savedSegmenterSnapshot = null
                    }
                }
            }
        }

        capturePaused = false
        val chunkSeconds = NativeAudioSettings.chunkSeconds.coerceIn(1, 30)
        chunkSamples = ShortArray(SAMPLE_RATE * chunkSeconds)
        if (resetSegmenter) {
            NativeGainProcessor.reset()
        }
        chunkOffset = 0
        lastAutoGainEnabled = NativeAudioSettings.autoGainEnabled

        if (NativeAudioSettings.noiseSuppressionEnabled) {
            if (!enhancer.prepare()) {
                enhancer.retryPrepare()
            }
        }

        val sampleRate = SAMPLE_RATE
        val channelConfig = AudioFormat.CHANNEL_IN_MONO
        val audioFormat = AudioFormat.ENCODING_PCM_16BIT
        val minBuffer = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
        if (minBuffer <= 0) {
            onError("AudioRecord buffer size invalid")
            return
        }

        val bufferSize = minBuffer.coerceAtLeast(sampleRate * 2)
        val record = try {
            AudioRecord(
                MediaRecorder.AudioSource.VOICE_RECOGNITION,
                sampleRate,
                channelConfig,
                audioFormat,
                bufferSize
            )
        } catch (e: SecurityException) {
            onError(e.message ?: "RECORD_AUDIO permission denied")
            return
        }

        if (record.state != AudioRecord.STATE_INITIALIZED) {
            record.release()
            onError("AudioRecord init failed")
            return
        }

        audioRecord = record

        val thread = HandlerThread("ScribePcmCapture").also { it.start() }
        worker = thread
        handler = Handler(thread.looper)
        running = true

        try {
            record.startRecording()
        } catch (e: Exception) {
            running = false
            releaseAudioRecord(record)
            enhancer.release()
            releaseWorkerThread()
            onError(e.message ?: "AudioRecord start failed")
            return
        }

        handler?.post { captureLoop(record, bufferSize) }
    }

    private fun haltCaptureThread() {
        if (!running && audioRecord == null && worker == null) return
        running = false
        val thread = worker
        if (thread != null && thread.isAlive) {
            try {
                thread.join(5000)
            } catch (_: InterruptedException) {
                Thread.currentThread().interrupt()
            }
        }
        releaseWorkerThread()
    }

    fun updateEnhancement() {
        val nowAuto = NativeAudioSettings.autoGainEnabled
        if (nowAuto && !lastAutoGainEnabled) {
            NativeGainProcessor.reset()
        } else if (!nowAuto) {
            NativeGainProcessor.reset()
        }
        lastAutoGainEnabled = nowAuto
        enhancer.updateEnhancement()
    }

    fun retryDenoise(): Boolean {
        if (!NativeAudioSettings.noiseSuppressionEnabled) return false
        return enhancer.retryPrepare()
    }

    fun enhancementStatus(): NativeEnhancementStatus {
        return NativeEnhancementStatus(
            gain = NativeGainProcessor.currentGain(),
            autoGainEnabled = NativeAudioSettings.autoGainEnabled,
            noiseSuppressionEnabled = NativeAudioSettings.noiseSuppressionEnabled,
            noiseSuppressionActive = enhancer.isDenoiseActive(),
            noiseSuppressionEngine = enhancer.denoiseEngineName(),
            noiseSuppressionError = if (
                NativeAudioSettings.noiseSuppressionEnabled && !enhancer.isDenoiseActive()
            ) {
                enhancer.denoiseLastError()
            } else {
                null
            },
        )
    }

    private fun releaseWorkerThread() {
        worker?.quitSafely()
        worker = null
        handler = null
    }

    private fun createSpeechSegmenter(): NativeSpeechSegmenter {
        val s = NativeAudioSettings
        return NativeSpeechSegmenter(
            sampleRate = SAMPLE_RATE,
            redemptionMs = s.vadRedemptionMs,
            minSpeechMs = s.vadMinSpeechMs,
            preSpeechPadMs = s.vadPreSpeechPadMs,
            speechRmsThreshold = s.vadSpeechRmsThreshold,
            maxSegmentMs = s.vadMaxSegmentMs,
            onSegment = { samples -> emitSttChunk(samples, samples.size) },
        )
    }

    private fun captureLoop(record: AudioRecord, readBufferSize: Int) {
        val timerOnlyMode = speechSegmenter == null
        try {
            val readBuf = ShortArray(readBufferSize / 2)

            while (running) {
                val read = try {
                    record.read(readBuf, 0, readBuf.size)
                } catch (e: Exception) {
                    onError(e.message ?: "AudioRecord read failed")
                    break
                }

                if (read <= 0) continue

                if (capturePaused) continue

                NativeGainProcessor.tick(readBuf, read)

                val scratch = if (read <= denoiseScratch.size) denoiseScratch else ShortArray(read)
                enhancer.processPcm16(readBuf, read, scratch)
                val gained = NativeGainProcessor.apply(scratch, read)

                val now = System.currentTimeMillis()
                if (
                    !denoiseAutoRetried &&
                    NativeAudioSettings.noiseSuppressionEnabled &&
                    enhancer.isDenoiseFailed()
                ) {
                    denoiseAutoRetried = true
                    enhancer.retryPrepare()
                }
                if (now - lastLevelEmitAt >= 60) {
                    lastLevelEmitAt = now
                    val status = enhancementStatus()
                    NativeRecordingCoordinator.emitLevel(
                        level = NativeGainProcessor.levelFromSamples(gained, read),
                        gain = status.gain,
                        autoGainEnabled = status.autoGainEnabled,
                        noiseSuppressionEnabled = status.noiseSuppressionEnabled,
                        noiseSuppressionActive = status.noiseSuppressionActive,
                        noiseSuppressionEngine = status.noiseSuppressionEngine,
                        noiseSuppressionError = status.noiseSuppressionError,
                    )
                }

                // 连续定时归档（AUTO 与 TIMER 模式均运行）
                appendTimerChunk(gained, read, timerOnlyMode)

                // AUTO：额外按静音分句驱动实时 STT（purpose=stt，不写归档）
                speechSegmenter?.process(gained, read)
            }
        } finally {
            val segmenter = speechSegmenter
            when (shutdownKind) {
                ShutdownKind.AUDIO_ONLY -> {
                    if (segmenter != null && segmenter.hasPendingState()) {
                        savedSegmenterSnapshot = segmenter.snapshot()
                    }
                }
                ShutdownKind.FULL -> {
                    // 停止时务必 flush，避免唱歌/讲话滞留在缓冲中丢失
                    segmenter?.flushPending()
                    savedSegmenterSnapshot = null
                    speechSegmenter = null
                    if (chunkOffset > 0) {
                        if (NativeAudioSettings.chunkMode == NativeChunkMode.TIMER) {
                            emitCombinedChunk(chunkSamples, chunkOffset)
                        } else {
                            emitArchiveChunk(chunkSamples, chunkOffset)
                        }
                        chunkOffset = 0
                    }
                }
            }
            if (shutdownKind == ShutdownKind.FULL) {
                releaseAudioRecord(record)
                enhancer.release()
            } else {
                releaseAudioRecord(record)
            }
            releaseWorkerThread()
        }
    }

    private fun appendTimerChunk(gained: ShortArray, read: Int, timerOnlyMode: Boolean) {
        var srcIndex = 0
        while (srcIndex < read && running) {
            val toCopy = minOf(read - srcIndex, chunkSamples.size - chunkOffset)
            System.arraycopy(gained, srcIndex, chunkSamples, chunkOffset, toCopy)
            chunkOffset += toCopy
            srcIndex += toCopy

            if (chunkOffset >= chunkSamples.size) {
                if (timerOnlyMode) {
                    emitCombinedChunk(chunkSamples, chunkSamples.size)
                } else {
                    emitArchiveChunk(chunkSamples, chunkSamples.size)
                }
                chunkOffset = 0
            }
        }
    }

    private fun releaseAudioRecord(record: AudioRecord) {
        try {
            if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                record.stop()
            }
        } catch (_: Exception) {
        }
        try {
            record.release()
        } catch (_: Exception) {
        }
        if (audioRecord === record) {
            audioRecord = null
        }
    }

    /** TIMER 模式：同一片既归档又 STT */
    private fun emitCombinedChunk(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val wav = samplesToWav(samples, count)
        archiveSeq += 1
        onChunk(wav, archiveSeq, System.currentTimeMillis(), null)
    }

    /** AUTO 模式：定时片仅归档 */
    private fun emitArchiveChunk(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val wav = samplesToWav(samples, count)
        archiveSeq += 1
        onChunk(wav, archiveSeq, System.currentTimeMillis(), PURPOSE_ARCHIVE)
    }

    /** AUTO 模式：静音分句片仅 STT */
    private fun emitSttChunk(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val wav = samplesToWav(samples, count)
        sttSeq += 1
        onChunk(wav, sttSeq, System.currentTimeMillis(), PURPOSE_STT)
    }

    private fun samplesToWav(samples: ShortArray, count: Int): ByteArray {
        val pcmBytes = shortsToBytes(samples, count)
        return WavEncoder.pcm16ToWav(pcmBytes, SAMPLE_RATE)
    }

    private fun shortsToBytes(samples: ShortArray, count: Int): ByteArray {
        val buffer = ByteBuffer.allocate(count * 2).order(ByteOrder.LITTLE_ENDIAN)
        for (i in 0 until count) {
            buffer.putShort(samples[i])
        }
        return buffer.array()
    }

    companion object {
        private const val SAMPLE_RATE = 16_000
        private const val DEFAULT_CHUNK_SECONDS = 3
        const val PURPOSE_ARCHIVE = "archive"
        const val PURPOSE_STT = "stt"

        @Volatile
        private var savedSegmenterSnapshot: NativeSpeechSegmenter.Snapshot? = null
    }
}

data class NativeEnhancementStatus(
    val gain: Float,
    val autoGainEnabled: Boolean,
    val noiseSuppressionEnabled: Boolean,
    val noiseSuppressionActive: Boolean,
    val noiseSuppressionEngine: String = "",
    val noiseSuppressionError: String? = null,
)
