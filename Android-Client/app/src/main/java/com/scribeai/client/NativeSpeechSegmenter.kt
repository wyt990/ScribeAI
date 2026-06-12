package com.scribeai.client

import kotlin.math.sqrt

/**
 * 能量 VAD：检测到静音宽限后输出一整句 PCM（与网页 Silero VAD 分句节奏接近）。
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
    private val maxPrePadSamples = (sampleRate * preSpeechPadMs / 1000).coerceAtLeast(0)
    private val maxSegmentSamples = (sampleRate * maxSegmentMs / 1000).coerceAtLeast(sampleRate)

    private val prePadRing = ShortArray(maxPrePadSamples.coerceAtLeast(1))
    private var prePadWrite = 0
    private var prePadFilled = 0

    private val segment = ArrayList<Short>(sampleRate * 2)
    private var inSpeech = false
    private var trailingSilenceMs = 0
    private var speechMs = 0

    fun reset() {
        segment.clear()
        inSpeech = false
        trailingSilenceMs = 0
        speechMs = 0
        prePadWrite = 0
        prePadFilled = 0
    }

    fun process(samples: ShortArray, count: Int) {
        if (count <= 0) return
        val bufferMs = count * 1000.0 / sampleRate
        val rms = computeRms(samples, count)
        val isSpeech = rms >= speechRmsThreshold

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

    private fun flushSegment() {
        if (segment.isEmpty()) return
        onSegment(segment.toShortArray())
        reset()
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
}
