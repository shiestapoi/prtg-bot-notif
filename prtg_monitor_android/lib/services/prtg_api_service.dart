import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models/monitoring_config.dart';

/// Service for direct PRTG API communication.
/// Uses historicdata.json endpoint with username/passhash authentication.
class PrtgApiService {
  final String baseUrl;
  final String username;
  final String passhash;

  PrtgApiService({
    required this.baseUrl,
    required this.username,
    required this.passhash,
  });

  /// Get the base host URL (scheme + host + port)
  String get _hostUrl {
    final uri = Uri.parse(baseUrl);
    final port = (uri.port != 80 && uri.port != 443) ? ':${uri.port}' : '';
    return '${uri.scheme}://${uri.host}$port';
  }

  /// Get chart image URL for a sensor.
  /// Returns a URL that can be used directly with Image.network().
  /// Matches the exact format from the PRTG web app.
  /// Includes timestamp cache-buster to prevent stale images.
  String getChartUrl(int sensorId, {int width = 800, int height = 300}) {
    final cacheBuster = DateTime.now().millisecondsSinceEpoch;
    return '$_hostUrl/chart.png'
        '?type=graph'
        '&graphid=0'
        '&graphtitle=%40%40notitle%40%40'
        '&width=$width'
        '&height=$height'
        '&bgcolor=%23f3f2f2'
        '&graphstylefile=graphstyling.htm'
        '&animationandinteraction=1'
        '&datastylefile=graphdatastyling.htm'
        '&animationstylefile=graphanimationstyling.htm'
        '&graphstyling=baseFontSize%3D%2710%27%20showLegend%3D%270%27'
        '&tooltexts=1'
        '&datastyling=drawAnchors%3D%271%27%20anchorRadius%3D%271%27%20lineThickness%3D%272%27'
        '&refreshable=true'
        '&columns=datetime%2Cvalue_%2Ccoverage'
        '&_=$cacheBuster'
        '&id=$sensorId'
        '&username=${Uri.encodeComponent(username)}'
        '&passhash=${Uri.encodeComponent(passhash)}';
  }

  /// Build the monitoring URL for a sensor (last 5 minutes of data)
  String _buildMonitoringUrl(int sensorId) {
    final now = DateTime.now();
    final fiveMinAgo = now.subtract(const Duration(minutes: 5));

    String formatDate(DateTime d) {
      return '${d.year}-${d.month.toString().padLeft(2, '0')}-${d.day.toString().padLeft(2, '0')}'
          '-${d.hour.toString().padLeft(2, '0')}-${d.minute.toString().padLeft(2, '0')}'
          '-${d.second.toString().padLeft(2, '0')}';
    }

    return '$_hostUrl/api/historicdata.json'
        '?id=$sensorId'
        '&avg=0'
        '&sdate=${formatDate(fiveMinAgo)}'
        '&edate=${formatDate(now)}'
        '&usecaption=1'
        '&username=${Uri.encodeComponent(username)}'
        '&passhash=${Uri.encodeComponent(passhash)}';
  }

  /// Fetch metrics for a specific sensor
  Future<MonitoringMetric?> fetchMetric(MonitoringConfig config) async {
    try {
      final url = _buildMonitoringUrl(config.sensorId);
      final response = await http.get(
        Uri.parse(url),
        headers: {'Accept': 'application/json'},
      ).timeout(const Duration(seconds: 15));

      if (response.statusCode != 200) {
        return null;
      }

      // Check if response is HTML (login page redirect)
      final contentType = response.headers['content-type'] ?? '';
      if (contentType.contains('text/html')) {
        return null;
      }

      final data = jsonDecode(response.body);
      return _parseMetric(data, config.id);
    } catch (e) {
      return null;
    }
  }

  /// Parse PRTG historicdata.json response into a normalized metric.
  /// Matches the backend MetricParserService logic:
  /// - Uses named keys format (avg=0, usecaption=1)
  /// - Key patterns: "Traffic Total (speed)", "Traffic In (speed)", "Traffic Out (speed)"
  /// - PRTG returns speed values in BYTES/s → multiply by 8 to get bits/s
  MonitoringMetric? _parseMetric(Map<String, dynamic> data, int configId) {
    try {
      final histdata = data['histdata'] as List<dynamic>?;
      if (histdata == null || histdata.isEmpty) return null;

      // Get the last (most recent) entry — PRTG returns ascending order
      final lastEntry = histdata.last as Map<String, dynamic>;

      double? totalBitrate;
      double? inboundBitrate;
      double? outboundBitrate;

      // Named key patterns (same as backend):
      // "Traffic Total (speed)" → total bitrate (value is in Bytes/s)
      // "Traffic In (speed)" → inbound bitrate
      // "Traffic Out (speed)" → outbound bitrate
      final totalSpeedPattern = RegExp(r'traffic\s*total.*(?:speed|bit)', caseSensitive: false);
      final inSpeedPattern = RegExp(r'traffic\s*in.*(?:speed|bit)', caseSensitive: false);
      final outSpeedPattern = RegExp(r'traffic\s*out.*(?:speed|bit)', caseSensitive: false);

      for (final entry in lastEntry.entries) {
        final key = entry.key;
        if (key == 'datetime' || key == 'datetime_raw' || key == 'coverage' || key == 'coverage_raw') continue;

        final numValue = _extractNumericValue(entry.value);
        if (numValue == null) continue;

        if (totalSpeedPattern.hasMatch(key)) {
          // PRTG returns Bytes/s → convert to bits/s (* 8)
          totalBitrate = numValue * 8;
        } else if (inSpeedPattern.hasMatch(key)) {
          inboundBitrate = numValue * 8;
        } else if (outSpeedPattern.hasMatch(key)) {
          outboundBitrate = numValue * 8;
        }
      }

      // If no total but have in/out, calculate total
      if (totalBitrate == null && inboundBitrate != null && outboundBitrate != null) {
        totalBitrate = inboundBitrate + outboundBitrate;
      }

      // Parse timestamp from datetime field
      DateTime timestamp = DateTime.now();
      if (lastEntry.containsKey('datetime_raw') && lastEntry['datetime_raw'] is num) {
        // OLE Automation Date (days since 1899-12-30)
        final oleDate = (lastEntry['datetime_raw'] as num).toDouble();
        const msPerDay = 86400000;
        const oleEpoch = -2209161600000; // DateTime.utc(1899, 12, 30).millisecondsSinceEpoch
        timestamp = DateTime.fromMillisecondsSinceEpoch(
          oleEpoch + (oleDate * msPerDay).round(),
        );
      } else if (lastEntry.containsKey('datetime') && lastEntry['datetime'] is String) {
        final dtStr = lastEntry['datetime'] as String;
        // PRTG format: "DD/MM/YYYY HH:mm:ss"
        final match = RegExp(r'(\d{2})/(\d{2})/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})').firstMatch(dtStr);
        if (match != null) {
          timestamp = DateTime(
            int.parse(match.group(3)!),
            int.parse(match.group(2)!),
            int.parse(match.group(1)!),
            int.parse(match.group(4)!),
            int.parse(match.group(5)!),
            int.parse(match.group(6)!),
          );
        }
      }

      return MonitoringMetric(
        configId: configId,
        totalTrafficBitrate: totalBitrate,
        inboundBitrate: inboundBitrate,
        outboundBitrate: outboundBitrate,
        timestamp: timestamp,
      );
    } catch (e) {
      return null;
    }
  }

  /// Extract a raw numeric value from a PRTG field.
  /// PRTG returns numeric values directly as numbers (not strings with units)
  /// when using the JSON API with usecaption=1.
  double? _extractNumericValue(dynamic value) {
    if (value == null) return null;
    if (value is num) return value.toDouble();
    if (value is String) {
      // Try to parse as plain number first
      final parsed = double.tryParse(value);
      if (parsed != null) return parsed;
    }
    return null;
  }

  /// Test connection to PRTG server
  Future<bool> testConnection() async {
    try {
      final testUrl = '$_hostUrl/api/status.json'
          '?username=${Uri.encodeComponent(username)}'
          '&passhash=${Uri.encodeComponent(passhash)}';

      final response = await http.get(
        Uri.parse(testUrl),
      ).timeout(const Duration(seconds: 10));

      return response.statusCode == 200;
    } catch (e) {
      return false;
    }
  }
}
