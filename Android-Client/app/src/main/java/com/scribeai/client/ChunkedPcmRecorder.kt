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
 * 分片模式：定时 [TIMER] 或静音分句 [AUTO]（见 [NativeAudioSettings.chunkMode]）。
 */
class ChunkedPcmRecorder(
    private val context: Context,
    private val onChunk: (ByteArray) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val enhancer = NativeAudioEnhancer(context)
    private var worker: HandlerThread? = null
    private var handler: Handler? = null
    private var audioRecord: AudioRecord? = null

    @Volatile
    private var running = false

    private var lastLevelEmitAt = 0L
    private val denoiseScratch = ShortArray(4096)

    private var chunkSamples = ShortArray(SAMPLE_RATE * DEFAULT_CHUNK_SECONDS)
    private var chunkOffset = 0
    private var lastAutoGainEnabled = NativeAudioSettings.autoGainEnabled
    private var speechSegmenter: NativeSpeechSegmenter? = null

    fun start() {
        if (running) return
        val chunkSeconds = NativeAudioSettings.chunkSeconds.coerceIn(1, 30)
        chunkSamples = ShortArray(SAMPLE_RATE * chunkSeconds)
        NativeGainProcessor.reset()
        chunkOffset = 0
        lastAutoGainEnabled = NativeAudioSettings.autoGainEnabled
        speechSegmenter = if (NativeAudioSettings.chunkMode == NativeChunkMode.AUTO) {
            createSpeechSegmenter()
        } else {
            null
        }

        if (NativeAudioSettings.noiseSuppressionEnabled) {
            enhancer.prepare()
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

    fun stop() {
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
            onSegment = { samples -> emitChunk(samples, samples.size) },
        )
    }

    private fun captureLoop(record: AudioRecord, readBufferSize: Int) {
        try {
            val readBuf = ShortArray(readBufferSize / 2)
            val useAutoSegments = speechSegmenter != null

            while (running) {
                val read = try {
                    record.read(readBuf, 0, readBuf.size)
                } catch (e: Exception) {
                    onError(e.message ?: "AudioRecord read failed")
                    break
                }

                if (read <= 0) continue

                NativeGainProcessor.tick(readBuf, read)

                val scratch = if (read <= denoiseScratch.size) denoiseScratch else ShortArray(read)
                enhancer.processPcm16(readBuf, read, scratch)
                val gained = NativeGainProcessor.apply(scratch, read)

                val now = System.currentTimeMillis()
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

                if (useAutoSegments) {
                    speechSegmenter?.process(gained, read)
                } else {
                    appendTimerChunk(gained, read)
                }
            }
        } finally {
            if (speechSegmenter != null) {
                speechSegmenter?.flushPending()
            } else if (chunkOffset > 0) {
                emitChunk(chunkSamples, chunkOffset)
                chunkOffset = 0
            }
            speechSegmenter = null
            releaseAudioRecord(record)
            enhancer.release()
            releaseWorkerThread()
        }
    }

    private fun appendTimerChunk(gained: ShortArray, read: Int) {
        var srcIndex = 0
        while (srcIndex < read && running) {
            val toCopy = minOf(read - srcIndex, chunkSamples.size - chunkOffset)
            System.arraycopy(gained, srcIndex, chunkSamples, chunkOffset, toCopy)
            chunkOffset += toCopy
            srcIndex += toCopy

            if (chunkOffset >= chunkSamples.size) {
                emitChunk(chunkSamples, chunkSamples.size)
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

    private fun emitChunk(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val pcmBytes = shortsToBytes(samples, count)
        val wav = WavEncoder.pcm16ToWav(pcmBytes, SAMPLE_RATE)
        onChunk(wav)
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
