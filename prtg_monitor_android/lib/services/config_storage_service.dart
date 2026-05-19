import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';

import '../data/seeder.dart';
import '../models/monitoring_config.dart';

/// Service for persisting monitoring configs and groups to SharedPreferences.
/// On first run, seeds from Seeder data.
class ConfigStorageService {
  static const _keyConfigs = 'monitoring_configs';
  static const _keyGroups = 'monitoring_groups';
  static const _keySeeded = 'configs_seeded';

  /// Load all configs from SharedPreferences.
  /// Seeds from Seeder on first run.
  static Future<List<MonitoringConfig>> loadConfigs() async {
    final prefs = await SharedPreferences.getInstance();

    // Seed on first run
    if (!(prefs.getBool(_keySeeded) ?? false)) {
      await _seedDefaults(prefs);
    }

    final jsonStr = prefs.getString(_keyConfigs);
    if (jsonStr == null || jsonStr.isEmpty) return [];

    final List<dynamic> list = jsonDecode(jsonStr);
    return list.map((e) => MonitoringConfig.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Load all groups from SharedPreferences.
  static Future<List<MonitoringGroup>> loadGroups() async {
    final prefs = await SharedPreferences.getInstance();

    // Seed on first run
    if (!(prefs.getBool(_keySeeded) ?? false)) {
      await _seedDefaults(prefs);
    }

    final jsonStr = prefs.getString(_keyGroups);
    if (jsonStr == null || jsonStr.isEmpty) return [];

    final List<dynamic> list = jsonDecode(jsonStr);
    return list.map((e) => MonitoringGroup.fromJson(e as Map<String, dynamic>)).toList();
  }

  /// Save all configs to SharedPreferences.
  static Future<void> saveConfigs(List<MonitoringConfig> configs) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = jsonEncode(configs.map((c) => c.toJson()).toList());
    await prefs.setString(_keyConfigs, jsonStr);
  }

  /// Save all groups to SharedPreferences.
  static Future<void> saveGroups(List<MonitoringGroup> groups) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonStr = jsonEncode(groups.map((g) => g.toJson()).toList());
    await prefs.setString(_keyGroups, jsonStr);
  }

  /// Add a new config. Returns the new config with generated ID.
  static Future<MonitoringConfig> addConfig(MonitoringConfig config) async {
    final configs = await loadConfigs();
    final newId = configs.isEmpty ? 1 : configs.map((c) => c.id).reduce((a, b) => a > b ? a : b) + 1;
    final newConfig = config.copyWith(id: newId);
    configs.add(newConfig);
    await saveConfigs(configs);
    return newConfig;
  }

  /// Update an existing config by ID.
  static Future<void> updateConfig(MonitoringConfig config) async {
    final configs = await loadConfigs();
    final idx = configs.indexWhere((c) => c.id == config.id);
    if (idx >= 0) {
      configs[idx] = config;
      await saveConfigs(configs);
    }
  }

  /// Delete a config by ID.
  static Future<void> deleteConfig(int configId) async {
    final configs = await loadConfigs();
    configs.removeWhere((c) => c.id == configId);
    await saveConfigs(configs);
  }

  /// Add a new group. Returns the new group with generated ID.
  static Future<MonitoringGroup> addGroup(MonitoringGroup group) async {
    final groups = await loadGroups();
    final newId = groups.isEmpty ? 1 : groups.map((g) => g.id).reduce((a, b) => a > b ? a : b) + 1;
    final newGroup = group.copyWith(id: newId);
    groups.add(newGroup);
    await saveGroups(groups);
    return newGroup;
  }

  /// Update an existing group by ID.
  static Future<void> updateGroup(MonitoringGroup group) async {
    final groups = await loadGroups();
    final idx = groups.indexWhere((g) => g.id == group.id);
    if (idx >= 0) {
      groups[idx] = group;
      await saveGroups(groups);
    }
  }

  /// Delete a group by ID.
  static Future<void> deleteGroup(int groupId) async {
    final groups = await loadGroups();
    groups.removeWhere((g) => g.id == groupId);
    await saveGroups(groups);
  }

  /// Get group name by ID from stored groups.
  static Future<String> getGroupName(int groupId) async {
    final groups = await loadGroups();
    final group = groups.where((g) => g.id == groupId).firstOrNull;
    return group?.name ?? 'Unknown';
  }

  /// Seed default data from Seeder.
  static Future<void> _seedDefaults(SharedPreferences prefs) async {
    final configsJson = jsonEncode(Seeder.configs.map((c) => c.toJson()).toList());
    final groupsJson = jsonEncode(Seeder.groups.map((g) => g.toJson()).toList());
    await prefs.setString(_keyConfigs, configsJson);
    await prefs.setString(_keyGroups, groupsJson);
    await prefs.setBool(_keySeeded, true);
  }

  /// Reset to default seed data (for testing/debug).
  static Future<void> resetToDefaults() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_keySeeded);
    await _seedDefaults(prefs);
  }
}
