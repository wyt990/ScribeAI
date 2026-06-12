package com.scribeai.client

import kotlin.math.PI
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.sin

/** 512 点实数 FFT（DTLN：block_len=512 → 257 频点） */
internal object DtlnRealFft {
    private const val N = 512
    private const val BINS = N / 2 + 1

    fun rfft(input: FloatArray): Pair<FloatArray, FloatArray> {
        val spectrum = fftComplex(input)
        val mag = FloatArray(BINS)
        val phase = FloatArray(BINS)
        for (i in 0 until BINS) {
            val re = spectrum[i].first
            val im = spectrum[i].second
            mag[i] = hypot(re.toDouble(), im.toDouble()).toFloat()
            phase[i] = atan2(im, re)
        }
        return mag to phase
    }

    fun irfft(mag: FloatArray, phase: FloatArray): FloatArray {
        val spectrum = Array(N) { Pair(0f, 0f) }
        for (i in 0 until BINS) {
            val re = mag[i] * cos(phase[i])
            val im = mag[i] * sin(phase[i])
            spectrum[i] = Pair(re, im)
            if (i in 1 until BINS - 1) {
                spectrum[N - i] = Pair(re, -im)
            }
        }
        return ifftReal(spectrum)
    }

    private fun fftComplex(input: FloatArray): Array<Pair<Float, Float>> {
        val data = Array(N) { i -> Pair(input[i], 0f) }
        fftInPlace(data)
        return data
    }

    private fun ifftReal(spectrum: Array<Pair<Float, Float>>): FloatArray {
        val data = spectrum.map { Pair(it.first, -it.second) }.toTypedArray()
        fftInPlace(data)
        return FloatArray(N) { i -> data[i].first / N }
    }

    private fun fftInPlace(data: Array<Pair<Float, Float>>) {
        val n = data.size
        var j = 0
        for (i in 1 until n) {
            var bit = n shr 1
            while (j and bit != 0) {
                j = j xor bit
                bit = bit shr 1
            }
            j = j xor bit
            if (i < j) {
                val tmp = data[i]
                data[i] = data[j]
                data[j] = tmp
            }
        }

        var len = 2
        while (len <= n) {
            val ang = (-2.0 * PI / len)
            val wLenRe = cos(ang).toFloat()
            val wLenIm = sin(ang).toFloat()
            var i = 0
            while (i < n) {
                var wRe = 1f
                var wIm = 0f
                for (k in 0 until len / 2) {
                    val u = data[i + k]
                    val vRe = data[i + k + len / 2].first * wRe - data[i + k + len / 2].second * wIm
                    val vIm = data[i + k + len / 2].first * wIm + data[i + k + len / 2].second * wRe
                    data[i + k] = Pair(u.first + vRe, u.second + vIm)
                    data[i + k + len / 2] = Pair(u.first - vRe, u.second - vIm)
                    val nextWRe = wRe * wLenRe - wIm * wLenIm
                    wIm = wRe * wLenIm + wIm * wLenRe
                    wRe = nextWRe
                }
                i += len
            }
            len = len shl 1
        }
    }
}
