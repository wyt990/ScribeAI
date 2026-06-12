package com.scribeai.client

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class RecordingForegroundService : Service() {

    private var capture: ChunkedPcmRecorder? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_START -> {
                val recordingId = intent.getStringExtra(EXTRA_RECORDING_ID).orEmpty()
                if (recordingId.isEmpty()) {
                    stopSelf()
                    return START_NOT_STICKY
                }
                activeRecordingId = recordingId
                val notification = buildNotification(recordingId)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(
                        NOTIFICATION_ID,
                        notification,
                        ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    )
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                }
                startCapture()
                NativeRecordingCoordinator.emitState("recording")
            }
            ACTION_STOP -> {
                stopCapture()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                NativeRecordingCoordinator.emitState("idle")
            }
            ACTION_RECOVER -> {
                stopCapture()
                startCapture()
                NativeRecordingCoordinator.emitState("recording", "recovered")
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopCapture()
        super.onDestroy()
    }

    private fun startCapture() {
        if (capture != null) return
        capture = ChunkedPcmRecorder(
            context = this,
            onChunk = { bytes -> NativeRecordingCoordinator.emitChunk(bytes) },
            onError = { msg -> NativeRecordingCoordinator.emitError(msg) }
        ).also {
            activeCapture = it
            it.start()
        }
    }

    private fun stopCapture() {
        capture?.stop()
        capture = null
        activeCapture = null
        activeRecordingId = null
    }

    private fun buildNotification(recordingId: String): Notification {
        createChannel()
        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(getString(R.string.recording_notification_title))
            .setContentText(getString(R.string.recording_notification_text))
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSubText(recordingId.take(8))
            .build()
    }

    private fun createChannel() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.recording_channel_name),
            NotificationManager.IMPORTANCE_LOW
        )
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_START = "com.scribeai.client.action.START_RECORDING"
        const val ACTION_STOP = "com.scribeai.client.action.STOP_RECORDING"
        const val ACTION_RECOVER = "com.scribeai.client.action.RECOVER_RECORDING"
        const val EXTRA_RECORDING_ID = "recording_id"

        private const val CHANNEL_ID = "scribeai_recording"
        private const val NOTIFICATION_ID = 1001

        @Volatile
        var activeRecordingId: String? = null

        @Volatile
        private var activeCapture: ChunkedPcmRecorder? = null

        fun isRecording(): Boolean = activeRecordingId != null

        fun notifyEnhancementChanged() {
            activeCapture?.updateEnhancement()
        }
    }
}
