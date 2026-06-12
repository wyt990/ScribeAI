package com.scribeai.client

enum class NativeChunkMode {
    TIMER,
    AUTO,
}

/** 网页「音频增强」面板同步到原生采音 */
object NativeAudioSettings {
    @Volatile
    var manualGain: Float = 1.0f

    @Volatile
    var autoGainEnabled: Boolean = true

    @Volatile
    var noiseSuppressionEnabled: Boolean = true

    /** timer=定时节；auto=静音后分句 */
    @Volatile
    var chunkMode: NativeChunkMode = NativeChunkMode.AUTO

    /** timer 模式：每片 WAV 时长（秒） */
    @Volatile
    var chunkSeconds: Int = 3

    @Volatile
    var vadRedemptionMs: Int = 1400

    @Volatile
    var vadMinSpeechMs: Int = 400

    @Volatile
    var vadPreSpeechPadMs: Int = 800

    @Volatile
    var vadSpeechRmsThreshold: Float = 0.02f

    @Volatile
    var vadMaxSegmentMs: Int = 30_000

    fun update(gain: Float, autoGain: Boolean, noiseSuppression: Boolean) {
        manualGain = gain.coerceIn(0f, 3f)
        autoGainEnabled = autoGain
        noiseSuppressionEnabled = noiseSuppression
    }
}
