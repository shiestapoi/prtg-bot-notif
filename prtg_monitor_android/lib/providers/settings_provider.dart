import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/alarm_service.dart';
import '../services/secure_storage_service.dart';

/// Provider for app settings (PRTG connection, alarm, polling, escalation, daily summary, app lock)
class SettingsProvider extends ChangeNotifier {
  String _baseUrl = '';
  String _username = '';
  String _passhash = '';
  int _pollingInterval = 60; // seconds
  bool _backgroundEnabled = true;
  bool _alarmEnabled = true;
  bool _alarmOnDown = true;
  bool _alarmOnLowTraffic = false; // default: alarm only on DOWN
  bool _notifyDown = true;
  bool _notifyLowTraffic = true;

  // Escalation settings
  bool _escalationEnabled = true;
  int _escalationMinutes = 15;

  // Daily summary settings
  bool _dailySummaryEnabled = false;
  int _dailySummaryHour = 8;
  int _dailySummaryMinute = 0;

  // App lock settings
  bool _appLockEnabled = false;

  // Getters
  String get baseUrl => _baseUrl;
  String get username => _username;
  String get passhash => _passhash;
  int get pollingInterval => _pollingInterval;
  bool get backgroundEnabled => _backgroundEnabled;
  bool get alarmEnabled => _alarmEnabled;
  bool get alarmOnDown => _alarmOnDown;
  bool get alarmOnLowTraffic => _alarmOnLowTraffic;
  bool get notifyDown => _notifyDown;
  bool get notifyLowTraffic => _notifyLowTraffic;

  // Escalation getters
  bool get escalationEnabled => _escalationEnabled;
  int get escalationMinutes => _escalationMinutes;

  // Daily summary getters
  bool get dailySummaryEnabled => _dailySummaryEnabled;
  int get dailySummaryHour => _dailySummaryHour;
  int get dailySummaryMinute => _dailySummaryMinute;

  // App lock getters
  bool get appLockEnabled => _appLockEnabled;

  bool get isConfigured =>
      _baseUrl.isNotEmpty && _username.isNotEmpty && _passhash.isNotEmpty;

  /// Load settings from SharedPreferences + SecureStorage
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _baseUrl = prefs.getString('prtg_base_url') ?? 'http://prtg.r1net.id/index.htm';
    _username = prefs.getString('prtg_username') ?? 'swenson';

    // Try to load passhash from secure storage, with multiple fallbacks
    try {
      _passhash = await SecureStorageService.migrateIfNeeded();
    } catch (_) {
      _passhash = '';
    }
    // Fallback chain: secure storage → SharedPreferences → default
    if (_passhash.isEmpty) {
      _passhash = prefs.getString('prtg_passhash') ?? '1218899642';
    }
    // Always keep a copy in SharedPreferences for native background service
    await prefs.setString('prtg_passhash', _passhash);

    _pollingInterval = prefs.getInt('polling_interval') ?? 60;
    _backgroundEnabled = prefs.getBool('background_enabled') ?? true;
    _alarmEnabled = prefs.getBool('alarm_enabled') ?? true;
    _alarmOnDown = prefs.getBool('alarm_on_down') ?? true;
    _alarmOnLowTraffic = prefs.getBool('alarm_on_low_traffic') ?? false;
    _notifyDown = prefs.getBool('notify_down') ?? true;
    _notifyLowTraffic = prefs.getBool('notify_low_traffic') ?? true;

    // Escalation
    _escalationEnabled = prefs.getBool('escalation_enabled') ?? true;
    _escalationMinutes = prefs.getInt('escalation_minutes') ?? 15;

    // Daily summary
    _dailySummaryEnabled = prefs.getBool('daily_summary_enabled') ?? false;
    _dailySummaryHour = prefs.getInt('daily_summary_hour') ?? 8;
    _dailySummaryMinute = prefs.getInt('daily_summary_minute') ?? 0;

    // App lock
    _appLockEnabled = prefs.getBool('app_lock_enabled') ?? false;

    // Load alarm service
    await AlarmService().load();

    notifyListeners();
  }

  /// Save PRTG connection settings
  Future<void> saveConnection({
    required String baseUrl,
    required String username,
    required String passhash,
  }) async {
    _baseUrl = baseUrl;
    _username = username;
    _passhash = passhash;

    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('prtg_base_url', baseUrl);
    await prefs.setString('prtg_username', username);
    // Store passhash in secure storage AND SharedPreferences (for native service)
    await SecureStorageService.setPasshash(passhash);
    await prefs.setString('prtg_passhash', passhash);

    notifyListeners();
  }

  /// Save polling interval
  Future<void> setPollingInterval(int seconds) async {
    _pollingInterval = seconds;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('polling_interval', seconds);
    notifyListeners();
  }

  /// Toggle background service
  Future<void> setBackgroundEnabled(bool value) async {
    _backgroundEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('background_enabled', value);
    notifyListeners();
  }

  /// Toggle alarm
  Future<void> setAlarmEnabled(bool value) async {
    _alarmEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('alarm_enabled', value);
    AlarmService().setEnabled(value);
    notifyListeners();
  }

  /// Toggle alarm on DOWN
  Future<void> setAlarmOnDown(bool value) async {
    _alarmOnDown = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('alarm_on_down', value);
    notifyListeners();
  }

  /// Toggle alarm on LOW TRAFFIC
  Future<void> setAlarmOnLowTraffic(bool value) async {
    _alarmOnLowTraffic = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('alarm_on_low_traffic', value);
    notifyListeners();
  }

  /// Set alarm type (triggers rebuild for UI)
  Future<void> setAlarmType(BuiltInAlarm type) async {
    notifyListeners();
  }

  /// Toggle notify on DOWN
  Future<void> setNotifyDown(bool value) async {
    _notifyDown = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notify_down', value);
    notifyListeners();
  }

  /// Toggle notify on LOW TRAFFIC
  Future<void> setNotifyLowTraffic(bool value) async {
    _notifyLowTraffic = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notify_low_traffic', value);
    notifyListeners();
  }

  /// Toggle escalation
  Future<void> setEscalationEnabled(bool value) async {
    _escalationEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('escalation_enabled', value);
    notifyListeners();
  }

  /// Set escalation minutes
  Future<void> setEscalationMinutes(int minutes) async {
    _escalationMinutes = minutes;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('escalation_minutes', minutes);
    notifyListeners();
  }

  /// Toggle daily summary
  Future<void> setDailySummaryEnabled(bool value) async {
    _dailySummaryEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('daily_summary_enabled', value);
    notifyListeners();
  }

  /// Set daily summary time
  Future<void> setDailySummaryTime(int hour, int minute) async {
    _dailySummaryHour = hour;
    _dailySummaryMinute = minute;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('daily_summary_hour', hour);
    await prefs.setInt('daily_summary_minute', minute);
    notifyListeners();
  }

  /// Toggle app lock
  Future<void> setAppLockEnabled(bool value) async {
    _appLockEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('app_lock_enabled', value);
    notifyListeners();
  }
}
