import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/config_storage_service.dart';
import '../services/alarm_service.dart';

/// Helper to manage the native Android foreground service.
/// Writes a JSON config file that the native Kotlin service reads directly.
class BackgroundServiceHelper {
  static const _channel = MethodChannel('com.r1net.prtg_monitor/foreground_service');

  /// Initialize (no-op)
  static Future<void> initialize() async {}

  /// Start the foreground service and sync config
  static Future<void> startService() async {
    try {
      await syncNativeConfig();
      await _channel.invokeMethod('startService');
      await _channel.invokeMethod('flutterAlive');
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

  /// Sync all config to native JSON file.
  /// Call this after any settings or config change.
  static Future<void> syncNativeConfig() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final configs = await ConfigStorageService.loadConfigs();
      final alarmService = AlarmService();

      final json = jsonEncode({
        'settings': {
          'baseUrl': prefs.getString('prtg_base_url') ?? '',
          'username': prefs.getString('prtg_username') ?? '',
          'passhash': prefs.getString('prtg_passhash') ?? '',
          'pollingInterval': prefs.getInt('polling_interval') ?? 60,
          'alarmEnabled': prefs.getBool('alarm_enabled') ?? true,
          'alarmOnDown': prefs.getBool('alarm_on_down') ?? true,
          'alarmOnLowTraffic': prefs.getBool('alarm_on_low_traffic') ?? false,
          'alarmDuration': alarmService.alarmDuration,
          'vibrationEnabled': alarmService.vibrationEnabled,
          'selectedAlarmId': alarmService.selectedAlarmId,
        },
        'configs': configs.map((c) => c.toJson()).toList(),
        'customAlarms': alarmService.allAlarms
            .where((a) => a.isCustom)
            .map((a) => a.toJson())
            .toList(),
      });

      await _channel.invokeMethod('writeNativeConfig', {'json': json});
    } catch (_) {}
  }

  /// Alias for backward compatibility
  static Future<void> syncConfigs() async => syncNativeConfig();
}
