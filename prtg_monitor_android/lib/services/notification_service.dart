import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../models/monitoring_config.dart';

/// Notification service for pinned/ongoing notifications and alert notifications.
class NotificationService {
  static const int _pinnedNotificationId = 999; // Same as foreground service notification ID
  static const int _alertNotificationId = 2000;
  static const String _channelId = 'prtg_foreground_channel'; // Same as native foreground service channel
  static const String _channelName = 'PRTG Monitor Service';
  static const String _alertChannelId = 'prtg_alert_channel';
  static const String _alertChannelName = 'PRTG Alerts';

  static FlutterLocalNotificationsPlugin? _plugin;

  /// Initialize the notification plugin
  static Future<void> initialize(
      FlutterLocalNotificationsPlugin plugin) async {
    _plugin = plugin;

    const androidSettings =
        AndroidInitializationSettings('@mipmap/ic_launcher');
    const initSettings = InitializationSettings(android: androidSettings);

    await plugin.initialize(initSettings);

    // Create notification channels
    final androidPlugin =
        plugin.resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>();

    if (androidPlugin != null) {
      // Ongoing/pinned channel (same as native foreground service — low importance, no sound)
      await androidPlugin.createNotificationChannel(
        const AndroidNotificationChannel(
          _channelId,
          _channelName,
          description: 'Persistent notification for background monitoring',
          importance: Importance.low,
          playSound: false,
          enableVibration: false,
        ),
      );

      // Alert channel (high priority with sound)
      await androidPlugin.createNotificationChannel(
        const AndroidNotificationChannel(
          _alertChannelId,
          _alertChannelName,
          description: 'Alert notifications for DOWN/LOW TRAFFIC',
          importance: Importance.high,
          playSound: true,
          enableVibration: true,
        ),
      );
    }
  }

  /// Show/update the pinned (ongoing) notification with current status.
  /// Shows DOWN items first, then LOW TRAFFIC, with group names.
  static Future<void> showPinnedNotification({
    required int downCount,
    required int warningCount,
    required int normalCount,
    required List<MonitoringStatusItem> allItems,
  }) async {
    if (_plugin == null) return;

    String title;
    String body;

    // Sort: DOWN first, then LOW_TRAFFIC/NO_TRAFFIC, then warnings
    final problemItems = allItems
        .where((i) => i.status != NocStatus.normal)
        .toList()
      ..sort((a, b) => a.status.priority.compareTo(b.status.priority));

    if (downCount > 0) {
      title = '🔴 $downCount DOWN | ⚠️ $warningCount Warning | ✅ $normalCount OK';

      // Build detailed body: DOWN items first, then LOW TRAFFIC
      final lines = <String>[];
      final downItems = problemItems.where((i) => i.status == NocStatus.down || i.status == NocStatus.noTraffic);
      final lowItems = problemItems.where((i) => i.status == NocStatus.lowTraffic);

      for (final item in downItems) {
        lines.add('🔴 ${item.title} — ${item.groupName}');
      }
      for (final item in lowItems.take(5)) {
        lines.add('⚠️ ${item.title} — ${item.groupName}');
      }

      body = lines.join('\n');
    } else if (warningCount > 0) {
      title = '⚠️ $warningCount Warning | ✅ $normalCount OK';

      final lines = <String>[];
      for (final item in problemItems.take(8)) {
        final emoji = item.status == NocStatus.lowTraffic ? '⚠️' : '🟡';
        lines.add('$emoji ${item.title} — ${item.groupName}');
      }

      body = lines.join('\n');
    } else {
      title = '✅ All $normalCount links NORMAL';
      body = 'PRTG Monitor aktif — semua link dalam kondisi normal';
    }

    final androidDetails = AndroidNotificationDetails(
      _channelId,
      _channelName,
      channelDescription: 'Ongoing monitoring status',
      importance: Importance.low,
      priority: Priority.low,
      ongoing: true,
      autoCancel: false,
      showWhen: true,
      category: AndroidNotificationCategory.service,
      visibility: NotificationVisibility.public,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
        summaryText: 'PRTG Monitor',
      ),
    );

    await _plugin!.show(
      _pinnedNotificationId,
      title,
      body,
      NotificationDetails(android: androidDetails),
    );
  }

  /// Show alert notification when a link goes DOWN or LOW TRAFFIC
  static Future<void> showAlertNotification({
    required MonitoringStatusItem item,
    required NocStatus previousStatus,
  }) async {
    if (_plugin == null) return;

    final emoji = item.status == NocStatus.down
        ? '🔴'
        : item.status == NocStatus.noTraffic
            ? '🔴'
            : '⚠️';
    final title = '$emoji ${item.status.label}: ${item.title}';
    final body = '📍 Group: ${item.groupName}\n'
        '📊 Status: ${previousStatus.label} → ${item.status.label}\n'
        '🆔 Sensor ID: ${item.sensorId}';

    final androidDetails = AndroidNotificationDetails(
      _alertChannelId,
      _alertChannelName,
      channelDescription: 'Alert for status change',
      importance: Importance.high,
      priority: Priority.high,
      category: AndroidNotificationCategory.alarm,
      visibility: NotificationVisibility.public,
      styleInformation: BigTextStyleInformation(
        body,
        contentTitle: title,
      ),
    );

    await _plugin!.show(
      _alertNotificationId + item.configId,
      title,
      body,
      NotificationDetails(android: androidDetails),
    );
  }

  /// Cancel the pinned notification
  static Future<void> cancelPinnedNotification() async {
    await _plugin?.cancel(_pinnedNotificationId);
  }

  /// Cancel all notifications
  static Future<void> cancelAll() async {
    await _plugin?.cancelAll();
  }
}
