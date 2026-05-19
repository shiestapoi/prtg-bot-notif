import 'dart:io';
import 'package:flutter/material.dart';
import 'package:permission_handler/permission_handler.dart';

/// Service for requesting runtime permissions
class PermissionService {
  /// Request all necessary permissions on app startup
  static Future<void> requestAll(BuildContext context) async {
    // Notification permission (Android 13+)
    if (Platform.isAndroid) {
      final notifStatus = await Permission.notification.status;
      if (!notifStatus.isGranted) {
        await Permission.notification.request();
      }
    }
  }

  /// Check if notification permission is granted
  static Future<bool> isNotificationGranted() async {
    if (!Platform.isAndroid) return true;
    return await Permission.notification.isGranted;
  }

  /// Open app settings if permission permanently denied
  static Future<void> openSettings() async {
    await openAppSettings();
  }
}
