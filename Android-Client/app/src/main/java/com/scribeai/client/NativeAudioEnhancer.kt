package com.scribeai.client

import android.content.Context

/**
 * 原生音频增强：DTLN（ONNX）降噪 + 由 [NativeGainProcessor] 负责增益。
 * 受网页「AI 降噪」开关控制。
 */
class NativeAudioEnhancer(private val context: Context) {
    private var dtln: DtlnNoiseSuppressor? = null

    /** 用户开启降噪且模型加载成功 */
    fun isDenoiseActive(): Boolean =
        NativeAudioSettings.noiseSuppressionEnabled && dtln?.isReady == true

    /** 用户开启降噪但模型未加载成功 */
    fun isDenoiseFailed(): Boolean =
        NativeAudioSettings.noiseSuppressionEnabled && dtln != null && dtln?.isReady != true

    fun denoiseEngineName(): String = if (isDenoiseActive()) "DTLN" else ""

    fun denoiseLastError(): String? = dtln?.lastError

    fun prepare(): Boolean {
        releaseDtln()
        if (!NativeAudioSettings.noiseSuppressionEnabled) {
            return false
        }
        val processor = DtlnNoiseSuppressor(context.applicationContext)
        return if (processor.initialize()) {
            dtln = processor
            true
        } else {
            dtln = processor
            false
        }
    }

    fun updateEnhancement() {
        if (!NativeAudioSettings.noiseSuppressionEnabled) {
            releaseDtln()
            return
        }
        if (dtln?.isReady == true) return
        prepare()
    }

    fun processPcm16(input: ShortArray, count: Int, out: ShortArray): Int {
        val processor = dtln
        if (!NativeAudioSettings.noiseSuppressionEnabled || processor == null || !processor.isReady) {
            System.arraycopy(input, 0, out, 0, count)
            return count
        }
        return processor.processPcm16(input, count, out)
    }

    fun release() {
        releaseDtln()
    }

    private fun releaseDtln() {
        dtln?.release()
        dtln = null
    }
}
