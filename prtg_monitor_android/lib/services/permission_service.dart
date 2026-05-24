import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:permission_handler/permission_handler.dart';

/// Service for requesting runtime permissions
class PermissionService {
  static const _channel = MethodChannel('com.r1net.prtg_monitor/foreground_service');

  /// Request all necessary permissions on app startup
  static Future<void> requestAll(BuildContext context) async {
    if (!Platform.isAndroid) return;

    // 1. Notification permission (Android 13+)
    final notifStatus = await Permission.notification.status;
    if (!notifStatus.isGranted) {
      await Permission.notification.request();
    }

    // 2. Request ignore battery optimizations (critical for background service)
    final batteryStatus = await Permission.ignoreBatteryOptimizations.status;
    if (!batteryStatus.isGranted) {
      await Permission.ignoreBatteryOptimizations.request();
    }

    // 3. Schedule exact alarm permission (Android 12+)
    final alarmStatus = await Permission.scheduleExactAlarm.status;
    if (!alarmStatus.isGranted) {
      await Permission.scheduleExactAlarm.request();
    }
  }

  /// Check if notification permission is granted
  static Future<bool> isNotificationGranted() async {
    if (!Platform.isAndroid) return true;
    return await Permission.notification.isGranted;
  }

  /// Check if battery optimization is disabled (app is whitelisted)
  static Future<bool> isBatteryOptimizationDisabled() async {
    if (!Platform.isAndroid) return true;
    return await Permission.ignoreBatteryOptimizations.isGranted;
  }

  /// Open app settings if permission permanently denied
  static Future<void> openSettings() async {
    await openAppSettings();
  }
}
