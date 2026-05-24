package com.r1net.prtg_monitor

import android.app.AlarmManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

class MonitoringForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "prtg_foreground_channel"
        const val ALERT_CHANNEL_ID = "prtg_alert_channel"
        const val NOTIFICATION_ID = 999
        const val ALERT_NOTIFICATION_ID = 2000
        const val ACTION_FLUTTER_ALIVE = "FLUTTER_ALIVE"
        const val ACTION_STOP = "STOP"

        fun start(context: Context) {
            val intent = Intent(context, MonitoringForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, MonitoringForegroundService::class.java)
            intent.action = ACTION_STOP
            context.startService(intent)
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var pollingRunnable: Runnable? = null
    private var notifCheckerRunnable: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var mediaPlayer: MediaPlayer? = null
    private var isFlutterAlive = false

    // State tracking
    private val previousDownSensors = mutableSetOf<Int>()
    private val previousLowSensors = mutableSetOf<Int>()
    private val rollingAverages = mutableMapOf<Int, Double>()

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        acquireWakeLock()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_FLUTTER_ALIVE -> {
                isFlutterAlive = true
                stopNativePolling()
                return START_STICKY
            }
            ACTION_STOP -> {
                stopNativePolling()
                stopNotifChecker()
                releaseWakeLock()
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
                return START_NOT_STICKY
            }
        }

        // Default: start foreground + start polling if Flutter not alive
        val notification = buildNotification("PRTG Monitor aktif", "Memulai monitoring...")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        // Always start native polling — it will check isFlutterAlive internally
        if (!isFlutterAlive) {
            startNativePolling()
        }

        // Start notification re-poster
        startNotifChecker()

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App swiped away — Flutter is dead
        isFlutterAlive = false
        startNativePolling()
        scheduleRestart()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        stopNativePolling()
        stopNotifChecker()
        stopAlarm()
        releaseWakeLock()
        scheduleRestart()
        executor.shutdownNow()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ═══════════════════════════════════════════════════════════════════════
    // NATIVE POLLING
    // ═══════════════════════════════════════════════════════════════════════

    private fun startNativePolling() {
        if (pollingRunnable != null) return

        val settings = NativeConfigManager.readSettings(this)
        val intervalMs = ((settings?.pollingInterval ?: 60) * 1000).toLong()

        pollingRunnable = object : Runnable {
            override fun run() {
                if (!isFlutterAlive) {
                    executor.execute { doPoll() }
                    handler.postDelayed(this, intervalMs)
                }
            }
        }
        // Poll immediately, then repeat
        handler.post(pollingRunnable!!)
    }

    private fun stopNativePolling() {
        pollingRunnable?.let { handler.removeCallbacks(it) }
        pollingRunnable = null
    }

    private fun doPoll() {
        val settings = NativeConfigManager.readSettings(this) ?: return
        val configs = NativeConfigManager.readConfigs(this)
        if (configs.isEmpty()) return

        val host = extractHost(settings.baseUrl) ?: return

        var downCount = 0
        var lowCount = 0
        var normalCount = 0
        val downNames = mutableListOf<String>()
        val lowNames = mutableListOf<String>()
        val currentDown = mutableSetOf<Int>()
        val currentLow = mutableSetOf<Int>()
        val newDown = mutableListOf<String>()
        val newLow = mutableListOf<String>()

        for (config in configs) {
            if (!config.enabled || !config.monitoringEnabled || config.maintenance) continue

            val bitrate = fetchBitrate(host, settings.username, settings.passhash, config.sensorId)

            if (bitrate == null) {
                normalCount++
                continue
            }

            // DOWN check
            if (bitrate <= config.thresholdDown * 1_000_000) {
                downCount++
                downNames.add(config.title)
                currentDown.add(config.sensorId)
                if (!previousDownSensors.contains(config.sensorId)) {
                    newDown.add(config.title)
                }
            } else {
                // LOW TRAFFIC check (percentage drop)
                val avg = rollingAverages[config.sensorId]
                var isLow = false
                if (avg != null && avg > 0) {
                    val drop = ((avg - bitrate) / avg) * 100.0
                    if (drop >= config.thresholdLowTraffic) isLow = true
                }
                // Update rolling average
                val curAvg = rollingAverages[config.sensorId] ?: bitrate
                rollingAverages[config.sensorId] = curAvg * 0.8 + bitrate * 0.2

                if (isLow) {
                    lowCount++
                    lowNames.add(config.title)
                    currentLow.add(config.sensorId)
                    if (!previousLowSensors.contains(config.sensorId)) {
                        newLow.add(config.title)
                    }
                } else {
                    normalCount++
                }
            }
        }

        // Update state
        previousDownSensors.clear()
        previousDownSensors.addAll(currentDown)
        previousLowSensors.clear()
        previousLowSensors.addAll(currentLow)

        // Update notification
        val timeStr = SimpleDateFormat("HH:mm:ss", Locale.getDefault()).format(Date())
        val total = downCount + lowCount + normalCount
        val title = when {
            downCount > 0 && lowCount > 0 -> "🔴 $downCount DOWN | ⚠️ $lowCount LOW | ✅ $normalCount OK"
            downCount > 0 -> "🔴 $downCount DOWN | ✅ $normalCount OK"
            lowCount > 0 -> "⚠️ $lowCount LOW | ✅ $normalCount OK"
            else -> "✅ All $total links NORMAL"
        }
        val body = when {
            downCount > 0 -> "DOWN: ${downNames.take(3).joinToString(", ")}\n⏱ $timeStr"
            lowCount > 0 -> "LOW: ${lowNames.take(3).joinToString(", ")}\n⏱ $timeStr"
            else -> "Semua link normal\n⏱ $timeStr"
        }
        updateNotification(title, body)

        // Alarm for new DOWN
        if (newDown.isNotEmpty() && settings.alarmEnabled && settings.alarmOnDown) {
            playAlarm(settings)
            triggerVibration(settings.alarmDuration)
            showAlert(newDown, "DOWN")
        }

        // Alarm for new LOW TRAFFIC
        if (newLow.isNotEmpty() && settings.alarmEnabled && settings.alarmOnLowTraffic) {
            if (newDown.isEmpty()) { // Don't double-alarm
                playAlarm(settings)
                triggerVibration(settings.alarmDuration)
            }
            showAlert(newLow, "LOW TRAFFIC")
        }
    }

    private fun fetchBitrate(host: String, username: String, passhash: String, sensorId: Int): Double? {
        try {
            val now = Date()
            val fiveMinAgo = Date(now.time - 5 * 60 * 1000)
            val fmt = SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.US)

            val url = "$host/api/historicdata.json" +
                "?id=$sensorId&avg=0" +
                "&sdate=${fmt.format(fiveMinAgo)}&edate=${fmt.format(now)}" +
                "&usecaption=1" +
                "&username=${URLEncoder.encode(username, "UTF-8")}" +
                "&passhash=${URLEncoder.encode(passhash, "UTF-8")}"

            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 15000

            if (conn.responseCode != 200) { conn.disconnect(); return null }

            val response = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            val json = JSONObject(response)
            val histdata = json.optJSONArray("histdata") ?: return null
            if (histdata.length() == 0) return null

            val last = histdata.getJSONObject(histdata.length() - 1)
            val keys = last.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                val kl = key.lowercase()
                if (kl.contains("traffic") && kl.contains("total") && (kl.contains("speed") || kl.contains("bit"))) {
                    val v = last.optDouble(key, -1.0)
                    if (v >= 0) return v * 8 // Bytes/s → bits/s
                }
            }
            return null
        } catch (_: Exception) { return null }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // ALARM & VIBRATION
    // ═══════════════════════════════════════════════════════════════════════

    private fun playAlarm(settings: NativeConfigManager.PrtgSettings) {
        try {
            stopAlarm()
            mediaPlayer = MediaPlayer().apply {
                val alarmId = settings.selectedAlarmId
                if (alarmId.startsWith("custom_")) {
                    val alarms = NativeConfigManager.readCustomAlarms(this@MonitoringForegroundService)
                    var path: String? = null
                    for (i in 0 until alarms.length()) {
                        val a = alarms.getJSONObject(i)
                        if (a.getString("id") == alarmId) { path = a.optString("filePath"); break }
                    }
                    if (path != null && java.io.File(path).exists()) {
                        setDataSource(path)
                    } else {
                        val afd = assets.openFd("flutter_assets/assets/sounds/alarm3.wav")
                        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length); afd.close()
                    }
                } else {
                    val name = alarmId.removePrefix("builtin_")
                    try {
                        val afd = assets.openFd("flutter_assets/assets/sounds/$name.wav")
                        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length); afd.close()
                    } catch (_: Exception) {
                        val afd = assets.openFd("flutter_assets/assets/sounds/alarm3.wav")
                        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length); afd.close()
                    }
                }
                setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
                setVolume(0.9f, 0.9f)
                isLooping = true
                prepare()
                start()
            }
            handler.postDelayed({ stopAlarm() }, settings.alarmDuration * 1000L)
        } catch (_: Exception) {}
    }

    private fun stopAlarm() {
        try { mediaPlayer?.stop(); mediaPlayer?.release() } catch (_: Exception) {}
        mediaPlayer = null
    }

    private fun triggerVibration(durationSeconds: Int) {
        try {
            val settings = NativeConfigManager.readSettings(this)
            if (settings?.vibrationEnabled != true) return

            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(VIBRATOR_SERVICE) as Vibrator
            }
            if (!vibrator.hasVibrator()) return

            val pattern = longArrayOf(0, 600, 100, 600, 100, 600)
            val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, amplitudes, 0))
            } else {
                @Suppress("DEPRECATION") vibrator.vibrate(pattern, 0)
            }
            handler.postDelayed({ vibrator.cancel() }, durationSeconds * 1000L)
        } catch (_: Exception) {}
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ═══════════════════════════════════════════════════════════════════════

    private fun showAlert(names: List<String>, type: String) {
        try {
            val emoji = if (type == "DOWN") "🔴" else "⚠️"
            val t = "$emoji $type: ${names.first()}"
            val b = if (names.size > 1) "Dan ${names.size - 1} sensor lainnya" else "$type terdeteksi"

            val pi = PendingIntent.getActivity(this, 1,
                packageManager.getLaunchIntentForPackage(packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

            val n = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
                .setContentTitle(t).setContentText(b)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true).setContentIntent(pi)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setStyle(NotificationCompat.BigTextStyle().bigText(b))
                .build()

            getSystemService(NotificationManager::class.java).notify(ALERT_NOTIFICATION_ID + names.hashCode() % 100, n)
        } catch (_: Exception) {}
    }

    private fun updateNotification(title: String, body: String) {
        val n = buildNotification(title, body)
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, n)
    }

    private fun buildNotification(title: String, body: String): Notification {
        val pi = PendingIntent.getActivity(this, 0,
            packageManager.getLaunchIntentForPackage(packageName),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title).setContentText(body)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true).setAutoCancel(false)
            .setContentIntent(pi)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .build()
    }

    private fun startNotifChecker() {
        if (notifCheckerRunnable != null) return
        notifCheckerRunnable = object : Runnable {
            override fun run() {
                try {
                    val mgr = getSystemService(NotificationManager::class.java)
                    if (mgr.activeNotifications.none { it.id == NOTIFICATION_ID }) {
                        mgr.notify(NOTIFICATION_ID, buildNotification("PRTG Monitor aktif", "Monitoring berjalan"))
                    }
                } catch (_: Exception) {}
                handler.postDelayed(this, 5000)
            }
        }
        handler.postDelayed(notifCheckerRunnable!!, 5000)
    }

    private fun stopNotifChecker() {
        notifCheckerRunnable?.let { handler.removeCallbacks(it) }
        notifCheckerRunnable = null
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val mgr = getSystemService(NotificationManager::class.java)
            mgr.createNotificationChannel(NotificationChannel(CHANNEL_ID, "PRTG Monitor", NotificationManager.IMPORTANCE_LOW).apply {
                setShowBadge(false); setSound(null, null)
            })
            mgr.createNotificationChannel(NotificationChannel(ALERT_CHANNEL_ID, "PRTG Alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                enableVibration(true)
            })
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // UTILITIES
    // ═══════════════════════════════════════════════════════════════════════

    private fun extractHost(baseUrl: String): String? {
        return try {
            val u = URL(baseUrl)
            "${u.protocol}://${u.host}${if (u.port > 0 && u.port != 80 && u.port != 443) ":${u.port}" else ""}"
        } catch (_: Exception) { null }
    }

    private fun scheduleRestart() {
        try {
            val pi = PendingIntent.getService(this, 0,
                Intent(this, MonitoringForegroundService::class.java),
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE)
            (getSystemService(ALARM_SERVICE) as AlarmManager)
                .setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, System.currentTimeMillis() + 5000, pi)
        } catch (_: Exception) {}
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "prtg:poll")
        wakeLock?.acquire(24 * 60 * 60 * 1000L)
    }

    private fun releaseWakeLock() {
        try { if (wakeLock?.isHeld == true) wakeLock?.release() } catch (_: Exception) {}
        wakeLock = null
    }
}
