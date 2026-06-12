package com.scribeai.client

import android.webkit.JavascriptInterface
import androidx.core.content.ContextCompat
import org.json.JSONObject

/**
 * WebView JavaScript 桥：网页通过 window.ScribeAINative 调用。
 * 与 UA 中的 ScribeAI-Android 标记配合，用于区分壳内原生持麦与浏览器 getUserMedia。
 */
class ScribeAINativeBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun isAvailable(): Boolean = true

    @JavascriptInterface
    fun getCaptureMode(): String = "native"

    @JavascriptInterface
    fun getState(): String {
        return if (RecordingForegroundService.isRecording()) "recording" else "idle"
    }

    @JavascriptInterface
    fun setAudioEnhancement(gain: Double, autoGain: Boolean, noiseSuppression: Boolean) {
        NativeAudioSettings.update(
            gain = gain.toFloat(),
            autoGain = autoGain,
            noiseSuppression = noiseSuppression
        )
        RecordingForegroundService.notifyEnhancementChanged()
    }

    @JavascriptInterface
    fun startRecording(recordingId: String) {
        startRecording(recordingId, "{}")
    }

    /**
     * @param optionsStr JSON 配置，或兼容旧版纯数字（秒）字符串
     */
    @JavascriptInterface
    fun startRecording(recordingId: String, optionsStr: String) {
        if (recordingId.isBlank()) return
        applyRecordingOptions(optionsStr)
        activity.runOnUiThread {
            val intent = android.content.Intent(activity, RecordingForegroundService::class.java).apply {
                action = RecordingForegroundService.ACTION_START
                putExtra(RecordingForegroundService.EXTRA_RECORDING_ID, recordingId)
            }
            ContextCompat.startForegroundService(activity, intent)
        }
    }

    @JavascriptInterface
    fun stopRecording() {
        activity.runOnUiThread {
            val intent = android.content.Intent(activity, RecordingForegroundService::class.java).apply {
                action = RecordingForegroundService.ACTION_STOP
            }
            activity.startService(intent)
        }
    }

    @JavascriptInterface
    fun recoverRecording() {
        activity.runOnUiThread {
            val intent = android.content.Intent(activity, RecordingForegroundService::class.java).apply {
                action = RecordingForegroundService.ACTION_RECOVER
            }
            activity.startService(intent)
        }
    }

    private fun applyRecordingOptions(optionsStr: String) {
        val trimmed = optionsStr.trim()
        if (!trimmed.startsWith("{")) {
            NativeAudioSettings.chunkMode = NativeChunkMode.TIMER
            NativeAudioSettings.chunkSeconds = trimmed.toIntOrNull()?.coerceIn(1, 30) ?: 3
            return
        }

        val json = JSONObject(trimmed)
        val mode = json.optString("mode", "auto").lowercase()
        NativeAudioSettings.chunkMode = if (mode == "timer") {
            NativeChunkMode.TIMER
        } else {
            NativeChunkMode.AUTO
        }
        NativeAudioSettings.chunkSeconds = json.optInt("chunkSeconds", 3).coerceIn(1, 30)

        val vad = json.optJSONObject("vad")
        if (vad != null) {
            NativeAudioSettings.vadRedemptionMs =
                vad.optInt("redemptionMs", 1400).coerceIn(200, 10_000)
            NativeAudioSettings.vadMinSpeechMs =
                vad.optInt("minSpeechMs", 400).coerceIn(100, 10_000)
            NativeAudioSettings.vadPreSpeechPadMs =
                vad.optInt("preSpeechPadMs", 800).coerceIn(0, 3000)
            NativeAudioSettings.vadSpeechRmsThreshold =
                vad.optDouble("speechRmsThreshold", 0.02).toFloat().coerceIn(0.001f, 0.5f)
            NativeAudioSettings.vadMaxSegmentMs =
                vad.optInt("maxSegmentMs", 30_000).coerceIn(5_000, 120_000)
        }
    }
}
