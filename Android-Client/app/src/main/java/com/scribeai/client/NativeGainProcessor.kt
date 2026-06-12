package com.scribeai.client

import kotlin.math.sqrt

/**
 * 软件增益（与网页 auto-gain.ts / 手动滑条对齐）。
 * 每个采音缓冲区更新，保证音量指示器与送 ASR 的音频一致。
 */
object NativeGainProcessor {
    private const val TARGET_RMS = 0.16f
    private const val SILENCE_RMS = 0.004f
    private const val SMOOTHING = 0.18f

    private var currentGain = 1.0f

    fun reset() {
        val settings = NativeAudioSettings
        currentGain = if (settings.autoGainEnabled) {
            1.0f
        } else {
            settings.manualGain.coerceIn(0f, 3f)
        }
    }

    /** 每个 read 调用：更新自动增益或同步手动增益 */
    fun tick(samples: ShortArray, count: Int) {
        val settings = NativeAudioSettings
        if (!settings.autoGainEnabled) {
            currentGain = settings.manualGain.coerceIn(0f, 3f)
            return
        }

        val rms = computeRms(samples, count)
        if (rms >= SILENCE_RMS) {
            val desired = (TARGET_RMS / rms).coerceIn(0f, 3f)
            currentGain += (desired - currentGain) * SMOOTHING
        }
    }

    fun currentGain(): Float = currentGain.coerceIn(0f, 3f)

    fun apply(samples: ShortArray, count: Int = samples.size): ShortArray {
        val gain = currentGain()
        if (gain == 1.0f) {
            return if (count == samples.size) samples else samples.copyOf(count)
        }

        val out = ShortArray(count)
        for (i in 0 until count) {
            val scaled = (samples[i] * gain).toInt()
            out[i] = scaled.coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
        return out
    }

    fun levelFromSamples(samples: ShortArray, count: Int): Float {
        if (count <= 0) return 0f
        var sum = 0.0
        for (i in 0 until count) {
            val n = samples[i] / 32768.0
            sum += n * n
        }
        val rms = sqrt(sum / count).toFloat()
        return (rms * 2f).coerceIn(0f, 1f)
    }

    private fun computeRms(samples: ShortArray, count: Int): Float {
        if (count <= 0) return 0f
        var sum = 0.0
        for (i in 0 until count) {
            val n = samples[i] / 32768.0f
            sum += n * n
        }
        return sqrt(sum / count).toFloat()
    }
}
