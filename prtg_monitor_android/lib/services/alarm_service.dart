import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:audioplayers/audioplayers.dart';
import 'package:file_picker/file_picker.dart';
import 'package:path_provider/path_provider.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:vibration/vibration.dart';

/// Built-in alarm sound types
enum BuiltInAlarm {
  beep('Beep', '🔔'),
  sshh('Sshh', '🤫'),
  alarm3('Alarm 3', '🚨'),
  fahhh('Fahhh', '😱'),
  alarm2('Alarm 2', '⚠️');

  final String label;
  final String emoji;
  const BuiltInAlarm(this.label, this.emoji);

  String get displayName => '$emoji $label';
  String get assetPath => 'sounds/$name.wav';
}

/// Vibration pattern presets — all at MAXIMUM intensity (255)
enum VibrationPattern {
  singleBuzz('Single Buzz', [0, 300], [0, 255]),
  doubleBuzz('Double Buzz', [0, 200, 150, 200], [0, 255, 0, 255]),
  tripleBuzz('Triple Buzz', [0, 150, 100, 150, 100, 150], [0, 255, 0, 255, 0, 255]),
  longAlarm('Long Alarm', [0, 1000], [0, 255]),
  pulseWave('Pulse Wave', [0, 150, 100, 150, 100, 150], [0, 255, 0, 255, 0, 255]),
  progressive('Progressive', [0, 200, 100, 400, 100, 600], [0, 255, 0, 255, 0, 255]),
  heartbeat('Heartbeat', [0, 250, 150, 150, 200, 250], [0, 255, 0, 255, 0, 255]),
  emergency('Emergency', [0, 600, 100, 600, 100, 600], [0, 255, 0, 255, 0, 255]),
  rapidTap('Rapid Tap', [0, 80, 60, 80, 60, 80, 60, 80], [0, 255, 0, 255, 0, 255, 0, 255]),
  urgentWave('Urgent Wave', [0, 400, 80, 400, 80, 400], [0, 255, 0, 255, 0, 255]),
  none('No Vibration', [], []);

  final String label;
  final List<int> pattern;
  final List<int> intensities;
  const VibrationPattern(this.label, this.pattern, this.intensities);
}

/// Represents an alarm sound (built-in or custom file)
class AlarmSound {
  final String id;
  final String label;
  final String emoji;
  final bool isCustom;
  final String? filePath;

  const AlarmSound({
    required this.id,
    required this.label,
    this.emoji = '🎵',
    this.isCustom = false,
    this.filePath,
  });

  String get displayName => '$emoji $label';

  Map<String, dynamic> toJson() => {
        'id': id,
        'label': label,
        'emoji': emoji,
        'isCustom': isCustom,
        'filePath': filePath,
      };

  factory AlarmSound.fromJson(Map<String, dynamic> json) => AlarmSound(
        id: json['id'] as String,
        label: json['label'] as String,
        emoji: json['emoji'] as String? ?? '🎵',
        isCustom: json['isCustom'] as bool? ?? false,
        filePath: json['filePath'] as String?,
      );

  factory AlarmSound.fromBuiltIn(BuiltInAlarm builtIn) => AlarmSound(
        id: 'builtin_${builtIn.name}',
        label: builtIn.label,
        emoji: builtIn.emoji,
        isCustom: false,
      );
}

/// Service for managing alarm sounds with notification stream, vibration, and duration control
class AlarmService {
  static final AlarmService _instance = AlarmService._internal();
  factory AlarmService() => _instance;
  AlarmService._internal();

  final AudioPlayer _player = AudioPlayer();
  bool _isPlaying = false;
  bool _enabled = true;
  Timer? _durationTimer;
  Timer? _vibrationTimer;

  String _selectedAlarmId = 'builtin_alarm3';
  List<AlarmSound> _customAlarms = [];
  int _alarmDuration = 5; // seconds
  VibrationPattern _vibrationPattern = VibrationPattern.emergency;
  bool _vibrationEnabled = true;

  // Getters
  bool get isPlaying => _isPlaying;
  bool get enabled => _enabled;
  String get selectedAlarmId => _selectedAlarmId;
  int get alarmDuration => _alarmDuration;
  VibrationPattern get vibrationPattern => _vibrationPattern;
  bool get vibrationEnabled => _vibrationEnabled;

  /// All available alarms (built-in + custom)
  List<AlarmSound> get allAlarms {
    final builtIns = BuiltInAlarm.values.map((b) => AlarmSound.fromBuiltIn(b)).toList();
    return [...builtIns, ..._customAlarms];
  }

  /// Get the currently selected alarm
  AlarmSound get selectedAlarm {
    return allAlarms.firstWhere(
      (a) => a.id == _selectedAlarmId,
      orElse: () => AlarmSound.fromBuiltIn(BuiltInAlarm.alarm3),
    );
  }

  /// Load saved preferences
  Future<void> load() async {
    final prefs = await SharedPreferences.getInstance();
    _enabled = prefs.getBool('alarm_enabled') ?? true;
    _selectedAlarmId = prefs.getString('selected_alarm_id') ?? 'builtin_alarm3';
    _alarmDuration = prefs.getInt('alarm_duration') ?? 5;
    _vibrationEnabled = prefs.getBool('vibration_enabled') ?? true;

    final vibName = prefs.getString('vibration_pattern');
    if (vibName != null) {
      _vibrationPattern = VibrationPattern.values.firstWhere(
        (v) => v.name == vibName,
        orElse: () => VibrationPattern.emergency,
      );
    }

    // Load custom alarms
    final customJson = prefs.getString('custom_alarms');
    if (customJson != null) {
      try {
        final list = jsonDecode(customJson) as List<dynamic>;
        _customAlarms = list.map((e) => AlarmSound.fromJson(e as Map<String, dynamic>)).toList();
        _customAlarms.removeWhere((a) => a.filePath != null && !File(a.filePath!).existsSync());
      } catch (_) {
        _customAlarms = [];
      }
    }

    // Configure audio player to use NOTIFICATION stream (not media)
    await _player.setAudioContext(
      AudioContext(
        android: const AudioContextAndroid(
          isSpeakerphoneOn: false,
          audioMode: AndroidAudioMode.normal,
          stayAwake: true,
          contentType: AndroidContentType.sonification,
          usageType: AndroidUsageType.notification,
          audioFocus: AndroidAudioFocus.gainTransientMayDuck,
        ),
        iOS: AudioContextIOS(
          category: AVAudioSessionCategory.playback,
          options: const {AVAudioSessionOptions.mixWithOthers},
        ),
      ),
    );
  }

  /// Save custom alarms list
  Future<void> _saveCustomAlarms() async {
    final prefs = await SharedPreferences.getInstance();
    final json = jsonEncode(_customAlarms.map((a) => a.toJson()).toList());
    await prefs.setString('custom_alarms', json);
  }

  /// Set the selected alarm
  Future<void> setSelectedAlarm(String alarmId) async {
    _selectedAlarmId = alarmId;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('selected_alarm_id', alarmId);
  }

  /// Set alarm duration in seconds
  Future<void> setAlarmDuration(int seconds) async {
    _alarmDuration = seconds;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setInt('alarm_duration', seconds);
  }

  /// Set vibration pattern
  Future<void> setVibrationPattern(VibrationPattern pattern) async {
    _vibrationPattern = pattern;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('vibration_pattern', pattern.name);
  }

  /// Enable/disable vibration
  Future<void> setVibrationEnabled(bool value) async {
    _vibrationEnabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('vibration_enabled', value);
  }

  /// Enable/disable alarm
  Future<void> setEnabled(bool value) async {
    _enabled = value;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('alarm_enabled', value);
    if (!value) await stop();
  }

  /// Add a custom alarm from file picker (mp3/wav)
  Future<AlarmSound?> addCustomAlarm() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
      allowMultiple: false,
    );

    if (result == null || result.files.isEmpty) return null;
    final pickedFile = result.files.first;
    if (pickedFile.path == null) return null;

    final appDir = await getApplicationDocumentsDirectory();
    final alarmsDir = Directory('${appDir.path}/custom_alarms');
    if (!alarmsDir.existsSync()) alarmsDir.createSync(recursive: true);

    final fileName = pickedFile.name;
    final destPath = '${alarmsDir.path}/$fileName';
    await File(pickedFile.path!).copy(destPath);

    final alarm = AlarmSound(
      id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
      label: fileName.replaceAll(RegExp(r'\.(mp3|wav|ogg|m4a|aac)$'), ''),
      emoji: '🎵',
      isCustom: true,
      filePath: destPath,
    );

    _customAlarms.add(alarm);
    await _saveCustomAlarms();
    return alarm;
  }

  /// Add a custom alarm with a specific name
  Future<AlarmSound?> addCustomAlarmWithName(String name) async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
      allowMultiple: false,
    );

    if (result == null || result.files.isEmpty) return null;
    final pickedFile = result.files.first;
    if (pickedFile.path == null) return null;

    final appDir = await getApplicationDocumentsDirectory();
    final alarmsDir = Directory('${appDir.path}/custom_alarms');
    if (!alarmsDir.existsSync()) alarmsDir.createSync(recursive: true);

    final fileName = pickedFile.name;
    final destPath = '${alarmsDir.path}/$fileName';
    await File(pickedFile.path!).copy(destPath);

    final alarm = AlarmSound(
      id: 'custom_${DateTime.now().millisecondsSinceEpoch}',
      label: name,
      emoji: '🎵',
      isCustom: true,
      filePath: destPath,
    );

    _customAlarms.add(alarm);
    await _saveCustomAlarms();
    return alarm;
  }

  /// Rename an alarm (works for both built-in and custom)
  Future<void> renameAlarm(String alarmId, String newName) async {
    // For custom alarms, update in the list
    final idx = _customAlarms.indexWhere((a) => a.id == alarmId);
    if (idx >= 0) {
      _customAlarms[idx] = AlarmSound(
        id: _customAlarms[idx].id,
        label: newName,
        emoji: _customAlarms[idx].emoji,
        isCustom: true,
        filePath: _customAlarms[idx].filePath,
      );
      await _saveCustomAlarms();
    }
    // Built-in alarms can't be renamed (they're const enums)
  }

  /// Remove a custom alarm
  Future<void> removeCustomAlarm(String alarmId) async {
    final alarm = _customAlarms.firstWhere(
      (a) => a.id == alarmId,
      orElse: () => const AlarmSound(id: '', label: ''),
    );
    if (alarm.id.isEmpty) return;

    if (alarm.filePath != null) {
      final file = File(alarm.filePath!);
      if (file.existsSync()) file.deleteSync();
    }

    _customAlarms.removeWhere((a) => a.id == alarmId);
    await _saveCustomAlarms();

    if (_selectedAlarmId == alarmId) {
      await setSelectedAlarm('builtin_alarm3');
    }
  }

  /// Play the currently selected alarm with duration limit and vibration
  Future<void> play() async {
    if (!_enabled) return;
    await _playAlarm(selectedAlarm);
  }

  /// Play a specific alarm (for testing)
  Future<void> playTest(AlarmSound alarm) async {
    await _playAlarm(alarm);
  }

  /// Internal play logic with duration control and vibration
  Future<void> _playAlarm(AlarmSound alarm) async {
    await stop();
    _isPlaying = true;

    try {
      // Play sound on notification stream
      if (alarm.isCustom && alarm.filePath != null) {
        await _player.setSource(DeviceFileSource(alarm.filePath!));
      } else {
        final builtInName = alarm.id.replaceFirst('builtin_', '');
        final builtIn = BuiltInAlarm.values.firstWhere(
          (b) => b.name == builtInName,
          orElse: () => BuiltInAlarm.alarm3,
        );
        await _player.setSource(AssetSource(builtIn.assetPath));
      }

      await _player.setVolume(0.8);
      await _player.resume();

      // Trigger vibration
      if (_vibrationEnabled && _vibrationPattern != VibrationPattern.none) {
        _triggerVibration();
      }

      // Auto-stop after duration
      _durationTimer?.cancel();
      _durationTimer = Timer(Duration(seconds: _alarmDuration), () {
        stop();
      });

      _player.onPlayerComplete.listen((_) {
        _isPlaying = false;
      });
    } catch (e) {
      _isPlaying = false;
    }
  }

  /// Trigger vibration pattern — repeats for the full alarm duration
  Future<void> _triggerVibration() async {
    final hasVibrator = await Vibration.hasVibrator();
    if (hasVibrator != true) return;

    final pattern = _vibrationPattern.pattern;
    final intensities = _vibrationPattern.intensities;

    if (pattern.isEmpty) return;

    // Calculate single pattern duration in ms
    final patternDurationMs = pattern.fold<int>(0, (sum, v) => sum + v);
    if (patternDurationMs <= 0) return;

    final hasCustom = await Vibration.hasCustomVibrationsSupport();

    // Vibrate once immediately
    if (hasCustom == true && intensities.isNotEmpty) {
      Vibration.vibrate(pattern: pattern, intensities: intensities);
    } else {
      Vibration.vibrate(pattern: pattern);
    }

    // Repeat vibration pattern until alarm duration ends
    // Add a small gap (200ms) between repetitions
    final repeatInterval = Duration(milliseconds: patternDurationMs + 200);

    _vibrationTimer?.cancel();
    _vibrationTimer = Timer.periodic(repeatInterval, (_) {
      if (!_isPlaying) {
        _vibrationTimer?.cancel();
        _vibrationTimer = null;
        return;
      }
      if (hasCustom == true && intensities.isNotEmpty) {
        Vibration.vibrate(pattern: pattern, intensities: intensities);
      } else {
        Vibration.vibrate(pattern: pattern);
      }
    });
  }

  /// Stop the alarm and vibration
  Future<void> stop() async {
    _isPlaying = false;
    _durationTimer?.cancel();
    _durationTimer = null;
    _vibrationTimer?.cancel();
    _vibrationTimer = null;
    await _player.stop();
    Vibration.cancel();
  }

  void dispose() {
    _durationTimer?.cancel();
    _player.dispose();
  }
}
