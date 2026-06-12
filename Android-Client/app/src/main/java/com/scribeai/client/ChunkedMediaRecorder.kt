package com.scribeai.client

import android.content.Context
import android.media.MediaRecorder
import android.os.Handler
import android.os.Looper
import java.io.File

/**
 * 每秒切一段 webm，通过回调交给网页上传（与浏览器 MediaRecorder 分片节奏接近）。
 */
class ChunkedMediaRecorder(
    private val context: Context,
    private val onChunk: (ByteArray) -> Unit,
    private val onError: (String) -> Unit,
) {
    private val handler = Handler(Looper.getMainLooper())
    private var recorder: MediaRecorder? = null
    private var chunkFile: File? = null
    @Volatile
    private var running = false

    fun start() {
        running = true
        startNextChunk()
    }

    fun stop() {
        running = false
        handler.removeCallbacksAndMessages(null)
        releaseRecorderQuietly()
        chunkFile?.delete()
        chunkFile = null
    }

    private fun startNextChunk() {
        if (!running) return
        releaseRecorderQuietly()
        chunkFile = File(context.cacheDir, "scribe_chunk_${System.currentTimeMillis()}.webm")
        try {
            recorder = MediaRecorder().apply {
                setAudioSource(MediaRecorder.AudioSource.MIC)
                setOutputFormat(MediaRecorder.OutputFormat.WEBM)
                setAudioEncoder(MediaRecorder.AudioEncoder.OPUS)
                setAudioSamplingRate(48000)
                setAudioChannels(1)
                setAudioEncodingBitRate(64000)
                setOutputFile(chunkFile!!.absolutePath)
                prepare()
                start()
            }
            handler.postDelayed({ finishChunkAndContinue() }, CHUNK_MS)
        } catch (e: Exception) {
            onError(e.message ?: "MediaRecorder start failed")
            running = false
        }
    }

    private fun finishChunkAndContinue() {
        if (!running) return
        val file = chunkFile
        releaseRecorderQuietly()
        try {
            val bytes = file?.takeIf { it.exists() && it.length() > 0 }?.readBytes() ?: byteArrayOf()
            if (bytes.isNotEmpty()) {
                onChunk(bytes)
            }
        } catch (e: Exception) {
            onError(e.message ?: "chunk read failed")
        } finally {
            file?.delete()
            chunkFile = null
        }
        if (running) {
            startNextChunk()
        }
    }

    private fun releaseRecorderQuietly() {
        try {
            recorder?.apply {
                try {
                    stop()
                } catch (_: Exception) {
                    /* 不足 1s 时 stop 可能抛异常，忽略 */
                }
                release()
            }
        } catch (_: Exception) {
        } finally {
            recorder = null
        }
    }

    companion object {
        private const val CHUNK_MS = 1000L
    }
}
