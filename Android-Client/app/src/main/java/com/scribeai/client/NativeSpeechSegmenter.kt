package com.scribeai.client

import kotlin.math.max
import kotlin.math.sqrt

/**
 * 能量 VAD + 自适应噪声基线：检测到静音宽限后输出一整句 PCM。
 */
class NativeSpeechSegmenter(
    private val sampleRate: Int,
    private val redemptionMs: Int,
    private val minSpeechMs: Int,
    private val preSpeechPadMs: Int,
    private val speechRmsThreshold: Float,
    private val maxSegmentMs: Int,
    private val onSegment: (ShortArray) -> Unit,
) {
    data class Snapshot(
        val prePadRing: ShortArray,
        val prePadWrite: Int,
        val prePadFilled: Int,
        val segmentSamples: ShortArray,
        val inSpeech: Boolean,
        val trailingSilenceMs: Int,
        val speechMs: Int,
        val noiseFloorRms: Float,
        val calibrated: Boolean,
        val calibrationMs: Int,
    )

    private val maxPrePadSamples = (sampleRate * preSpeechPadMs / 1000).coerceAtLeast(0)
    private val maxSegmentSamples = (sampleRate * maxSegmentMs / 1000).coerceAtLeast(sampleRate)

    private val prePadRing = ShortArray(maxPrePadSamples.coerceAtLeast(1))
    private var prePadWrite = 0
    private var prePadFilled = 0

    private val segment = ArrayList<Short>(sampleRate * 2)
    private var inSpeech = false
    private var trailingSilenceMs = 0
    private var speechMs = 0

    private var noiseFloorRms = 0.01f
    private var calibrated = false
    private var calibrationMs = 0

    fun hasPendingState(): Boolean =
        inSpeech || segment.isNotEmpty() || prePadFilled > 0

    fun snapshot(): Snapshot = Snapshot(
        prePadRing = prePadRing.copyOf(),
        prePadWrite = prePadWrite,
        prePadFilled = prePadFilled,
        segmentSamples = segment.toShortArray(),
        inSpeech = inSpeech,
        trailingSilenceMs = trailingSilenceMs,
        speechMs = speechMs,
        noiseFloorRms = noiseFloorRms,
        calibrated = calibrated,
        calibrationMs = calibrationMs,
    )

    fun restore(state: Snapshot) {
        val ringLen = prePadRing.size
        if (state.prePadRing.size == ringLen) {
            state.prePadRing.copyInto(prePadRing)
        }
        prePadWrite = state.prePadWrite.coerceIn(0, ringLen - 1)
        prePadFilled = state.prePadFilled.coerceIn(0, ringLen)
        segment.clear()
        segment.addAll(state.segmentSamples.toList())
        inSpeech = state.inSpeech
        trailingSilenceMs = state.trailingSilenceMs
        speechMs = state.speechMs
        noiseFloorRms = state.noiseFloorRms
        calibrated = state.calibrated
        calibrationMs = state.calibrationMs
    }

    fun reset() {
        segment.clear()
        inSpeech = false
        trailingSilenceMs = 0
        speechMs = 0
        prePadWrite = 0
        prePadFilled = 0
        noiseFloorRms = 0.01f
        calibrated = false
        calibrationMs = 0
    }

    fun process(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val bufferMs = count * 1000.0 / sampleRate
        val rms = computeRms(samples, count)
        if (!inSpeech) {
            updateNoiseFloor(rms, bufferMs.toInt())
        }
        val isSpeech = rms >= effectiveThreshold()

        pushPrePad(samples, count)

        if (isSpeech) {
            if (!inSpeech) {
                inSpeech = true
                speechMs = 0
                trailingSilenceMs = 0
                appendPrePad()
            }
            append(samples, count)
            speechMs += bufferMs.toInt()
            trailingSilenceMs = 0
            if (segment.size >= maxSegmentSamples) {
                flushSegment()
            }
            return
        }

        if (!inSpeech) return

        append(samples, count)
        trailingSilenceMs += bufferMs.toInt()

        if (trailingSilenceMs >= redemptionMs) {
            if (speechMs >= minSpeechMs) {
                flushSegment()
            } else {
                reset()
            }
        }
    }

    fun flushPending() {
        if (!inSpeech || segment.isEmpty()) return
        if (speechMs >= minSpeechMs) {
            flushSegment()
        } else {
            reset()
        }
    }

    private fun effectiveThreshold(): Float {
        val adaptive = (noiseFloorRms * SPEECH_MARGIN).coerceIn(
            MIN_ADAPTIVE_THRESHOLD,
            MAX_ADAPTIVE_THRESHOLD,
        )
        val blended = max(speechRmsThreshold * 0.55f, adaptive)
        return blended.coerceAtMost(speechRmsThreshold * 2.5f)
    }

    private fun updateNoiseFloor(rms: Float, bufferMs: Int) {
        if (!calibrated) {
            calibrationMs += bufferMs
            noiseFloorRms = if (calibrationMs <= bufferMs) {
                rms
            } else {
                noiseFloorRms * (1f - CALIBRATION_ALPHA) + rms * CALIBRATION_ALPHA
            }
            if (calibrationMs >= CALIBRATION_MS) {
                calibrated = true
            }
            return
        }
        noiseFloorRms = noiseFloorRms * (1f - NOISE_ALPHA) + rms * NOISE_ALPHA
    }

    private fun flushSegment() {
        if (segment.isEmpty()) return
        onSegment(segment.toShortArray())
        resetSegmentOnly()
    }

    /** 输出分句后保留噪声基线校准结果 */
    private fun resetSegmentOnly() {
        segment.clear()
        inSpeech = false
        trailingSilenceMs = 0
        speechMs = 0
        prePadWrite = 0
        prePadFilled = 0
    }

    private fun pushPrePad(samples: ShortArray, count: Int) {
        if (maxPrePadSamples <= 0) return
        for (i in 0 until count) {
            prePadRing[prePadWrite] = samples[i]
            prePadWrite = (prePadWrite + 1) % maxPrePadSamples
            if (prePadFilled < maxPrePadSamples) prePadFilled++
        }
    }

    private fun appendPrePad() {
        if (maxPrePadSamples <= 0 || prePadFilled <= 0) return
        val start = if (prePadFilled < maxPrePadSamples) 0 else prePadWrite
        for (j in 0 until prePadFilled) {
            segment.add(prePadRing[(start + j) % maxPrePadSamples])
        }
    }

    private fun append(samples: ShortArray, count: Int) {
        for (i in 0 until count) {
            segment.add(samples[i])
        }
    }

    private fun computeRms(samples: ShortArray, count: Int): Float {
        var sum = 0.0
        for (i in 0 until count) {
            val n = samples[i] / 32768.0
            sum += n * n
        }
        return sqrt(sum / count).toFloat()
    }

    companion object {
        private const val NOISE_ALPHA = 0.015f
        private const val CALIBRATION_ALPHA = 0.08f
        private const val SPEECH_MARGIN = 2.8f
        private const val MIN_ADAPTIVE_THRESHOLD = 0.006f
        private const val MAX_ADAPTIVE_THRESHOLD = 0.12f
        private const val CALIBRATION_MS = 800
    }
}
