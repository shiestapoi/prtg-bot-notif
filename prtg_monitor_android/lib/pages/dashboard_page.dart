import 'dart:async';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:intl/intl.dart';
import 'package:photo_view/photo_view.dart';
import 'package:share_plus/share_plus.dart';

import '../models/monitoring_config.dart';
import '../providers/monitoring_provider.dart';
import '../providers/settings_provider.dart';
import '../services/alarm_service.dart';
import '../services/config_storage_service.dart';
import '../services/history_storage_service.dart';
import '../services/prtg_api_service.dart';

enum ViewMode { grid, compact, list }

class DashboardPage extends StatefulWidget {
  const DashboardPage({super.key});

  @override
  State<DashboardPage> createState() => _DashboardPageState();
}

class _DashboardPageState extends State<DashboardPage> {
  String _selectedGroup = 'ALL';
  ViewMode _viewMode = ViewMode.grid;
  Timer? _reconnectTimer;
  int _reconnectCountdown = 0;

  @override
  void initState() {
    super.initState();
    _startReconnectTimer();
  }

  @override
  void dispose() {
    _reconnectTimer?.cancel();
    super.dispose();
  }

  void _startReconnectTimer() {
    // Update every 10 seconds (not 1s) to avoid excessive rebuilds that cause chart blinking
    _reconnectTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (mounted) {
        final monitoring = context.read<MonitoringProvider>();
        setState(() {
          _reconnectCountdown = monitoring.secondsUntilNextPoll;
        });
      }
    });
  }

  String _formatAgo(DateTime time) {
    final diff = DateTime.now().difference(time);
    if (diff.inSeconds < 5) return 'just now';
    if (diff.inSeconds < 60) return '${diff.inSeconds}s ago';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    return '${diff.inHours}h ago';
  }

  void _showDetail(MonitoringStatusItem item, SettingsProvider settings) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: const Color(0xFF1A1A2E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (ctx) => _DetailSheet(item: item, settings: settings),
    );
  }

  @override
  Widget build(BuildContext context) {
    final monitoring = context.watch<MonitoringProvider>();
    final settings = context.watch<SettingsProvider>();

    if (!settings.isConfigured) {
      return _buildNotConfigured();
    }

    final filteredItems = _selectedGroup == 'ALL'
        ? monitoring.sortedItems
        : _selectedGroup == 'MAINTENANCE'
            ? monitoring.sortedItems.where((i) => i.maintenance).toList()
            : monitoring.sortedItems
                .where((i) => i.groupName == _selectedGroup)
                .toList();

    final hasDown = monitoring.downCount > 0;

    return Scaffold(
      backgroundColor: hasDown
          ? const Color(0xFF0A0A0F).withValues(alpha: 0.95)
          : const Color(0xFF0A0A0F),
      body: SafeArea(
        child: Column(
          children: [
            _buildHeader(monitoring, settings),
            // Reconnect indicator
            if (!monitoring.isConnected && monitoring.isPolling)
              _buildReconnectBanner(),
            _buildStatusSummary(monitoring),
            if (monitoring.groups.length > 2) _buildGroupFilter(monitoring),
            Expanded(
              child: filteredItems.isEmpty && !monitoring.isPolling
                  ? const Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          CircularProgressIndicator(strokeWidth: 2),
                          SizedBox(height: 12),
                          Text('Memulai monitoring...', style: TextStyle(color: Colors.grey)),
                        ],
                      ),
                    )
                  : filteredItems.isEmpty
                      ? const Center(
                          child: Text('Tidak ada sensor aktif', style: TextStyle(color: Colors.grey)),
                        )
                  : RefreshIndicator(
                      onRefresh: monitoring.refresh,
                      child: _buildContent(filteredItems, settings),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildReconnectBanner() {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      color: Colors.orange.withValues(alpha: 0.15),
      child: Row(
        children: [
          const SizedBox(
            width: 14,
            height: 14,
            child: CircularProgressIndicator(strokeWidth: 2, color: Colors.orange),
          ),
          const SizedBox(width: 8),
          Text(
            'Reconnecting... ${_reconnectCountdown > 0 ? '(${_reconnectCountdown}s)' : ''}',
            style: const TextStyle(fontSize: 12, color: Colors.orange, fontWeight: FontWeight.w500),
          ),
        ],
      ),
    );
  }

  Widget _buildContent(List<MonitoringStatusItem> items, SettingsProvider settings) {
    switch (_viewMode) {
      case ViewMode.grid:
        return _buildGridView(items, settings);
      case ViewMode.compact:
        return _buildCompactView(items, settings);
      case ViewMode.list:
        return _buildListView(items, settings);
    }
  }

  Widget _buildGridView(List<MonitoringStatusItem> items, SettingsProvider settings) {
    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return GestureDetector(
          onTap: () => _showDetail(item, settings),
          child: _GridCard(item: item, settings: settings),
        );
      },
    );
  }

  Widget _buildCompactView(List<MonitoringStatusItem> items, SettingsProvider settings) {
    final screenWidth = MediaQuery.of(context).size.width;
    final crossAxisCount = screenWidth > 600 ? 3 : 2;

    return GridView.builder(
      padding: const EdgeInsets.all(6),
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: crossAxisCount,
        childAspectRatio: 1.3,
        crossAxisSpacing: 6,
        mainAxisSpacing: 6,
      ),
      itemCount: items.length,
      itemBuilder: (context, index) {
        final item = items[index];
        return GestureDetector(
          onTap: () => _showDetail(item, settings),
          child: _CompactCard(item: item),
        );
      },
    );
  }

  Widget _buildListView(List<MonitoringStatusItem> items, SettingsProvider settings) {
    return ListView.builder(
      padding: const EdgeInsets.all(8),
      itemCount: items.length + 1,
      itemBuilder: (context, index) {
        if (index == 0) return _buildListHeader();
        final item = items[index - 1];
        return GestureDetector(
          onTap: () => _showDetail(item, settings),
          child: _ListRow(item: item),
        );
      },
    );
  }

  Widget _buildListHeader() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      decoration: BoxDecoration(
        color: Colors.blue.withValues(alpha: 0.1),
        borderRadius: BorderRadius.circular(6),
      ),
      child: const Row(
        children: [
          Expanded(flex: 3, child: Text('SENSOR', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey))),
          Expanded(flex: 2, child: Text('GROUP', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey))),
          Expanded(flex: 2, child: Text('TRAFFIC', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey))),
          Expanded(flex: 2, child: Text('STATUS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: Colors.grey), textAlign: TextAlign.end)),
        ],
      ),
    );
  }

  Widget _buildNotConfigured() {
    return const Scaffold(
      body: Center(
        child: Padding(
          padding: EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Icon(Icons.settings_outlined, size: 64, color: Colors.grey),
              SizedBox(height: 16),
              Text('Belum Dikonfigurasi', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold, color: Colors.white)),
              SizedBox(height: 8),
              Text('Buka tab Settings untuk mengatur koneksi PRTG', textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildHeader(MonitoringProvider monitoring, SettingsProvider settings) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        children: [
          const Text('PRTG MONITOR', style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: Colors.white, letterSpacing: 1)),
          const SizedBox(width: 6),
          Container(
            width: 7, height: 7,
            decoration: BoxDecoration(shape: BoxShape.circle, color: monitoring.isConnected ? Colors.green : Colors.red),
          ),
          const SizedBox(width: 3),
          Text(monitoring.isConnected ? 'LIVE' : '—', style: TextStyle(fontSize: 9, color: monitoring.isConnected ? Colors.green : Colors.red)),
          const Spacer(),
          _buildViewModeToggle(),
          const SizedBox(width: 8),
          if (monitoring.lastPollTime != null)
            Column(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: [
                Text(DateFormat('HH:mm:ss').format(monitoring.lastPollTime!), style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, fontFamily: 'monospace', color: Colors.white70)),
                Text(_formatAgo(monitoring.lastPollTime!), style: const TextStyle(fontSize: 9, color: Colors.grey)),
              ],
            ),
        ],
      ),
    );
  }

  Widget _buildViewModeToggle() {
    return Container(
      decoration: BoxDecoration(color: const Color(0xFF1A1A2E), borderRadius: BorderRadius.circular(8)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _viewModeButton(ViewMode.grid, Icons.view_agenda, 'Grid'),
          _viewModeButton(ViewMode.compact, Icons.grid_view, 'Compact'),
          _viewModeButton(ViewMode.list, Icons.view_list, 'List'),
        ],
      ),
    );
  }

  Widget _viewModeButton(ViewMode mode, IconData icon, String tooltip) {
    final isSelected = _viewMode == mode;
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: () => setState(() => _viewMode = mode),
        borderRadius: BorderRadius.circular(6),
        child: Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: isSelected ? Colors.blue.withValues(alpha: 0.3) : Colors.transparent,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, size: 16, color: isSelected ? Colors.blue : Colors.grey),
        ),
      ),
    );
  }

  Widget _buildStatusSummary(MonitoringProvider monitoring) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Row(
        children: [
          if (monitoring.downCount > 0)
            _StatusBadge(label: '${monitoring.downCount} DOWN', color: Colors.red),
          if (monitoring.warningCount > 0)
            _StatusBadge(label: '${monitoring.warningCount} LOW', color: Colors.orange),
          _StatusBadge(label: '${monitoring.normalCount} OK', color: Colors.green),
          const Spacer(),
          IconButton(
            icon: Icon(AlarmService().enabled ? Icons.volume_up : Icons.volume_off, color: AlarmService().enabled ? Colors.green : Colors.grey, size: 18),
            onPressed: () { AlarmService().setEnabled(!AlarmService().enabled); setState(() {}); },
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            padding: EdgeInsets.zero,
          ),
          IconButton(
            icon: const Icon(Icons.notifications_active, size: 18, color: Colors.red),
            onPressed: () => AlarmService().play(),
            constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
            padding: EdgeInsets.zero,
          ),
        ],
      ),
    );
  }

  Widget _buildGroupFilter(MonitoringProvider monitoring) {
    return SizedBox(
      height: 34,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 8),
        itemCount: monitoring.groups.length,
        itemBuilder: (context, index) {
          final group = monitoring.groups[index];
          final isSelected = group == _selectedGroup;
          return Padding(
            padding: const EdgeInsets.symmetric(horizontal: 3),
            child: FilterChip(
              label: Text(group, style: TextStyle(fontSize: 10, color: isSelected ? Colors.white : Colors.grey)),
              selected: isSelected,
              onSelected: (_) => setState(() => _selectedGroup = group),
              backgroundColor: const Color(0xFF1A1A2E),
              selectedColor: Colors.blue.shade700,
              padding: const EdgeInsets.symmetric(horizontal: 2),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
          );
        },
      ),
    );
  }
}

// ─── Detail Bottom Sheet ───────────────────────────────────────────────────

class _DetailSheet extends StatefulWidget {
  final MonitoringStatusItem item;
  final SettingsProvider settings;

  const _DetailSheet({required this.item, required this.settings});

  @override
  State<_DetailSheet> createState() => _DetailSheetState();
}

class _DetailSheetState extends State<_DetailSheet> {
  List<HistoryEntry> _history = [];

  @override
  void initState() {
    super.initState();
    _loadHistory();
  }

  Future<void> _loadHistory() async {
    final history = await HistoryStorageService.getHistory(widget.item.configId);
    setState(() {
      // Show last 10 entries, newest first
      _history = history.reversed.take(10).toList();
    });
  }

  Future<void> _toggleMaintenance() async {
    final configs = await ConfigStorageService.loadConfigs();
    final idx = configs.indexWhere((c) => c.id == widget.item.configId);
    if (idx < 0) return;

    final config = configs[idx];
    final updated = config.copyWith(maintenance: !config.maintenance);
    await ConfigStorageService.updateConfig(updated);

    if (mounted) {
      Navigator.pop(context);
      // Reload monitoring
      final monitoring = context.read<MonitoringProvider>();
      final settings = context.read<SettingsProvider>();
      await monitoring.reloadConfigs(settings);
    }
  }

  void _showSnoozeOptions() {
    showModalBottomSheet(
      context: context,
      backgroundColor: const Color(0xFF1A1A2E),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(16)),
      ),
      builder: (ctx) => Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('Snooze Alarm', style: TextStyle(fontSize: 16, fontWeight: FontWeight.bold, color: Colors.white)),
            const SizedBox(height: 4),
            const Text('Alarm tidak akan berbunyi selama durasi snooze', style: TextStyle(fontSize: 12, color: Colors.grey)),
            const SizedBox(height: 12),
            _snoozeOption(ctx, '15 menit', const Duration(minutes: 15)),
            _snoozeOption(ctx, '30 menit', const Duration(minutes: 30)),
            _snoozeOption(ctx, '1 jam', const Duration(hours: 1)),
            _snoozeOption(ctx, '2 jam', const Duration(hours: 2)),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }

  Widget _snoozeOption(BuildContext ctx, String label, Duration duration) {
    return ListTile(
      leading: const Icon(Icons.snooze, color: Colors.amber),
      title: Text(label, style: const TextStyle(color: Colors.white)),
      onTap: () {
        final monitoring = context.read<MonitoringProvider>();
        monitoring.snoozeConfig(widget.item.configId, duration);
        Navigator.pop(ctx);
        Navigator.pop(context);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('${widget.item.title} di-snooze selama $label'),
            backgroundColor: Colors.amber.shade700,
          ),
        );
      },
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    );
  }

  Future<void> _exportHistory() async {
    try {
      final history = await HistoryStorageService.getHistory(widget.item.configId);
      final entries = history.reversed.take(50).toList();

      if (entries.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Tidak ada data history'), backgroundColor: Colors.orange),
          );
        }
        return;
      }

      final buffer = StringBuffer();
      buffer.writeln('Timestamp,Status,Total Traffic (bit/s),Inbound (bit/s),Outbound (bit/s)');
      for (final entry in entries) {
        buffer.writeln(
          '${entry.timestamp.toIso8601String()},'
          '${entry.status.label},'
          '${entry.totalTrafficBitrate?.toStringAsFixed(0) ?? ''},'
          '${entry.inboundBitrate?.toStringAsFixed(0) ?? ''},'
          '${entry.outboundBitrate?.toStringAsFixed(0) ?? ''}',
        );
      }

      await Share.share(
        buffer.toString(),
        subject: 'PRTG History - ${widget.item.title}',
      );
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal export: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  Future<void> _shareStatus() async {
    try {
      final item = widget.item;
      final totalTraffic = item.lastMetric?.totalTrafficBitrate;
      final trafficStr = totalTraffic != null
          ? '${(totalTraffic / 1000000).toStringAsFixed(2)} Mbit/s'
          : 'N/A';

      final message = '📡 PRTG Monitor Status\n'
          '━━━━━━━━━━━━━━━━━━━━\n'
          '🏷️ Sensor: ${item.title}\n'
          '📁 Group: ${item.groupName}\n'
          '📊 Status: ${item.status.label}\n'
          '📈 Traffic: $trafficStr\n'
          '🕐 Last Poll: ${item.lastPolledAt != null ? DateFormat('HH:mm:ss dd/MM/yyyy').format(item.lastPolledAt!) : 'N/A'}\n'
          '🆔 Sensor ID: ${item.sensorId}';

      await Share.share(message);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gagal share: $e'), backgroundColor: Colors.red),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final item = widget.item;
    final settings = widget.settings;

    final cacheKey = item.lastPolledAt?.millisecondsSinceEpoch ?? 0;
    final chartUrl = '${PrtgApiService(
      baseUrl: settings.baseUrl,
      username: settings.username,
      passhash: settings.passhash,
    ).getChartUrl(item.sensorId, width: 900, height: 350)}&_t=$cacheKey';

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (context, scrollController) {
        return SingleChildScrollView(
          controller: scrollController,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Handle bar
                Center(
                  child: Container(
                    width: 40, height: 4,
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(color: Colors.grey.shade600, borderRadius: BorderRadius.circular(2)),
                  ),
                ),

                // Title + Status
                Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              if (item.maintenance) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  margin: const EdgeInsets.only(right: 8),
                                  decoration: BoxDecoration(
                                    color: Colors.deepPurple.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(color: Colors.deepPurple),
                                  ),
                                  child: const Text('🔧 MAINTENANCE', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.deepPurple)),
                                ),
                              ],
                              if (item.isSnoozed) ...[
                                Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                                  decoration: BoxDecoration(
                                    color: Colors.amber.withValues(alpha: 0.2),
                                    borderRadius: BorderRadius.circular(4),
                                    border: Border.all(color: Colors.amber),
                                  ),
                                  child: const Text('💤 SNOOZED', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.amber)),
                                ),
                              ],
                            ],
                          ),
                          if (item.maintenance || item.isSnoozed) const SizedBox(height: 4),
                          Text(item.title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white)),
                          const SizedBox(height: 2),
                          Text(item.groupName, style: const TextStyle(fontSize: 13, color: Colors.grey)),
                        ],
                      ),
                    ),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: item.maintenance
                            ? Colors.deepPurple.withValues(alpha: 0.2)
                            : _statusColor(item.status).withValues(alpha: 0.2),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: item.maintenance ? Colors.deepPurple : _statusColor(item.status)),
                      ),
                      child: Text(
                        item.maintenance ? 'MAINTENANCE' : item.status.label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.bold,
                          color: item.maintenance ? Colors.deepPurple : _statusColor(item.status),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 16),

                // Chart (large) — tap to zoom — using CachedNetworkImage
                GestureDetector(
                  onTap: () => _openChartZoom(context, chartUrl),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: Container(
                      width: double.infinity,
                      height: 200,
                      color: const Color(0xFF0F0F1A),
                      child: Stack(
                        children: [
                          Image.network(
                            chartUrl,
                            fit: BoxFit.contain,
                            width: double.infinity,
                            height: 200,
                            gaplessPlayback: true,
                            loadingBuilder: (context, child, lp) {
                              if (lp == null) return child;
                              return const Center(child: CircularProgressIndicator(strokeWidth: 2));
                            },
                            errorBuilder: (context, error, stackTrace) => const Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(Icons.broken_image_outlined, color: Colors.grey, size: 32),
                                  SizedBox(height: 4),
                                  Text('Chart tidak tersedia', style: TextStyle(fontSize: 11, color: Colors.grey)),
                                ],
                              ),
                            ),
                          ),
                          // Zoom hint
                          const Positioned(
                            right: 8,
                            bottom: 8,
                            child: Icon(Icons.zoom_in, color: Colors.white54, size: 20),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // Metrics
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F0F1A),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      _detailRow('Total Traffic', _formatBitrate(item.lastMetric?.totalTrafficBitrate), Colors.white),
                      const Divider(color: Colors.grey, height: 16),
                      _detailRow('Inbound', _formatBitrate(item.lastMetric?.inboundBitrate), Colors.green.shade300),
                      const Divider(color: Colors.grey, height: 16),
                      _detailRow('Outbound', _formatBitrate(item.lastMetric?.outboundBitrate), Colors.blue.shade300),
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // Info
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: const Color(0xFF0F0F1A),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Column(
                    children: [
                      _detailRow('Sensor ID', '${item.sensorId}', Colors.cyan),
                      const Divider(color: Colors.grey, height: 16),
                      _detailRow('Last Polled', item.lastPolledAt != null ? DateFormat('HH:mm:ss dd/MM').format(item.lastPolledAt!) : '—', Colors.white70),
                      if (item.statusSince != null && item.status != NocStatus.loading) ...[
                        const Divider(color: Colors.grey, height: 16),
                        _detailRow(
                          item.status.isCritical ? '⏱️ Downtime' : '✅ Uptime',
                          _formatStatusDuration(item.statusSince!),
                          item.status.isCritical ? Colors.red.shade300 : Colors.green.shade300,
                        ),
                      ],
                      if (item.previousStatus != null) ...[
                        const Divider(color: Colors.grey, height: 16),
                        _detailRow('Previous Status', item.previousStatus!.label, _statusColor(item.previousStatus!)),
                      ],
                    ],
                  ),
                ),

                const SizedBox(height: 12),

                // Action buttons row: Snooze, Share, Export
                Row(
                  children: [
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _showSnoozeOptions,
                        icon: const Icon(Icons.snooze, size: 16, color: Colors.amber),
                        label: const Text('Snooze', style: TextStyle(fontSize: 12, color: Colors.amber)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.amber),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _shareStatus,
                        icon: const Icon(Icons.share, size: 16, color: Colors.cyan),
                        label: const Text('Share', style: TextStyle(fontSize: 12, color: Colors.cyan)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.cyan),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: OutlinedButton.icon(
                        onPressed: _exportHistory,
                        icon: const Icon(Icons.file_download_outlined, size: 16, color: Colors.teal),
                        label: const Text('Export', style: TextStyle(fontSize: 12, color: Colors.teal)),
                        style: OutlinedButton.styleFrom(
                          side: const BorderSide(color: Colors.teal),
                          padding: const EdgeInsets.symmetric(vertical: 10),
                        ),
                      ),
                    ),
                  ],
                ),

                const SizedBox(height: 12),

                // Maintenance toggle button
                SizedBox(
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    onPressed: _toggleMaintenance,
                    icon: Icon(
                      item.maintenance ? Icons.build_circle_outlined : Icons.build_outlined,
                      size: 18,
                      color: item.maintenance ? Colors.orange : Colors.deepPurple,
                    ),
                    label: Text(
                      item.maintenance ? 'Hapus Maintenance' : 'Tandai Maintenance',
                      style: TextStyle(color: item.maintenance ? Colors.orange : Colors.deepPurple),
                    ),
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: item.maintenance ? Colors.orange : Colors.deepPurple),
                      padding: const EdgeInsets.symmetric(vertical: 12),
                    ),
                  ),
                ),

                const SizedBox(height: 16),

                // History section
                if (_history.isNotEmpty) ...[
                  const Text('Riwayat Polling (10 terakhir)', style: TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white70)),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F0F1A),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Column(
                      children: _history.map((entry) {
                        return Padding(
                          padding: const EdgeInsets.symmetric(vertical: 3),
                          child: Row(
                            children: [
                              Text(
                                DateFormat('HH:mm:ss').format(entry.timestamp),
                                style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.grey),
                              ),
                              const SizedBox(width: 8),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                                decoration: BoxDecoration(
                                  color: _statusColor(entry.status).withValues(alpha: 0.2),
                                  borderRadius: BorderRadius.circular(3),
                                ),
                                child: Text(
                                  entry.status.label,
                                  style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: _statusColor(entry.status)),
                                ),
                              ),
                              const Spacer(),
                              Text(
                                _formatBitrate(entry.totalTrafficBitrate),
                                style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.white70),
                              ),
                            ],
                          ),
                        );
                      }).toList(),
                    ),
                  ),
                ],

                const SizedBox(height: 16),
              ],
            ),
          ),
        );
      },
    );
  }

  void _openChartZoom(BuildContext context, String chartUrl) {
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => Scaffold(
          backgroundColor: Colors.black,
          appBar: AppBar(
            backgroundColor: Colors.black,
            title: Text(widget.item.title, style: const TextStyle(fontSize: 14)),
            leading: IconButton(
              icon: const Icon(Icons.close),
              onPressed: () => Navigator.pop(context),
            ),
          ),
          body: PhotoView(
            imageProvider: NetworkImage(chartUrl),
            backgroundDecoration: const BoxDecoration(color: Colors.black),
            minScale: PhotoViewComputedScale.contained,
            maxScale: PhotoViewComputedScale.covered * 3,
            loadingBuilder: (context, event) => const Center(
              child: CircularProgressIndicator(color: Colors.white),
            ),
            errorBuilder: (context, error, stackTrace) => const Center(
              child: Text('Gagal memuat chart', style: TextStyle(color: Colors.grey)),
            ),
          ),
        ),
      ),
    );
  }

  Widget _detailRow(String label, String value, Color valueColor) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.spaceBetween,
      children: [
        Text(label, style: const TextStyle(fontSize: 13, color: Colors.grey)),
        Text(value, style: TextStyle(fontSize: 14, fontWeight: FontWeight.bold, color: valueColor, fontFamily: 'monospace')),
      ],
    );
  }

  String _formatBitrate(double? bitrate) {
    if (bitrate == null) return '—';
    final mbit = bitrate / 1000000;
    return '${mbit.toStringAsFixed(2)} Mbit/s';
  }
}

// ─── Status Badge ──────────────────────────────────────────────────────────

class _StatusBadge extends StatelessWidget {
  final String label;
  final Color color;

  const _StatusBadge({required this.label, required this.color});

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(right: 6),
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: color)),
    );
  }
}

// ─── Grid Card ─────────────────────────────────────────────────────────────

class _GridCard extends StatelessWidget {
  final MonitoringStatusItem item;
  final SettingsProvider settings;

  const _GridCard({required this.item, required this.settings});

  @override
  Widget build(BuildContext context) {
    // Use lastPolledAt as cache key — image only refreshes when new data arrives
    final cacheKey = item.lastPolledAt?.millisecondsSinceEpoch ?? 0;
    final chartUrl = '${PrtgApiService(
      baseUrl: settings.baseUrl,
      username: settings.username,
      passhash: settings.passhash,
    ).getChartUrl(item.sensorId)}&_t=$cacheKey';

    return Card(
      margin: const EdgeInsets.only(bottom: 8),
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: item.maintenance ? Colors.deepPurple : _borderColor(item.status),
          width: item.maintenance ? 2 : (item.status.isCritical ? 2 : 1),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(item.title, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.bold, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                      Text(item.groupName, style: const TextStyle(fontSize: 10, color: Colors.grey)),
                    ],
                  ),
                ),
                // Snooze badge
                if (item.isSnoozed)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    margin: const EdgeInsets.only(right: 4),
                    decoration: BoxDecoration(
                      color: Colors.amber.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: Colors.amber.withValues(alpha: 0.5)),
                    ),
                    child: const Text('💤', style: TextStyle(fontSize: 9)),
                  ),
                if (item.maintenance)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
                    margin: const EdgeInsets.only(right: 4),
                    decoration: BoxDecoration(
                      color: Colors.deepPurple.withValues(alpha: 0.2),
                      borderRadius: BorderRadius.circular(4),
                      border: Border.all(color: Colors.deepPurple.withValues(alpha: 0.5)),
                    ),
                    child: const Text('🔧 MAINTENANCE', style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: Colors.deepPurple)),
                  )
                else
                  _StatusChip(status: item.status),
              ],
            ),
            const SizedBox(height: 6),
            RepaintBoundary(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(8),
                child: Container(
                  width: double.infinity,
                  height: 120,
                  color: const Color(0xFF0F0F1A),
                  child: Image.network(
                    chartUrl,
                    key: ValueKey('chart_${item.sensorId}_$cacheKey'),
                    fit: BoxFit.cover,
                    gaplessPlayback: true,
                    cacheWidth: 800,
                    loadingBuilder: (context, child, lp) => lp == null ? child : const Center(child: SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))),
                    errorBuilder: (context, e, s) => const Center(child: Icon(Icons.broken_image_outlined, color: Colors.grey, size: 20)),
                  ),
                ),
              ),
            ),
            const SizedBox(height: 6),
            if (item.lastMetric != null)
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  _MetricChip('Total', item.lastMetric?.totalTrafficBitrate, Colors.white),
                  _MetricChip('In', item.lastMetric?.inboundBitrate, Colors.green.shade300),
                  _MetricChip('Out', item.lastMetric?.outboundBitrate, Colors.blue.shade300),
                  if (item.lastPolledAt != null)
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Text(DateFormat('HH:mm').format(item.lastPolledAt!), style: const TextStyle(fontSize: 9, color: Colors.grey, fontFamily: 'monospace')),
                        if (item.statusSince != null && item.status != NocStatus.loading)
                          Text(
                            _formatStatusDuration(item.statusSince!),
                            style: TextStyle(fontSize: 8, fontWeight: FontWeight.bold, color: item.status.isCritical ? Colors.red.shade300 : Colors.green.shade300),
                          ),
                      ],
                    ),
                ],
              )
            else
              const Text('Waiting...', style: TextStyle(fontSize: 10, color: Colors.grey)),
          ],
        ),
      ),
    );
  }
}

// ─── Compact Card ──────────────────────────────────────────────────────────

class _CompactCard extends StatelessWidget {
  final MonitoringStatusItem item;

  const _CompactCard({required this.item});

  @override
  Widget build(BuildContext context) {
    return Card(
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(8),
        side: BorderSide(
          color: item.maintenance ? Colors.deepPurple : _borderColor(item.status),
          width: item.maintenance ? 2 : (item.status.isCritical ? 2 : 1),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(item.title, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.bold, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
                if (item.isSnoozed)
                  const Text('💤', style: TextStyle(fontSize: 9)),
              ],
            ),
            Text(item.groupName, style: const TextStyle(fontSize: 9, color: Colors.grey)),
            const Spacer(),
            if (item.lastMetric != null)
              Text(
                _fmtBitrate(item.lastMetric?.totalTrafficBitrate),
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.bold,
                  fontFamily: 'monospace',
                  color: item.maintenance ? Colors.deepPurple : _statusColor(item.status),
                ),
              )
            else
              const Text('—', style: TextStyle(fontSize: 11, color: Colors.grey)),
            const SizedBox(height: 2),
            if (item.maintenance)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
                decoration: BoxDecoration(
                  color: Colors.deepPurple.withValues(alpha: 0.2),
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: Colors.deepPurple.withValues(alpha: 0.5)),
                ),
                child: const Text('🔧 MAINT', style: TextStyle(fontSize: 7, fontWeight: FontWeight.bold, color: Colors.deepPurple)),
              )
            else
              _StatusChip(status: item.status, small: true),
          ],
        ),
      ),
    );
  }

  String _fmtBitrate(double? b) {
    if (b == null) return '—';
    return '${(b / 1000000).toStringAsFixed(1)} M';
  }
}

// ─── List Row ──────────────────────────────────────────────────────────────

class _ListRow extends StatelessWidget {
  final MonitoringStatusItem item;

  const _ListRow({required this.item});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
      margin: const EdgeInsets.only(bottom: 2),
      decoration: BoxDecoration(
        color: item.maintenance
            ? Colors.deepPurple.withValues(alpha: 0.05)
            : (item.status.isCritical ? Colors.red.withValues(alpha: 0.05) : Colors.transparent),
        border: Border(left: BorderSide(
          color: item.maintenance ? Colors.deepPurple : _statusColor(item.status),
          width: 3,
        )),
      ),
      child: Row(
        children: [
          Expanded(
            flex: 3,
            child: Row(
              children: [
                Expanded(child: Text(item.title, style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w500, color: Colors.white), maxLines: 1, overflow: TextOverflow.ellipsis)),
                if (item.isSnoozed)
                  const Padding(
                    padding: EdgeInsets.only(left: 4),
                    child: Text('💤', style: TextStyle(fontSize: 9)),
                  ),
              ],
            ),
          ),
          Expanded(flex: 2, child: Text(item.groupName, style: const TextStyle(fontSize: 10, color: Colors.grey))),
          Expanded(flex: 2, child: Text(_fmtBitrate(item.lastMetric?.totalTrafficBitrate), style: const TextStyle(fontSize: 10, fontFamily: 'monospace', color: Colors.white70))),
          if (item.maintenance)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 1),
              decoration: BoxDecoration(
                color: Colors.deepPurple.withValues(alpha: 0.2),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.deepPurple.withValues(alpha: 0.5)),
              ),
              child: const Text('🔧', style: TextStyle(fontSize: 7)),
            )
          else
            _StatusChip(status: item.status, small: true),
        ],
      ),
    );
  }

  String _fmtBitrate(double? b) {
    if (b == null) return '—';
    return '${(b / 1000000).toStringAsFixed(1)} M';
  }
}

// ─── Shared Widgets ────────────────────────────────────────────────────────

class _StatusChip extends StatelessWidget {
  final NocStatus status;
  final bool small;

  const _StatusChip({required this.status, this.small = false});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(horizontal: small ? 4 : 6, vertical: small ? 1 : 2),
      decoration: BoxDecoration(
        color: _statusColor(status).withValues(alpha: 0.2),
        borderRadius: BorderRadius.circular(small ? 4 : 6),
        border: Border.all(color: _statusColor(status).withValues(alpha: 0.5)),
      ),
      child: Text(
        status.label,
        style: TextStyle(fontSize: small ? 7 : 8, fontWeight: FontWeight.bold, color: _statusColor(status)),
      ),
    );
  }
}

class _MetricChip extends StatelessWidget {
  final String label;
  final double? value;
  final Color color;

  const _MetricChip(this.label, this.value, this.color);

  @override
  Widget build(BuildContext context) {
    final text = value == null ? '—' : '${(value! / 1000000).toStringAsFixed(1)} M';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 8, color: Colors.grey)),
        Text(text, style: TextStyle(fontSize: 10, fontWeight: FontWeight.bold, color: color, fontFamily: 'monospace')),
      ],
    );
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

String _formatStatusDuration(DateTime since) {
  final diff = DateTime.now().difference(since);
  if (diff.inSeconds < 60) return '${diff.inSeconds}s';
  if (diff.inMinutes < 60) return '${diff.inMinutes}m';
  final h = diff.inHours;
  final m = diff.inMinutes % 60;
  if (h < 24) return '${h}h ${m}m';
  final d = diff.inDays;
  return '${d}d ${h % 24}h';
}

// ─── Color helpers ─────────────────────────────────────────────────────────

Color _statusColor(NocStatus status) {
  switch (status) {
    case NocStatus.down: return Colors.red;
    case NocStatus.noTraffic: return Colors.red.shade300;
    case NocStatus.possibleFlapping: return Colors.orange;
    case NocStatus.highUtilization: return Colors.yellow.shade700;
    case NocStatus.lowTraffic: return Colors.yellow;
    case NocStatus.normal: return Colors.green;
    case NocStatus.loading: return Colors.grey;
  }
}

Color _borderColor(NocStatus status) {
  switch (status) {
    case NocStatus.down: return Colors.red.shade700;
    case NocStatus.noTraffic: return Colors.red.shade400;
    case NocStatus.possibleFlapping: return Colors.orange.shade400;
    case NocStatus.highUtilization: return Colors.yellow.shade700;
    case NocStatus.lowTraffic: return Colors.yellow.shade800;
    case NocStatus.normal: return Colors.grey.shade800;
    case NocStatus.loading: return Colors.grey.shade700;
  }
}
