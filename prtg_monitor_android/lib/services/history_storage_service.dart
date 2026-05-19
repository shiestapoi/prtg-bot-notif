import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import '../models/monitoring_config.dart';

/// A single history entry for a monitoring config.
class HistoryEntry {
  final DateTime timestamp;
  final NocStatus status;
  final double? totalTrafficBitrate;
  final double? inboundBitrate;
  final double? outboundBitrate;

  const HistoryEntry({
    required this.timestamp,
    required this.status,
    this.totalTrafficBitrate,
    this.inboundBitrate,
    this.outboundBitrate,
  });

  Map<String, dynamic> toJson() => {
        'timestamp': timestamp.toIso8601String(),
        'status': status.name,
        'totalTrafficBitrate': totalTrafficBitrate,
        'inboundBitrate': inboundBitrate,
        'outboundBitrate': outboundBitrate,
      };

  factory HistoryEntry.fromJson(Map<String, dynamic> json) => HistoryEntry(
        timestamp: DateTime.parse(json['timestamp'] as String),
        status: NocStatus.values.firstWhere(
          (e) => e.name == json['status'],
          orElse: () => NocStatus.normal,
        ),
        totalTrafficBitrate: (json['totalTrafficBitrate'] as num?)?.toDouble(),
        inboundBitrate: (json['inboundBitrate'] as num?)?.toDouble(),
        outboundBitrate: (json['outboundBitrate'] as num?)?.toDouble(),
      );
}

/// Service that stores polling history per config in SharedPreferences.
/// Stores last 50 entries per config to avoid storage bloat.
class HistoryStorageService {
  static const _keyPrefix = 'history_';
  static const int _maxEntries = 50;

  /// Add a history entry for a config. Keeps only the last [_maxEntries].
  static Future<void> addEntry(int configId, HistoryEntry entry) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_keyPrefix$configId';

    final existing = await _loadRaw(prefs, key);
    existing.add(entry.toJson());

    // Trim to max entries
    while (existing.length > _maxEntries) {
      existing.removeAt(0);
    }

    await prefs.setString(key, jsonEncode(existing));
  }

  /// Get all history entries for a config (oldest first).
  static Future<List<HistoryEntry>> getHistory(int configId) async {
    final prefs = await SharedPreferences.getInstance();
    final key = '$_keyPrefix$configId';
    final raw = await _loadRaw(prefs, key);
    return raw
        .map((e) => HistoryEntry.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Clear all history for a config.
  static Future<void> clearHistory(int configId) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('$_keyPrefix$configId');
  }

  static Future<List<dynamic>> _loadRaw(
      SharedPreferences prefs, String key) async {
    final jsonStr = prefs.getString(key);
    if (jsonStr == null || jsonStr.isEmpty) return [];
    return jsonDecode(jsonStr) as List<dynamic>;
  }
}
