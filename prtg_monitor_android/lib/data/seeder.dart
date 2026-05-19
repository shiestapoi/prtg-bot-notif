import '../models/monitoring_config.dart';

/// Static seeder data — same as the backend database seed.
/// This data is used as the initial config when the app is first installed.
///
/// Threshold defaults:
/// - thresholdDown: 1.0 Mbit/s (traffic <= 1 Mbit/s = DOWN)
/// - thresholdLowTraffic: 80 (percentage drop from average = LOW_TRAFFIC)
///   In practice this means if traffic drops to 20% of normal, it's LOW_TRAFFIC.
///   For simplicity, we use absolute value: traffic <= thresholdLowTraffic Mbit/s = LOW.
///   Default 5.0 Mbit/s as "low traffic" threshold.
class Seeder {
  static const List<MonitoringGroup> groups = [
    MonitoringGroup(id: 2, name: 'RAWANGKAO'),
    MonitoringGroup(id: 3, name: 'DUMAI'),
    MonitoringGroup(id: 4, name: 'SEI PAKNING'),
    MonitoringGroup(id: 5, name: 'BUNGARAYA'),
    MonitoringGroup(id: 6, name: 'PERAWANG'),
    MonitoringGroup(id: 7, name: 'SIAK KOTA'),
    MonitoringGroup(id: 9, name: 'PEKANBARU'),
    MonitoringGroup(id: 10, name: 'RUMBAI'),
  ];

  static const List<MonitoringConfig> configs = [
    MonitoringConfig(id: 1, title: 'LL SOLNET', sensorId: 2669, groupId: 7, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 2, title: 'LL INDOSAT', sensorId: 2624, groupId: 7, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 3, title: 'LL TELKOM', sensorId: 2659, groupId: 4, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 4, title: 'LL INDOSAT', sensorId: 2658, groupId: 4, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 5, title: 'LL SOLNET', sensorId: 2719, groupId: 6, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 6, title: 'LL INDOSAT', sensorId: 2717, groupId: 2, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 7, title: 'LL XL', sensorId: 2588, groupId: 5, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 8, title: 'LL MORA', sensorId: 2511, groupId: 3, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 39, title: 'LL INDOSAT', sensorId: 2484, groupId: 3, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 40, title: 'LL INDOSAT', sensorId: 2657, groupId: 6, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 55, title: 'IPTX SOLNET', sensorId: 2242, groupId: 9, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 56, title: 'IPTX TELKOM', sensorId: 2249, groupId: 9, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 57, title: 'CDN H3I', sensorId: 2506, groupId: 9, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 58, title: 'RUMBAI TRAFFIC', sensorId: 2411, groupId: 10, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
    MonitoringConfig(id: 88, title: 'LL INDOSAT', sensorId: 2721, groupId: 5, thresholdDown: 1.0, thresholdLowTraffic: 80.0),
  ];

  /// Get group name by ID
  static String getGroupName(int groupId) {
    return groups
        .firstWhere(
          (g) => g.id == groupId,
          orElse: () => const MonitoringGroup(id: 0, name: 'Unknown'),
        )
        .name;
  }
}
