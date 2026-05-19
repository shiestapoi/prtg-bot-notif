package com.r1net.prtg_monitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

/**
 * Foreground service that performs PRTG polling independently of Flutter.
 * When the Flutter engine is alive, Flutter handles polling.
 * When the app is killed (swipe away), this service continues polling natively.
 */
class MonitoringForegroundService : Service() {

    companion object {
        const val CHANNEL_ID = "prtg_foreground_channel"
        const val ALERT_CHANNEL_ID = "prtg_alert_channel"
        const val NOTIFICATION_ID = 999
        const val ALERT_NOTIFICATION_BASE_ID = 2000

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
            context.stopService(intent)
        }
    }

    private val executor = Executors.newSingleThreadExecutor()
    private val handler = Handler(Looper.getMainLooper())
    private var pollingRunnable: Runnable? = null
    private var notificationChecker: Runnable? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var isFlutterAlive = true

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        acquireWakeLock()
        startNotificationChecker()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val action = intent?.action
        if (action == "FLUTTER_ALIVE") {
            isFlutterAlive = true
            stopNativePolling()
            return START_STICKY
        }
        if (action == "FLUTTER_DEAD") {
            isFlutterAlive = false
            startNativePolling()
            return START_STICKY
        }
        if (action == "STOP") {
            stopForeground(STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }

        val notification = buildNotification("PRTG Monitor aktif", "Monitoring berjalan di latar belakang")

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }

        return START_STICKY
    }

    override fun onTaskRemoved(rootIntent: Intent?) {
        // App was swiped away — schedule restart via AlarmManager (works on MIUI/Samsung/Oppo)
        isFlutterAlive = false
        scheduleRestart()
        startNativePolling()
        super.onTaskRemoved(rootIntent)
    }

    override fun onDestroy() {
        stopNativePolling()
        notificationChecker?.let { handler.removeCallbacks(it) }
        notificationChecker = null
        releaseWakeLock()
        // Schedule restart even on destroy
        scheduleRestart()
        executor.shutdownNow()
        super.onDestroy()
    }

    /// Schedule service restart via AlarmManager (reliable on all OEMs)
    private fun scheduleRestart() {
        try {
            val restartIntent = Intent(applicationContext, MonitoringForegroundService::class.java)
            val pendingIntent = PendingIntent.getService(
                applicationContext, 0, restartIntent,
                PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_IMMUTABLE
            )
            val alarmManager = getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
            alarmManager.setExactAndAllowWhileIdle(
                android.app.AlarmManager.RTC_WAKEUP,
                System.currentTimeMillis() + 5000, // Restart in 5 seconds
                pendingIntent
            )
        } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // ─── Native Polling ────────────────────────────────────────────────────

    private fun startNativePolling() {
        if (pollingRunnable != null) return // Already polling

        val prefs = getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
        val interval = (prefs.getLong("flutter.polling_interval", 60L) * 1000L)

        pollingRunnable = object : Runnable {
            override fun run() {
                if (!isFlutterAlive) {
                    executor.execute { pollAllSensors() }
                    handler.postDelayed(this, interval)
                }
            }
        }

        // Start immediately
        handler.post(pollingRunnable!!)
    }

    private fun stopNativePolling() {
        pollingRunnable?.let { handler.removeCallbacks(it) }
        pollingRunnable = null
    }

    /// Re-post notification every 3 seconds if it was dismissed by user (Android 14+)
    private fun startNotificationChecker() {
        notificationChecker = object : Runnable {
            override fun run() {
                try {
                    val manager = getSystemService(NotificationManager::class.java)
                    val activeNotifs = manager.activeNotifications
                    val hasOurNotif = activeNotifs.any { it.id == NOTIFICATION_ID }

                    if (!hasOurNotif) {
                        // Notification was dismissed — re-post it
                        val notification = buildNotification(
                            "PRTG Monitor aktif",
                            "Monitoring berjalan di latar belakang"
                        )
                        manager.notify(NOTIFICATION_ID, notification)
                    }
                } catch (_: Exception) {}

                handler.postDelayed(this, 3000) // Check every 3 seconds
            }
        }
        handler.postDelayed(notificationChecker!!, 3000)
    }

    // Track previous DOWN state to detect new DOWN events
    private val previousDownSensors = mutableSetOf<Int>()

    private fun pollAllSensors() {
        try {
            val prefs = getSharedPreferences("FlutterSharedPreferences", Context.MODE_PRIVATE)
            val baseUrl = prefs.getString("flutter.prtg_base_url", "") ?: return
            val username = prefs.getString("flutter.prtg_username", "") ?: return
            val passhash = prefs.getString("flutter.prtg_passhash", "1218899642") ?: return

            if (baseUrl.isEmpty() || username.isEmpty() || passhash.isEmpty()) return

            val configsJson = prefs.getString("flutter.monitoring_configs", null) ?: return
            val configs = org.json.JSONArray(configsJson)

            val alarmOnDown = prefs.getBoolean("flutter.alarm_on_down", true)
            val alarmEnabled = prefs.getBoolean("flutter.alarm_enabled", true)
            val alarmDuration = prefs.getLong("flutter.alarm_duration", 5L).toInt()

            var downCount = 0
            var normalCount = 0
            val downNames = mutableListOf<String>()
            val currentDownSensors = mutableSetOf<Int>()
            val newDownSensors = mutableListOf<String>()

            for (i in 0 until configs.length()) {
                val config = configs.getJSONObject(i)
                if (!config.optBoolean("enabled", true)) continue
                if (!config.optBoolean("monitoringEnabled", true)) continue
                if (config.optBoolean("maintenance", false)) continue

                val sensorId = config.getInt("sensorId")
                val title = config.getString("title")
                val thresholdDown = config.optDouble("thresholdDown", 1.0)

                val bitrate = fetchSensorBitrate(baseUrl, username, passhash, sensorId)

                if (bitrate != null && bitrate <= thresholdDown * 1_000_000) {
                    downCount++
                    downNames.add(title)
                    currentDownSensors.add(sensorId)

                    // Check if this is a NEW down (wasn't down before)
                    if (!previousDownSensors.contains(sensorId)) {
                        newDownSensors.add(title)
                    }
                } else if (bitrate != null) {
                    normalCount++
                } else {
                    normalCount++
                }
            }

            // Update tracked state
            previousDownSensors.clear()
            previousDownSensors.addAll(currentDownSensors)

            // Update pinned notification
            val title = if (downCount > 0) {
                "🔴 $downCount DOWN | ✅ $normalCount OK"
            } else {
                "✅ All $normalCount links NORMAL"
            }
            val body = if (downCount > 0) {
                "DOWN: ${downNames.take(3).joinToString(", ")}"
            } else {
                "Semua link dalam kondisi normal"
            }
            updateNotification(title, body)

            // Trigger alarm + vibration + alert notification for NEW down events
            if (newDownSensors.isNotEmpty() && alarmEnabled && alarmOnDown) {
                playAlarmSound(alarmDuration)
                triggerVibration(alarmDuration)
                showAlertNotification(newDownSensors)
            }

        } catch (e: Exception) {
            // Silent fail — will retry next interval
        }
    }

    // ─── Alarm Sound (Notification stream) ─────────────────────────────────

    private var mediaPlayer: android.media.MediaPlayer? = null
    private val alarmHandler = Handler(Looper.getMainLooper())

    private fun playAlarmSound(durationSeconds: Int) {
        try {
            stopAlarmSound()

            // Play using notification stream (not media)
            mediaPlayer = android.media.MediaPlayer().apply {
                // Use alarm3.wav from assets
                val afd = assets.openFd("flutter_assets/assets/sounds/alarm3.wav")
                setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
                afd.close()

                setAudioAttributes(
                    android.media.AudioAttributes.Builder()
                        .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION_EVENT)
                        .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                setVolume(0.8f, 0.8f)
                isLooping = true
                prepare()
                start()
            }

            // Auto-stop after duration
            alarmHandler.postDelayed({
                stopAlarmSound()
            }, durationSeconds * 1000L)

        } catch (e: Exception) {
            // Silent fail
        }
    }

    private fun stopAlarmSound() {
        try {
            mediaPlayer?.stop()
            mediaPlayer?.release()
            mediaPlayer = null
        } catch (_: Exception) {}
    }

    // ─── Vibration ─────────────────────────────────────────────────────────

    private fun triggerVibration(durationSeconds: Int) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as android.os.VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
            }

            if (!vibrator.hasVibrator()) return

            // Emergency pattern: 600ms on, 100ms off, repeat for duration
            val pattern = longArrayOf(0, 600, 100, 600, 100, 600)
            val amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = android.os.VibrationEffect.createWaveform(pattern, amplitudes, 0) // 0 = repeat
                vibrator.vibrate(effect)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, 0) // 0 = repeat
            }

            // Stop vibration after duration
            alarmHandler.postDelayed({
                vibrator.cancel()
            }, durationSeconds * 1000L)

        } catch (_: Exception) {}
    }

    // ─── Alert Notification ────────────────────────────────────────────────

    private fun showAlertNotification(sensorNames: List<String>) {
        try {
            val manager = getSystemService(NotificationManager::class.java)
            val title = "🔴 DOWN: ${sensorNames.first()}"
            val body = if (sensorNames.size > 1) {
                "Dan ${sensorNames.size - 1} sensor lainnya: ${sensorNames.drop(1).take(2).joinToString(", ")}"
            } else {
                "Sensor DOWN terdeteksi saat app di background"
            }

            val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            val pendingIntent = PendingIntent.getActivity(
                this, 1, launchIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val notification = NotificationCompat.Builder(this, ALERT_CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(body)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_ALARM)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .build()

            manager.notify(ALERT_NOTIFICATION_BASE_ID, notification)
        } catch (_: Exception) {}
    }

    private fun fetchSensorBitrate(baseUrl: String, username: String, passhash: String, sensorId: Int): Double? {
        try {
            val uri = URL(baseUrl)
            val host = "${uri.protocol}://${uri.host}${if (uri.port > 0 && uri.port != 80 && uri.port != 443) ":${uri.port}" else ""}"

            val now = Date()
            val fiveMinAgo = Date(now.time - 5 * 60 * 1000)
            val fmt = SimpleDateFormat("yyyy-MM-dd-HH-mm-ss", Locale.US)

            val url = "$host/api/historicdata.json" +
                "?id=$sensorId" +
                "&avg=0" +
                "&sdate=${fmt.format(fiveMinAgo)}" +
                "&edate=${fmt.format(now)}" +
                "&usecaption=1" +
                "&username=${URLEncoder.encode(username, "UTF-8")}" +
                "&passhash=${URLEncoder.encode(passhash, "UTF-8")}"

            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 15000
            conn.readTimeout = 15000
            conn.requestMethod = "GET"

            if (conn.responseCode != 200) return null

            val response = conn.inputStream.bufferedReader().readText()
            conn.disconnect()

            // Parse JSON — find "Traffic Total (speed)" in last entry
            val json = JSONObject(response)
            val histdata = json.optJSONArray("histdata") ?: return null
            if (histdata.length() == 0) return null

            val lastEntry = histdata.getJSONObject(histdata.length() - 1)

            // Look for traffic total speed key
            val keys = lastEntry.keys()
            while (keys.hasNext()) {
                val key = keys.next()
                if (key.lowercase().contains("traffic") && key.lowercase().contains("total") &&
                    (key.lowercase().contains("speed") || key.lowercase().contains("bit"))) {
                    val value = lastEntry.optDouble(key, -1.0)
                    if (value >= 0) {
                        // PRTG returns Bytes/s — convert to bits/s
                        return value * 8
                    }
                }
            }

            return null
        } catch (e: Exception) {
            return null
        }
    }

    // ─── Notification ──────────────────────────────────────────────────────

    private fun updateNotification(title: String, content: String) {
        val notification = buildNotification(title, content)
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(NOTIFICATION_ID, notification)
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val serviceChannel = NotificationChannel(
                CHANNEL_ID,
                "PRTG Monitor Service",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Persistent notification for background monitoring"
                setShowBadge(false)
                setSound(null, null)
            }
            manager.createNotificationChannel(serviceChannel)

            val alertChannel = NotificationChannel(
                ALERT_CHANNEL_ID,
                "PRTG Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Alert notifications for DOWN sensors"
                enableVibration(true)
            }
            manager.createNotificationChannel(alertChannel)
        }
    }

    private fun buildNotification(title: String, content: String): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle(title)
            .setContentText(content)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setOngoing(true)
            .setAutoCancel(false)
            .setContentIntent(pendingIntent)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setStyle(NotificationCompat.BigTextStyle().bigText(content))
            .build()
    }

    // ─── Wake Lock ─────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "prtg_monitor:polling")
        wakeLock?.acquire(24 * 60 * 60 * 1000L) // 24 hours max
    }

    private fun releaseWakeLock() {
        wakeLock?.let {
            if (it.isHeld) it.release()
        }
        wakeLock = null
    }
}
