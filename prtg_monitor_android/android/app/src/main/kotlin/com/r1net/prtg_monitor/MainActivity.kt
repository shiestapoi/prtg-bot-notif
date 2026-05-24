package com.r1net.prtg_monitor

import android.content.Intent
import io.flutter.embedding.android.FlutterFragmentActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterFragmentActivity() {
    private val CHANNEL = "com.r1net.prtg_monitor/foreground_service"

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, CHANNEL).setMethodCallHandler { call, result ->
            when (call.method) {
                "startService" -> {
                    MonitoringForegroundService.start(this)
                    result.success(true)
                }
                "stopService" -> {
                    MonitoringForegroundService.stop(this)
                    result.success(true)
                }
                "flutterAlive" -> {
                    val intent = Intent(this, MonitoringForegroundService::class.java)
                    intent.action = MonitoringForegroundService.ACTION_FLUTTER_ALIVE
                    startService(intent)
                    result.success(true)
                }
                "writeNativeConfig" -> {
                    val json = call.argument<String>("json") ?: ""
                    NativeConfigManager.writeConfig(this, json)
                    result.success(true)
                }
                else -> result.notImplemented()
            }
        }
    }
}
