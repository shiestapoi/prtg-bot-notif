/// Status monitoring NOC
enum NocStatus {
  normal,
  lowTraffic,
  noTraffic,
  highUtilization,
  possibleFlapping,
  down,
  loading;

  String get label {
    switch (this) {
      case NocStatus.normal:
        return 'NORMAL';
      case NocStatus.lowTraffic:
        return 'LOW TRAFFIC';
      case NocStatus.noTraffic:
        return 'NO TRAFFIC';
      case NocStatus.highUtilization:
        return 'HIGH UTILIZATION';
      case NocStatus.possibleFlapping:
        return 'POSSIBLE FLAPPING';
      case NocStatus.down:
        return 'DOWN';
      case NocStatus.loading:
        return 'LOADING';
    }
  }

  int get priority {
    switch (this) {
      case NocStatus.down:
        return 0;
      case NocStatus.noTraffic:
        return 1;
      case NocStatus.possibleFlapping:
        return 2;
      case NocStatus.highUtilization:
        return 3;
      case NocStatus.lowTraffic:
        return 4;
      case NocStatus.normal:
        return 5;
      case NocStatus.loading:
        return 6;
    }
  }

  bool get isCritical => this == NocStatus.down || this == NocStatus.noTraffic;
  bool get isWarning =>
      this == NocStatus.lowTraffic ||
      this == NocStatus.highUtilization ||
      this == NocStatus.possibleFlapping;
  bool get isLoading => this == NocStatus.loading;
}

/// Group monitoring
class MonitoringGroup {
  final int id;
  final String name;
  final bool enabled;

  const MonitoringGroup({
    required this.id,
    required this.name,
    this.enabled = true,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'enabled': enabled,
      };

  factory MonitoringGroup.fromJson(Map<String, dynamic> json) =>
      MonitoringGroup(
        id: json['id'] as int,
        name: json['name'] as String,
        enabled: json['enabled'] as bool? ?? true,
      );

  MonitoringGroup copyWith({
    int? id,
    String? name,
    bool? enabled,
  }) {
    return MonitoringGroup(
      id: id ?? this.id,
      name: name ?? this.name,
      enabled: enabled ?? this.enabled,
    );
  }
}

/// Config item monitoring
class MonitoringConfig {
  final int id;
  final String title;
  final int sensorId;
  final int groupId;
  final bool enabled;
  final bool monitoringEnabled;
  final int pollingInterval; // seconds
  final double thresholdDown; // Mbit/s — traffic <= this value = DOWN/NO_TRAFFIC (default 1.0)
  final double thresholdLowTraffic; // Percentage drop (0-100) — if traffic drops by this % from rolling average = LOW_TRAFFIC (default 80)
  final int noTrafficCount;
  final int downCount;
  final bool maintenance; // When true: skip alarm/notification, show in MAINTENANCE group

  const MonitoringConfig({
    required this.id,
    required this.title,
    required this.sensorId,
    required this.groupId,
    this.enabled = true,
    this.monitoringEnabled = true,
    this.pollingInterval = 60,
    this.thresholdDown = 1.0,
    this.thresholdLowTraffic = 80.0,
    this.noTrafficCount = 3,
    this.downCount = 3,
    this.maintenance = false,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'sensorId': sensorId,
        'groupId': groupId,
        'enabled': enabled,
        'monitoringEnabled': monitoringEnabled,
        'pollingInterval': pollingInterval,
        'thresholdDown': thresholdDown,
        'thresholdLowTraffic': thresholdLowTraffic,
        'noTrafficCount': noTrafficCount,
        'downCount': downCount,
        'maintenance': maintenance,
      };

  factory MonitoringConfig.fromJson(Map<String, dynamic> json) =>
      MonitoringConfig(
        id: json['id'] as int,
        title: json['title'] as String,
        sensorId: json['sensorId'] as int,
        groupId: json['groupId'] as int,
        enabled: json['enabled'] as bool? ?? true,
        monitoringEnabled: json['monitoringEnabled'] as bool? ?? true,
        pollingInterval: json['pollingInterval'] as int? ?? 60,
        thresholdDown: (json['thresholdDown'] as num?)?.toDouble() ?? 1.0,
        thresholdLowTraffic:
            (json['thresholdLowTraffic'] as num?)?.toDouble() ?? 80.0,
        noTrafficCount: json['noTrafficCount'] as int? ?? 3,
        downCount: json['downCount'] as int? ?? 3,
        maintenance: json['maintenance'] as bool? ?? false,
      );

  MonitoringConfig copyWith({
    int? id,
    String? title,
    int? sensorId,
    int? groupId,
    bool? enabled,
    bool? monitoringEnabled,
    int? pollingInterval,
    double? thresholdDown,
    double? thresholdLowTraffic,
    int? noTrafficCount,
    int? downCount,
    bool? maintenance,
  }) {
    return MonitoringConfig(
      id: id ?? this.id,
      title: title ?? this.title,
      sensorId: sensorId ?? this.sensorId,
      groupId: groupId ?? this.groupId,
      enabled: enabled ?? this.enabled,
      monitoringEnabled: monitoringEnabled ?? this.monitoringEnabled,
      pollingInterval: pollingInterval ?? this.pollingInterval,
      thresholdDown: thresholdDown ?? this.thresholdDown,
      thresholdLowTraffic: thresholdLowTraffic ?? this.thresholdLowTraffic,
      noTrafficCount: noTrafficCount ?? this.noTrafficCount,
      downCount: downCount ?? this.downCount,
      maintenance: maintenance ?? this.maintenance,
    );
  }
}

/// Metric result from PRTG polling
class MonitoringMetric {
  final int configId;
  final double? totalTrafficBitrate;
  final double? inboundBitrate;
  final double? outboundBitrate;
  final DateTime timestamp;

  const MonitoringMetric({
    required this.configId,
    this.totalTrafficBitrate,
    this.inboundBitrate,
    this.outboundBitrate,
    required this.timestamp,
  });
}

/// Status item for display
class MonitoringStatusItem {
  final int configId;
  final String title;
  final String groupName;
  final int sensorId;
  final NocStatus status;
  final MonitoringMetric? lastMetric;
  final DateTime? lastPolledAt;
  final NocStatus? previousStatus;
  final bool maintenance;
  final DateTime? snoozedUntil;
  final DateTime? statusSince; // When the current status started

  const MonitoringStatusItem({
    required this.configId,
    required this.title,
    required this.groupName,
    required this.sensorId,
    required this.status,
    this.lastMetric,
    this.lastPolledAt,
    this.previousStatus,
    this.maintenance = false,
    this.snoozedUntil,
    this.statusSince,
  });

  /// Whether this sensor is currently snoozed.
  bool get isSnoozed =>
      snoozedUntil != null && DateTime.now().isBefore(snoozedUntil!);

  /// Duration of current status
  Duration? get statusDuration =>
      statusSince != null ? DateTime.now().difference(statusSince!) : null;

  MonitoringStatusItem copyWith({
    NocStatus? status,
    MonitoringMetric? lastMetric,
    DateTime? lastPolledAt,
    NocStatus? previousStatus,
    bool? maintenance,
    DateTime? snoozedUntil,
    DateTime? statusSince,
    bool clearSnooze = false,
  }) {
    return MonitoringStatusItem(
      configId: configId,
      title: title,
      groupName: groupName,
      sensorId: sensorId,
      status: status ?? this.status,
      lastMetric: lastMetric ?? this.lastMetric,
      lastPolledAt: lastPolledAt ?? this.lastPolledAt,
      previousStatus: previousStatus ?? this.previousStatus,
      maintenance: maintenance ?? this.maintenance,
      snoozedUntil: clearSnooze ? null : (snoozedUntil ?? this.snoozedUntil),
      statusSince: statusSince ?? this.statusSince,
    );
  }
}
