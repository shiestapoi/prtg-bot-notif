import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../models/monitoring_config.dart';
import '../providers/monitoring_provider.dart';
import '../providers/settings_provider.dart';
import '../services/background_service.dart';
import '../services/config_storage_service.dart';

class ConfigPage extends StatefulWidget {
  const ConfigPage({super.key});

  @override
  State<ConfigPage> createState() => _ConfigPageState();
}

class _ConfigPageState extends State<ConfigPage> with SingleTickerProviderStateMixin {
  late TabController _tabController;
  List<MonitoringConfig> _configs = [];
  List<MonitoringGroup> _groups = [];
  bool _isLoading = true;
  bool _selectionMode = false;
  final Set<int> _selectedIds = {};

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    _loadData();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  void _toggleSelection(int configId) {
    setState(() {
      if (_selectedIds.contains(configId)) {
        _selectedIds.remove(configId);
        if (_selectedIds.isEmpty) _selectionMode = false;
      } else {
        _selectedIds.add(configId);
      }
    });
  }

  void _selectAll() {
    setState(() {
      _selectedIds.addAll(_configs.map((c) => c.id));
    });
  }

  void _deselectAll() {
    setState(() {
      _selectedIds.clear();
      _selectionMode = false;
    });
  }

  Future<void> _batchUpdate() async {
    if (_selectedIds.isEmpty) return;

    double? thresholdDown;
    double? thresholdLow;
    bool? enabled;
    bool? maintenance;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        return StatefulBuilder(
          builder: (ctx, setDialogState) {
            return AlertDialog(
              title: Text('Batch Update (${_selectedIds.length} sensor)'),
              content: SingleChildScrollView(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Kosongkan field yang tidak ingin diubah', style: TextStyle(fontSize: 11, color: Colors.grey)),
                    const SizedBox(height: 12),
                    TextField(
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Threshold Down (Mbit/s)',
                        hintText: 'Kosongkan jika tidak diubah',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (v) => thresholdDown = double.tryParse(v),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      keyboardType: const TextInputType.numberWithOptions(decimal: true),
                      decoration: const InputDecoration(
                        labelText: 'Threshold Low Traffic (%)',
                        hintText: 'Kosongkan jika tidak diubah',
                        border: OutlineInputBorder(),
                      ),
                      onChanged: (v) => thresholdLow = double.tryParse(v),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<bool?>(
                      value: enabled,
                      decoration: const InputDecoration(
                        labelText: 'Enabled',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: null, child: Text('Tidak diubah')),
                        DropdownMenuItem(value: true, child: Text('Enable')),
                        DropdownMenuItem(value: false, child: Text('Disable')),
                      ],
                      onChanged: (v) => setDialogState(() => enabled = v),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<bool?>(
                      value: maintenance,
                      decoration: const InputDecoration(
                        labelText: 'Maintenance',
                        border: OutlineInputBorder(),
                      ),
                      items: const [
                        DropdownMenuItem(value: null, child: Text('Tidak diubah')),
                        DropdownMenuItem(value: true, child: Text('Maintenance ON')),
                        DropdownMenuItem(value: false, child: Text('Maintenance OFF')),
                      ],
                      onChanged: (v) => setDialogState(() => maintenance = v),
                    ),
                  ],
                ),
              ),
              actions: [
                TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
                FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Update')),
              ],
            );
          },
        );
      },
    );

    if (result != true) return;

    // Apply batch update
    final updateCount = _selectedIds.length;
    for (final id in _selectedIds.toList()) {
      final idx = _configs.indexWhere((c) => c.id == id);
      if (idx < 0) continue;

      var config = _configs[idx];
      if (thresholdDown != null) config = config.copyWith(thresholdDown: thresholdDown);
      if (thresholdLow != null) config = config.copyWith(thresholdLowTraffic: thresholdLow);
      if (enabled != null) config = config.copyWith(enabled: enabled);
      if (maintenance != null) config = config.copyWith(maintenance: maintenance);

      await ConfigStorageService.updateConfig(config);
    }

    _deselectAll();
    await _loadData(reload: true);

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$updateCount sensor diperbarui'), backgroundColor: Colors.green),
      );
    }
  }

  Future<void> _loadData({bool reload = false}) async {
    setState(() => _isLoading = true);
    final configs = await ConfigStorageService.loadConfigs();
    final groups = await ConfigStorageService.loadGroups();
    setState(() {
      _configs = configs;
      _groups = groups;
      _isLoading = false;
    });
    if (reload) {
      _reloadMonitoring();
      // Sync configs to native service for background polling
      BackgroundServiceHelper.syncConfigs();
    }
  }

  /// Reload monitoring provider after config changes
  void _reloadMonitoring() {
    final monitoring = context.read<MonitoringProvider>();
    final settings = context.read<SettingsProvider>();
    if (settings.isConfigured) {
      monitoring.reloadConfigs(settings);
    }
  }

  String _getGroupName(int groupId) {
    final group = _groups.where((g) => g.id == groupId).firstOrNull;
    return group?.name ?? 'Unknown';
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: _selectionMode
            ? Text('${_selectedIds.length} dipilih')
            : const Text('Konfigurasi Sensor'),
        actions: _selectionMode
            ? [
                IconButton(
                  icon: const Icon(Icons.select_all),
                  onPressed: _selectAll,
                  tooltip: 'Select All',
                ),
                IconButton(
                  icon: const Icon(Icons.deselect),
                  onPressed: _deselectAll,
                  tooltip: 'Deselect All',
                ),
                IconButton(
                  icon: const Icon(Icons.edit_note),
                  onPressed: _batchUpdate,
                  tooltip: 'Batch Update',
                ),
              ]
            : null,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Sensors', icon: Icon(Icons.sensors, size: 18)),
            Tab(text: 'Groups', icon: Icon(Icons.folder_outlined, size: 18)),
          ],
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : TabBarView(
              controller: _tabController,
              children: [
                _buildConfigsTab(),
                _buildGroupsTab(),
              ],
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: () {
          if (_tabController.index == 0) {
            _showConfigDialog();
          } else {
            _showGroupDialog();
          }
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  // ─── Configs Tab ─────────────────────────────────────────────────────────

  Widget _buildConfigsTab() {
    if (_configs.isEmpty) {
      return const Center(
        child: Text('Belum ada sensor.\nTekan + untuk menambahkan.',
            textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
      );
    }

    // Group configs by groupId
    final grouped = <int, List<MonitoringConfig>>{};
    for (final config in _configs) {
      grouped.putIfAbsent(config.groupId, () => []).add(config);
    }

    return ListView(
      padding: const EdgeInsets.only(bottom: 80),
      children: grouped.entries.map((entry) {
        final groupName = _getGroupName(entry.key);
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Group header
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              color: Colors.blue.withValues(alpha: 0.1),
              child: Text(
                groupName,
                style: const TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.bold,
                  color: Colors.blue,
                  letterSpacing: 0.5,
                ),
              ),
            ),
            // Config items
            ...entry.value.map((config) => _buildConfigTile(config)),
          ],
        );
      }).toList(),
    );
  }

  Widget _buildConfigTile(MonitoringConfig config) {
    final isSelected = _selectedIds.contains(config.id);

    return ListTile(
      onTap: _selectionMode ? () => _toggleSelection(config.id) : null,
      onLongPress: () {
        setState(() {
          _selectionMode = true;
          _selectedIds.add(config.id);
        });
      },
      selected: isSelected,
      selectedTileColor: Colors.blue.withValues(alpha: 0.1),
      title: Row(
        children: [
          if (_selectionMode)
            Checkbox(
              value: isSelected,
              onChanged: (_) => _toggleSelection(config.id),
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              visualDensity: VisualDensity.compact,
            ),
          Expanded(
            child: Text(config.title, style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w500)),
          ),
          if (config.maintenance)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: Colors.deepPurple.withValues(alpha: 0.15),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: Colors.deepPurple.withValues(alpha: 0.5)),
              ),
              child: const Text('🔧 MAINT', style: TextStyle(fontSize: 9, fontWeight: FontWeight.bold, color: Colors.deepPurple)),
            ),
        ],
      ),
      subtitle: Text(
        'Sensor ID: ${config.sensorId} • Down ≤ ${config.thresholdDown} Mbit/s • Low ≥ ${config.thresholdLowTraffic.toInt()}% drop',
        style: const TextStyle(fontSize: 11, color: Colors.grey),
      ),
      trailing: _selectionMode
          ? null
          : Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                IconButton(
                  icon: const Icon(Icons.edit_outlined, size: 20),
                  onPressed: () => _showConfigDialog(config: config),
                  tooltip: 'Edit',
                ),
                IconButton(
                  icon: const Icon(Icons.delete_outline, size: 20, color: Colors.red),
                  onPressed: () => _confirmDeleteConfig(config),
                  tooltip: 'Hapus',
                ),
              ],
            ),
      leading: _selectionMode
          ? null
          : Icon(
              config.enabled ? Icons.sensors : Icons.sensors_off,
              color: config.maintenance ? Colors.deepPurple : (config.enabled ? Colors.green : Colors.grey),
              size: 20,
            ),
    );
  }

  Future<void> _confirmDeleteConfig(MonitoringConfig config) async {
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus Sensor'),
        content: Text('Hapus "${config.title}" (ID: ${config.sensorId})?'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await ConfigStorageService.deleteConfig(config.id);
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('"${config.title}" dihapus'), backgroundColor: Colors.orange),
        );
      }
    }
  }

  Future<void> _showConfigDialog({MonitoringConfig? config}) async {
    final isEdit = config != null;
    final titleCtrl = TextEditingController(text: config?.title ?? '');
    final sensorIdCtrl = TextEditingController(text: config?.sensorId.toString() ?? '');
    final thresholdDownCtrl = TextEditingController(text: (config?.thresholdDown ?? 0.0).toString());
    final thresholdLowCtrl = TextEditingController(text: (config?.thresholdLowTraffic ?? 80.0).toString());
    int selectedGroupId = config?.groupId ?? (_groups.isNotEmpty ? _groups.first.id : 0);
    bool enabled = config?.enabled ?? true;
    bool maintenance = config?.maintenance ?? false;

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: Text(isEdit ? 'Edit Sensor' : 'Tambah Sensor'),
          content: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextField(
                  controller: titleCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Title',
                    hintText: 'e.g. LL INDOSAT',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: sensorIdCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Sensor ID',
                    hintText: 'e.g. 2669',
                    border: OutlineInputBorder(),
                  ),
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<int>(
                  initialValue: _groups.any((g) => g.id == selectedGroupId) ? selectedGroupId : null,
                  decoration: const InputDecoration(
                    labelText: 'Group',
                    border: OutlineInputBorder(),
                  ),
                  items: _groups.map((g) => DropdownMenuItem(
                    value: g.id,
                    child: Text(g.name),
                  )).toList(),
                  onChanged: (v) {
                    if (v != null) setDialogState(() => selectedGroupId = v);
                  },
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: thresholdDownCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Threshold Down (Mbit/s)',
                    hintText: '0 = no traffic means DOWN',
                    border: OutlineInputBorder(),
                    helperText: 'Traffic ≤ value = DOWN/NO_TRAFFIC',
                  ),
                ),
                const SizedBox(height: 12),
                TextField(
                  controller: thresholdLowCtrl,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Threshold Low Traffic (%)',
                    hintText: '80',
                    border: OutlineInputBorder(),
                    helperText: 'Traffic turun ≥ value% dari rata-rata = LOW_TRAFFIC',
                  ),
                ),
                const SizedBox(height: 12),
                SwitchListTile(
                  title: const Text('Enabled'),
                  value: enabled,
                  onChanged: (v) => setDialogState(() => enabled = v),
                  contentPadding: EdgeInsets.zero,
                ),
                SwitchListTile(
                  title: const Text('🔧 Maintenance Mode'),
                  subtitle: const Text(
                    'Skip alarm & notification',
                    style: TextStyle(fontSize: 11, color: Colors.grey),
                  ),
                  value: maintenance,
                  activeTrackColor: Colors.deepPurple.withValues(alpha: 0.5),
                  onChanged: (v) => setDialogState(() => maintenance = v),
                  contentPadding: EdgeInsets.zero,
                ),
              ],
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
            FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(isEdit ? 'Simpan' : 'Tambah')),
          ],
        ),
      ),
    );

    if (result == true) {
      final title = titleCtrl.text.trim();
      final sensorId = int.tryParse(sensorIdCtrl.text.trim()) ?? 0;
      final thresholdDown = double.tryParse(thresholdDownCtrl.text.trim()) ?? 0.0;
      final thresholdLow = double.tryParse(thresholdLowCtrl.text.trim()) ?? 80.0;

      if (title.isEmpty || sensorId == 0) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Title dan Sensor ID wajib diisi'), backgroundColor: Colors.red),
          );
        }
        return;
      }

      if (isEdit) {
        await ConfigStorageService.updateConfig(config.copyWith(
          title: title,
          sensorId: sensorId,
          groupId: selectedGroupId,
          thresholdDown: thresholdDown,
          thresholdLowTraffic: thresholdLow,
          enabled: enabled,
          maintenance: maintenance,
        ));
      } else {
        await ConfigStorageService.addConfig(MonitoringConfig(
          id: 0, // will be auto-generated
          title: title,
          sensorId: sensorId,
          groupId: selectedGroupId,
          thresholdDown: thresholdDown,
          thresholdLowTraffic: thresholdLow,
          enabled: enabled,
          maintenance: maintenance,
        ));
      }

      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isEdit ? 'Sensor diperbarui' : 'Sensor ditambahkan'),
            backgroundColor: Colors.green,
          ),
        );
      }
    }
  }

  // ─── Groups Tab ──────────────────────────────────────────────────────────

  Widget _buildGroupsTab() {
    if (_groups.isEmpty) {
      return const Center(
        child: Text('Belum ada group.\nTekan + untuk menambahkan.',
            textAlign: TextAlign.center, style: TextStyle(color: Colors.grey)),
      );
    }

    return ListView.builder(
      padding: const EdgeInsets.only(bottom: 80),
      itemCount: _groups.length,
      itemBuilder: (context, index) {
        final group = _groups[index];
        final configCount = _configs.where((c) => c.groupId == group.id).length;
        return ListTile(
          leading: const Icon(Icons.folder_outlined, color: Colors.blue),
          title: Text(group.name, style: const TextStyle(fontWeight: FontWeight.w500)),
          subtitle: Text('$configCount sensor', style: const TextStyle(fontSize: 11, color: Colors.grey)),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: const Icon(Icons.edit_outlined, size: 20),
                onPressed: () => _showGroupDialog(group: group),
                tooltip: 'Edit',
              ),
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 20, color: Colors.red),
                onPressed: () => _confirmDeleteGroup(group),
                tooltip: 'Hapus',
              ),
            ],
          ),
        );
      },
    );
  }

  Future<void> _confirmDeleteGroup(MonitoringGroup group) async {
    final configCount = _configs.where((c) => c.groupId == group.id).length;
    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus Group'),
        content: Text(
          'Hapus group "${group.name}"?\n'
          '${configCount > 0 ? '⚠️ $configCount sensor dalam group ini akan kehilangan group.' : ''}',
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: Colors.red),
            child: const Text('Hapus'),
          ),
        ],
      ),
    );

    if (confirm == true) {
      await ConfigStorageService.deleteGroup(group.id);
      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Group "${group.name}" dihapus'), backgroundColor: Colors.orange),
        );
      }
    }
  }

  Future<void> _showGroupDialog({MonitoringGroup? group}) async {
    final isEdit = group != null;
    final nameCtrl = TextEditingController(text: group?.name ?? '');

    final result = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(isEdit ? 'Edit Group' : 'Tambah Group'),
        content: TextField(
          controller: nameCtrl,
          decoration: const InputDecoration(
            labelText: 'Nama Group',
            hintText: 'e.g. PEKANBARU',
            border: OutlineInputBorder(),
          ),
          textCapitalization: TextCapitalization.characters,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Batal')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: Text(isEdit ? 'Simpan' : 'Tambah')),
        ],
      ),
    );

    if (result == true) {
      final name = nameCtrl.text.trim().toUpperCase();
      if (name.isEmpty) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Nama group wajib diisi'), backgroundColor: Colors.red),
          );
        }
        return;
      }

      if (isEdit) {
        await ConfigStorageService.updateGroup(group.copyWith(name: name));
      } else {
        await ConfigStorageService.addGroup(MonitoringGroup(id: 0, name: name));
      }

      await _loadData();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(isEdit ? 'Group diperbarui' : 'Group ditambahkan'),
            backgroundColor: Colors.green,
          ),
        );
      }
    }
  }
}
