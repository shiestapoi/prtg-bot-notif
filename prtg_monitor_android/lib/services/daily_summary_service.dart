import 'dart:async';
import 'dart:convert';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Service that tracks daily stats and shows a summary notification.
class DailySummaryService {
  static const _statsKey = 'daily_summary_stats';
  static const _lastSummaryKey = 'daily_summary_last_shown';
  static const _channelId = 'prtg_daily_summary_channel';
  static const _channelName = 'Daily Summary';
  static const _notificationId = 5000;

  static Timer? _checkTimer;
  static FlutterLocalNotificationsPlugin? _plugin;

  /// Initialize with notification plugin and start periodic check.
  static Future<void> initialize(FlutterLocalNotificationsPlugin plugin) async {
    _plugin = plugin;

    // Create notification channel
    final androidPlugin = plugin.resolvePlatformSpecificImplementation<
        AndroidFlutterLocalNotificationsPlugin>();
    if (androidPlugin != null) {
      await androidPlugin.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: 'Daily monitoring summary notification',
          importance: Importance.defaultImportance,
          playSound: true,
        ),
      );
    }

    // Check every minute if it's time to show summary
    _checkTimer?.cancel();
    _checkTimer = Timer.periodic(const Duration(minutes: 1), (_) {
      _checkAndShowSummary();
    });
  }

  /// Record a DOWN event for a sensor.
  static Future<void> recordDownEvent(int configId, String title) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stats = await _loadStats(prefs);
      final today = _todayKey();

      if (!stats.containsKey(today)) {
        stats[today] = {};
      }

      final dayStats = stats[today] as Map<String, dynamic>;
      final configKey = configId.toString();

      if (!dayStats.containsKey(configKey)) {
        dayStats[configKey] = {
          'title': title,
          'downEvents': 0,
          'totalDownSeconds': 0,
          'lastDownAt': null,
        };
      }

      final sensorStats = dayStats[configKey] as Map<String, dynamic>;
      sensorStats['downEvents'] = (sensorStats['downEvents'] as int) + 1;
      sensorStats['lastDownAt'] = DateTime.now().toIso8601String();

      stats[today] = dayStats;
      await _saveStats(prefs, stats);
    } catch (e) {
      // Ignore errors in stats tracking
    }
  }

  /// Record recovery (to calculate downtime duration).
  static Future<void> recordRecovery(int configId) async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final stats = await _loadStats(prefs);
      final today = _todayKey();

      if (!stats.containsKey(today)) return;
      final dayStats = stats[today] as Map<String, dynamic>;
      final configKey = configId.toString();

      if (!dayStats.containsKey(configKey)) return;
      final sensorStats = dayStats[configKey] as Map<String, dynamic>;

      final lastDownStr = sensorStats['lastDownAt'] as String?;
      if (lastDownStr != null) {
        final lastDown = DateTime.tryParse(lastDownStr);
        if (lastDown != null) {
          final downDuration = DateTime.now().difference(lastDown).inSeconds;
          sensorStats['totalDownSeconds'] =
              (sensorStats['totalDownSeconds'] as int) + downDuration;
        }
        sensorStats['lastDownAt'] = null;
      }

      stats[today] = dayStats;
      await _saveStats(prefs, stats);
    } catch (e) {
      // Ignore
    }
  }

  /// Check if it's time to show the daily summary.
  static Future<void> _checkAndShowSummary() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final enabled = prefs.getBool('daily_summary_enabled') ?? false;
      if (!enabled) return;

      final hour = prefs.getInt('daily_summary_hour') ?? 8;
      final minute = prefs.getInt('daily_summary_minute') ?? 0;

      final now = DateTime.now();
      if (now.hour != hour || now.minute != minute) return;

      // Check if already shown today
      final lastShown = prefs.getString(_lastSummaryKey);
      final todayStr = _todayKey();
      if (lastShown == todayStr) return;

      // Show summary for yesterday
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      final yesterdayKey =
          '${yesterday.year}-${yesterday.month.toString().padLeft(2, '0')}-${yesterday.day.toString().padLeft(2, '0')}';

      final stats = await _loadStats(prefs);
      final dayStats = stats[yesterdayKey] as Map<String, dynamic>?;

      await _showSummaryNotification(dayStats);
      await prefs.setString(_lastSummaryKey, todayStr);

      // Clean up old stats (keep only last 7 days)
      _cleanupOldStats(stats);
      await _saveStats(prefs, stats);
    } catch (e) {
      // Ignore
    }
  }

  /// Show the summary notification.
  static Future<void> _showSummaryNotification(
      Map<String, dynamic>? dayStats) async {
    if (_plugin == null) return;

    String title;
    String body;

    if (dayStats == null || dayStats.isEmpty) {
      title = '📊 Daily Summary';
      body = 'Tidak ada DOWN event kemarin. Semua link stabil! ✅';
    } else {
      int totalDownEvents = 0;
      int totalDownSeconds = 0;
      final sensorSummaries = <String>[];

      for (final entry in dayStats.entries) {
        final sensorData = entry.value as Map<String, dynamic>;
        final events = sensorData['downEvents'] as int? ?? 0;
        final seconds = sensorData['totalDownSeconds'] as int? ?? 0;
        final sensorTitle = sensorData['title'] as String? ?? 'Unknown';

        totalDownEvents += events;
        totalDownSeconds += seconds;

        if (events > 0) {
          final duration = _formatDuration(seconds);
          sensorSummaries.add('• $sensorTitle: $events events ($duration)');
        }
      }

      title =
          '📊 Daily Summary: $totalDownEvents DOWN events';
      final totalDuration = _formatDuration(totalDownSeconds);
      body =
          'Total downtime: $totalDuration\n${sensorSummaries.take(5).join('\n')}';
      if (sensorSummaries.length > 5) {
        body += '\n... dan ${sensorSummaries.length - 5} sensor lainnya';
      }
    }

    final androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: 'Daily monitoring summary',
      importance: Importance.defaultImportance,
      priority: Priority.defaultPriority,
      styleInformation: BigTextStyleInformation(body, contentTitle: title),
    );

    await _plugin!.show(
      _notificationId,
      title,
      body,
      NotificationDetails(android: androidDetails),
    );
  }

  static String _formatDuration(int seconds) {
    if (seconds < 60) return '${seconds}s';
    if (seconds < 3600) return '${(seconds / 60).round()}m';
    final hours = seconds ~/ 3600;
    final mins = (seconds % 3600) ~/ 60;
    return '${hours}h ${mins}m';
  }

  static String _todayKey() {
    final now = DateTime.now();
    return '${now.year}-${now.month.toString().padLeft(2, '0')}-${now.day.toString().padLeft(2, '0')}';
  }

  static Future<Map<String, dynamic>> _loadStats(
      SharedPreferences prefs) async {
    final jsonStr = prefs.getString(_statsKey);
    if (jsonStr == null || jsonStr.isEmpty) return {};
    try {
      return jsonDecode(jsonStr) as Map<String, dynamic>;
    } catch (e) {
      return {};
    }
  }

  static Future<void> _saveStats(
      SharedPreferences prefs, Map<String, dynamic> stats) async {
    await prefs.setString(_statsKey, jsonEncode(stats));
  }

  static void _cleanupOldStats(Map<String, dynamic> stats) {
    final cutoff = DateTime.now().subtract(const Duration(days: 7));
    final cutoffKey =
        '${cutoff.year}-${cutoff.month.toString().padLeft(2, '0')}-${cutoff.day.toString().padLeft(2, '0')}';
    stats.removeWhere((key, _) => key.compareTo(cutoffKey) < 0);
  }

  /// Dispose timer.
  static void dispose() {
    _checkTimer?.cancel();
    _checkTimer = null;
  }
}
