import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/config_storage_service.dart';

/// Helper to manage the native Android foreground service.
/// The native service handles polling when app is killed via AlarmManager restart.
class BackgroundServiceHelper {
  static const _channel = MethodChannel('com.r1net.prtg_monitor/foreground_service');

  /// Initialize (no-op, service starts on demand)
  static Future<void> initialize() async {}

  /// Start the foreground service
  static Future<void> startService() async {
    try {
      await _channel.invokeMethod('startService');
      await _channel.invokeMethod('flutterAlive');
      await syncConfigs();
    } catch (_) {}
  }

  /// Stop the foreground service
  static Future<void> stopService() async {
    try {
      await _channel.invokeMethod('stopService');
    } catch (_) {}
  }

  /// Notify native service that Flutter is alive
  static Future<void> notifyFlutterAlive() async {
    try {
      await _channel.invokeMethod('flutterAlive');
    } catch (_) {}
  }

  /// Sync configs to SharedPreferences for native service
  static Future<void> syncConfigs() async {
    try {
      final configs = await ConfigStorageService.loadConfigs();
      final prefs = await SharedPreferences.getInstance();
      final jsonStr = jsonEncode(configs.map((c) => c.toJson()).toList());
      await prefs.setString('monitoring_configs', jsonStr);
    } catch (_) {}
  }
}
