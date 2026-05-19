import 'dart:async';
import 'package:flutter/foundation.dart';

import '../models/monitoring_config.dart';
import '../services/config_storage_service.dart';
import '../services/history_storage_service.dart';
import '../services/prtg_api_service.dart';
import '../services/notification_service.dart';
import '../services/alarm_service.dart';
import '../services/daily_summary_service.dart';
import 'settings_provider.dart';

/// Provider for monitoring state and polling logic (foreground)
class MonitoringProvider extends ChangeNotifier {
  List<MonitoringStatusItem> _items = [];
  List<MonitoringConfig> _configs = [];
  List<MonitoringGroup> _groups = [];
  bool _isPolling = false;
  bool _isConnected = false;
  DateTime? _lastPollTime;
  Timer? _pollTimer;
  PrtgApiService? _apiService;
  SettingsProvider? _settings;

  // Track previous statuses for change detection
  final Map<int, NocStatus> _previousStatuses = {};
  // Track consecutive errors
  final Map<int, int> _consecutiveErrors = {};
  // Track rolling average bitrate per config (for % drop detection)
  final Map<int, double> _rollingAverages = {};
  // Track last alarm time per config (for escalation)
  final Map<int, DateTime> _lastAlarmTime = {};
  // Track when each config first went DOWN (for escalation)
  final Map<int, DateTime> _downSince = {};

  // Getters
  List<MonitoringStatusItem> get items => _items;
  bool get isPolling => _isPolling;
  bool get isConnected => _isConnected;
  DateTime? get lastPollTime => _lastPollTime;

  int get downCount => _items.where((i) => i.status.isCritical).length;
  int get warningCount => _items.where((i) => i.status.isWarning).length;
  int get normalCount => _items.where((i) => i.status == NocStatus.normal).length;

  /// Seconds until next poll attempt
  int get secondsUntilNextPoll {
    if (_lastPollTime == null || _settings == null) return 0;
    final elapsed = DateTime.now().difference(_lastPollTime!).inSeconds;
    final remaining = (_settings!.pollingInterval) - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  List<MonitoringStatusItem> get sortedItems {
    final sorted = List<MonitoringStatusItem>.from(_items);
    sorted.sort((a, b) {
      // Maintenance items go to the top
      if (a.maintenance && !b.maintenance) return -1;
      if (!a.maintenance && b.maintenance) return 1;

      // Then DOWN/critical items
      if (a.status.isCritical && !b.status.isCritical) return -1;
      if (!a.status.isCritical && b.status.isCritical) return 1;

      // Then by priority
      final pa = a.status.priority;
      final pb = b.status.priority;
      if (pa != pb) return pa.compareTo(pb);
      return a.title.compareTo(b.title);
    });
    return sorted;
  }

  /// Get unique group names (includes MAINTENANCE if any items are in maintenance)
  List<String> get groups {
    final set = _items.map((i) => i.groupName).toSet();
    final hasMaintenance = _items.any((i) => i.maintenance);
    return [
      'ALL',
      if (hasMaintenance) 'MAINTENANCE',
      ...set.toList()..sort(),
    ];
  }

  /// Snooze a config's alarm for a given duration.
  void snoozeConfig(int configId, Duration duration) {
    final idx = _items.indexWhere((i) => i.configId == configId);
    if (idx >= 0) {
      _items[idx] = _items[idx].copyWith(
        snoozedUntil: DateTime.now().add(duration),
      );
      notifyListeners();
    }
  }

  /// Cancel snooze for a config.
  void cancelSnooze(int configId) {
    final idx = _items.indexWhere((i) => i.configId == configId);
    if (idx >= 0) {
      _items[idx] = _items[idx].copyWith(clearSnooze: true);
      notifyListeners();
    }
  }

  /// Start polling with given settings
  Future<void> startPolling(SettingsProvider settings) async {
    if (!settings.isConfigured) return;

    _settings = settings;
    _apiService = PrtgApiService(
      baseUrl: settings.baseUrl,
      username: settings.username,
      passhash: settings.passhash,
    );

    // Load configs from storage (seeds on first run)
    _configs = await ConfigStorageService.loadConfigs();
    _groups = await ConfigStorageService.loadGroups();

    // Initialize items — use last history entry as initial status (not DOWN)
    _items = [];
    for (final c in _configs.where((c) => c.enabled && c.monitoringEnabled)) {
      // Try to get last history entry for this config
      final history = await HistoryStorageService.getHistory(c.id);
      NocStatus initialStatus = NocStatus.loading;
      MonitoringMetric? initialMetric;
      DateTime? initialPolledAt;

      if (history.isNotEmpty) {
        final lastEntry = history.last;
        initialStatus = lastEntry.status;
        initialPolledAt = lastEntry.timestamp;
        if (lastEntry.totalTrafficBitrate != null) {
          initialMetric = MonitoringMetric(
            configId: c.id,
            totalTrafficBitrate: lastEntry.totalTrafficBitrate,
            inboundBitrate: lastEntry.inboundBitrate,
            outboundBitrate: lastEntry.outboundBitrate,
            timestamp: lastEntry.timestamp,
          );
        }
        // Set previous status from history so we don't re-trigger alarm
        _previousStatuses[c.id] = lastEntry.status;
      }

      _items.add(MonitoringStatusItem(
        configId: c.id,
        title: c.title,
        groupName: _getGroupName(c.groupId),
        sensorId: c.sensorId,
        status: initialStatus,
        lastMetric: initialMetric,
        lastPolledAt: initialPolledAt,
        maintenance: c.maintenance,
      ));
    }

    notifyListeners();

    // Show initial pinned notification
    NotificationService.showPinnedNotification(
      downCount: 0,
      warningCount: 0,
      normalCount: _items.length,
      allItems: _items,
    );

    // Start polling
    _isPolling = true;
    _pollAll();

    _pollTimer?.cancel();
    _pollTimer = Timer.periodic(
      Duration(seconds: settings.pollingInterval),
      (_) => _pollAll(),
    );
  }

  /// Get group name by ID from loaded groups
  String _getGroupName(int groupId) {
    final group = _groups.where((g) => g.id == groupId).firstOrNull;
    return group?.name ?? 'Unknown';
  }

  /// Stop polling
  void stopPolling() {
    _isPolling = false;
    _pollTimer?.cancel();
    _pollTimer = null;
    notifyListeners();
  }

  /// Reload configs from storage (call after config changes)
  Future<void> reloadConfigs(SettingsProvider settings) async {
    stopPolling();
    _previousStatuses.clear();
    _consecutiveErrors.clear();
    _rollingAverages.clear();
    _lastAlarmTime.clear();
    _downSince.clear();
    await startPolling(settings);
  }

  /// Poll all configs using parallel batches of 5
  Future<void> _pollAll() async {
    if (_apiService == null) return;

    final activeConfigs = _configs
        .where((c) => c.enabled && c.monitoringEnabled)
        .toList();

    // Process in batches of 5 for parallel polling
    const batchSize = 5;
    for (var i = 0; i < activeConfigs.length; i += batchSize) {
      final batch = activeConfigs.skip(i).take(batchSize).toList();
      await Future.wait(batch.map((config) => _pollSingle(config)));
    }

    _lastPollTime = DateTime.now();

    // Update pinned notification with all items (sorted: DOWN first)
    await NotificationService.showPinnedNotification(
      downCount: downCount,
      warningCount: warningCount,
      normalCount: normalCount,
      allItems: sortedItems,
    );

    notifyListeners();
  }

  /// Poll a single config
  Future<void> _pollSingle(MonitoringConfig config) async {
    try {
      final metric = await _apiService!.fetchMetric(config);
      final status = _classifyStatus(metric, config);
      final prevStatus = _previousStatuses[config.id] ?? NocStatus.normal;

      _previousStatuses[config.id] = status;

      // Update item
      final idx = _items.indexWhere((i) => i.configId == config.id);
      if (idx >= 0) {
        // Track statusSince: reset when status changes
        final currentStatusSince = (status != prevStatus)
            ? DateTime.now()
            : _items[idx].statusSince;

        _items[idx] = _items[idx].copyWith(
          status: status,
          lastMetric: metric,
          lastPolledAt: DateTime.now(),
          previousStatus: prevStatus,
          statusSince: currentStatusSince,
        );
      }

      // Store history entry
      await HistoryStorageService.addEntry(
        config.id,
        HistoryEntry(
          timestamp: DateTime.now(),
          status: status,
          totalTrafficBitrate: metric?.totalTrafficBitrate,
          inboundBitrate: metric?.inboundBitrate,
          outboundBitrate: metric?.outboundBitrate,
        ),
      );

      // Track DOWN since for escalation
      if (status.isCritical) {
        _downSince.putIfAbsent(config.id, () => DateTime.now());
      } else {
        // Recovered — record recovery for daily summary
        if (prevStatus.isCritical) {
          DailySummaryService.recordRecovery(config.id);
        }
        _downSince.remove(config.id);
        _lastAlarmTime.remove(config.id);
      }

      // Check if sensor is snoozed
      final isSnoozed = idx >= 0 && _items[idx].isSnoozed;

      // Play alarm based on settings — skip if maintenance or snoozed
      if (!config.maintenance && !isSnoozed) {
        if (status != prevStatus) {
          final shouldAlarm = (status.isCritical && _settings?.alarmOnDown == true) ||
              (status == NocStatus.lowTraffic && _settings?.alarmOnLowTraffic == true);
          if (shouldAlarm) {
            AlarmService().play();
            _lastAlarmTime[config.id] = DateTime.now();
            // Record DOWN event for daily summary
            if (status.isCritical) {
              DailySummaryService.recordDownEvent(config.id, config.title);
            }
          }
          if (status.isCritical || status == NocStatus.lowTraffic) {
            await NotificationService.showAlertNotification(
              item: _items[idx >= 0 ? idx : 0],
              previousStatus: prevStatus,
            );
          }
        } else {
          // Escalation: re-alarm if still DOWN for longer than escalationMinutes
          _checkEscalation(config, status);
        }
      }

      _isConnected = true;
    } catch (e) {
      final errors = (_consecutiveErrors[config.id] ?? 0) + 1;
      _consecutiveErrors[config.id] = errors;

      final idx = _items.indexWhere((i) => i.configId == config.id);
      if (idx >= 0) {
        final prevStatus = _previousStatuses[config.id];

        // If never successfully polled, keep as loading
        if (prevStatus == null || prevStatus == NocStatus.loading) {
          _items[idx] = _items[idx].copyWith(status: NocStatus.loading);
        } else if (errors >= config.downCount) {
          // Only mark DOWN after enough errors AND previous successful poll
          _previousStatuses[config.id] = NocStatus.down;
          _items[idx] = _items[idx].copyWith(
            status: NocStatus.down,
            lastPolledAt: DateTime.now(),
            previousStatus: prevStatus,
          );

          // Track DOWN since for escalation
          _downSince.putIfAbsent(config.id, () => DateTime.now());

          // Check if sensor is snoozed
          final isSnoozed = _items[idx].isSnoozed;

          // Skip alarm/notification if maintenance or snoozed
          if (prevStatus != NocStatus.down && !config.maintenance && !isSnoozed) {
            if (_settings?.alarmOnDown == true) {
              AlarmService().play();
              _lastAlarmTime[config.id] = DateTime.now();
              DailySummaryService.recordDownEvent(config.id, config.title);
            }
            await NotificationService.showAlertNotification(
              item: _items[idx],
              previousStatus: prevStatus,
            );
          }
        }
      }
    }
  }

  /// Check escalation: re-alarm if sensor has been DOWN longer than escalationMinutes
  void _checkEscalation(MonitoringConfig config, NocStatus status) {
    if (_settings == null || !_settings!.escalationEnabled) return;
    if (!status.isCritical) return;

    final downSince = _downSince[config.id];
    if (downSince == null) return;

    final downDuration = DateTime.now().difference(downSince);
    if (downDuration.inMinutes < _settings!.escalationMinutes) return;

    // Check if alarm was fired recently (within escalationMinutes)
    final lastAlarm = _lastAlarmTime[config.id];
    if (lastAlarm != null) {
      final sinceLastAlarm = DateTime.now().difference(lastAlarm);
      if (sinceLastAlarm.inMinutes < _settings!.escalationMinutes) return;
    }

    // Fire escalation alarm
    if (_settings?.alarmOnDown == true) {
      AlarmService().play();
      _lastAlarmTime[config.id] = DateTime.now();
    }
  }

  /// Classify status based on metric and config thresholds.
  /// - DOWN: traffic <= thresholdDown Mbit/s (default 1.0)
  /// - LOW_TRAFFIC: traffic dropped by thresholdLowTraffic % from rolling average (default 80%)
  NocStatus _classifyStatus(MonitoringMetric? metric, MonitoringConfig config) {
    if (metric == null) {
      final errors = (_consecutiveErrors[config.id] ?? 0) + 1;
      _consecutiveErrors[config.id] = errors;

      // If we've never successfully polled (still loading), keep loading status
      final prevStatus = _previousStatuses[config.id];
      if (prevStatus == null || prevStatus == NocStatus.loading) {
        return NocStatus.loading;
      }

      // Only mark as DOWN after enough consecutive errors AND we had a previous successful poll
      return errors >= config.downCount ? NocStatus.down : prevStatus;
    }

    // Reset errors on success
    _consecutiveErrors[config.id] = 0;

    final totalBitrate = metric.totalTrafficBitrate ?? 0;
    // Convert threshold from Mbit/s to bits/s
    final thresholdDownBits = config.thresholdDown * 1000000;

    // DOWN: traffic <= threshold (default 1 Mbit/s)
    if (totalBitrate <= thresholdDownBits) return NocStatus.noTraffic;

    // LOW TRAFFIC: check if traffic dropped by X% from rolling average
    final avgBitrate = _rollingAverages[config.id];
    if (avgBitrate != null && avgBitrate > 0) {
      // Calculate how much current traffic is below the average
      final dropPercent = ((avgBitrate - totalBitrate) / avgBitrate) * 100;
      if (dropPercent >= config.thresholdLowTraffic) {
        // Don't update average when traffic is low (preserve the "normal" baseline)
        return NocStatus.lowTraffic;
      }
    }

    // Update rolling average ONLY when traffic is normal
    // Use slow-moving average (0.95/0.05) to establish a stable "normal" baseline
    final currentAvg = _rollingAverages[config.id];
    if (currentAvg == null) {
      // First successful poll — set average to current value
      _rollingAverages[config.id] = totalBitrate;
    } else {
      // Slow exponential moving average — takes ~20 polls to fully adjust
      _rollingAverages[config.id] = currentAvg * 0.95 + totalBitrate * 0.05;
    }

    return NocStatus.normal;
  }

  /// Force refresh all
  Future<void> refresh() async {
    await _pollAll();
  }

  @override
  void dispose() {
    _pollTimer?.cancel();
    super.dispose();
  }
}
