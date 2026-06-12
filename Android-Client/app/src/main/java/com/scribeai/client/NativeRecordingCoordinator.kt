package com.scribeai.client

import android.util.Base64
import android.webkit.WebView
import org.json.JSONObject
import java.lang.ref.WeakReference

/** 原生录音 → WebView 事件桥（自定义 DOM 事件，网页端监听） */
object NativeRecordingCoordinator {
    private var webViewRef: WeakReference<WebView>? = null

    fun attach(webView: WebView) {
        webViewRef = WeakReference(webView)
    }

    fun detach() {
        webViewRef = null
    }

    fun emitChunk(bytes: ByteArray) {
        if (bytes.isEmpty()) return
        val base64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
        val quoted = JSONObject.quote(base64)
        val script = """
            (function(){
              try {
                if (typeof window.__scribeaiOnNativeChunk === 'function') {
                  window.__scribeaiOnNativeChunk($quoted);
                  return;
                }
              } catch (e) {
                console.error('[ScribeAINative] direct chunk failed', e);
              }
              try {
                var detail = { base64: $quoted };
                window.dispatchEvent(new CustomEvent('scribeai-native-chunk', { detail: detail }));
              } catch (e2) {
                console.error('[ScribeAINative] chunk event failed', e2);
              }
            })();
        """.trimIndent()
        val webView = webViewRef?.get() ?: return
        webView.post {
            webView.evaluateJavascript(script, null)
        }
    }

    fun emitState(state: String, reason: String = "") {
        dispatch(
            "scribeai-native-state",
            JSONObject().put("state", state).put("reason", reason).toString()
        )
    }

    fun emitError(message: String) {
        emitState("error", message)
    }

    /** 0..1 增强后音量电平 + 当前增强状态（供网页指示器与状态展示） */
    fun emitLevel(
        level: Float,
        gain: Float,
        autoGainEnabled: Boolean,
        noiseSuppressionEnabled: Boolean,
        noiseSuppressionActive: Boolean,
        noiseSuppressionEngine: String = "",
        noiseSuppressionError: String? = null,
    ) {
        val detail = JSONObject()
            .put("level", level.coerceIn(0f, 1f).toDouble())
            .put("gain", gain.coerceIn(0f, 3f).toDouble())
            .put("autoGainEnabled", autoGainEnabled)
            .put("noiseSuppressionEnabled", noiseSuppressionEnabled)
            .put("noiseSuppressionActive", noiseSuppressionActive)
            .put("noiseSuppressionEngine", noiseSuppressionEngine)
            .put("noiseSuppressionError", noiseSuppressionError ?: "")
        dispatch("scribeai-native-level", detail.toString())
    }

    private fun dispatch(eventName: String, detailJson: String) {
        val webView = webViewRef?.get() ?: return
        val script = """
            (function(){
              try {
                var detail = $detailJson;
                window.dispatchEvent(new CustomEvent('$eventName', { detail: detail }));
              } catch (e) {
                console.error('[ScribeAINative] dispatch failed', e);
              }
            })();
        """.trimIndent()
        webView.post {
            webView.evaluateJavascript(script, null)
        }
    }
}
