import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../providers/settings_provider.dart';
import '../providers/monitoring_provider.dart';
import '../services/prtg_api_service.dart';
import '../services/alarm_service.dart';
import '../services/background_service.dart';

class SettingsPage extends StatefulWidget {
  const SettingsPage({super.key});

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  final _formKey = GlobalKey<FormState>();
  late TextEditingController _urlController;
  late TextEditingController _usernameController;
  late TextEditingController _passhashController;
  bool _isTesting = false;
  bool _testResult = false;
  bool _showTestResult = false;

  @override
  void initState() {
    super.initState();
    final settings = context.read<SettingsProvider>();
    _urlController = TextEditingController(text: settings.baseUrl);
    _usernameController = TextEditingController(text: settings.username);
    _passhashController = TextEditingController(text: settings.passhash);
  }

  @override
  void dispose() {
    _urlController.dispose();
    _usernameController.dispose();
    _passhashController.dispose();
    super.dispose();
  }

  Future<void> _testConnection() async {
    setState(() {
      _isTesting = true;
      _showTestResult = false;
    });

    final api = PrtgApiService(
      baseUrl: _urlController.text.trim(),
      username: _usernameController.text.trim(),
      passhash: _passhashController.text.trim(),
    );

    final result = await api.testConnection();

    setState(() {
      _isTesting = false;
      _testResult = result;
      _showTestResult = true;
    });
  }

  Future<void> _saveSettings() async {
    if (!_formKey.currentState!.validate()) return;

    final settings = context.read<SettingsProvider>();
    final monitoring = context.read<MonitoringProvider>();

    await settings.saveConnection(
      baseUrl: _urlController.text.trim(),
      username: _usernameController.text.trim(),
      passhash: _passhashController.text.trim(),
    );

    // Restart monitoring with new settings
    monitoring.stopPolling();
    monitoring.startPolling(settings);

    // Start background service if enabled
    if (settings.backgroundEnabled) {
      try {
        await BackgroundServiceHelper.initialize();
        await BackgroundServiceHelper.startService();
      } catch (_) {}
    }

    if (mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('Settings disimpan & monitoring dimulai'),
          backgroundColor: Colors.green,
        ),
      );
    }
  }

  Future<void> _addCustomAlarm() async {
    // Show dialog for name first
    final nameCtrl = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Tambah Alarm'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: nameCtrl,
              decoration: const InputDecoration(
                labelText: 'Nama Alarm',
                hintText: 'e.g. Sirene Kantor',
                border: OutlineInputBorder(),
              ),
              autofocus: true,
            ),
            const SizedBox(height: 8),
            const Text(
              'Setelah ini pilih file audio (MP3/WAV/OGG)',
              style: TextStyle(fontSize: 11, color: Colors.grey),
            ),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, nameCtrl.text.trim()),
            child: const Text('Pilih File'),
          ),
        ],
      ),
    );

    if (name == null || name.isEmpty) return;

    final alarm = await AlarmService().addCustomAlarmWithName(name);
    if (alarm != null) {
      setState(() {});
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Alarm "$name" ditambahkan'), backgroundColor: Colors.green),
        );
      }
    }
  }

  Future<void> _editAlarmName(AlarmSound alarm) async {
    final nameCtrl = TextEditingController(text: alarm.label);
    final newName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Edit Nama Alarm'),
        content: TextField(
          controller: nameCtrl,
          decoration: const InputDecoration(
            labelText: 'Nama Alarm',
            border: OutlineInputBorder(),
          ),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Batal')),
          FilledButton(
            onPressed: () => Navigator.pop(ctx, nameCtrl.text.trim()),
            child: const Text('Simpan'),
          ),
        ],
      ),
    );

    if (newName == null || newName.isEmpty) return;
    await AlarmService().renameAlarm(alarm.id, newName);
    setState(() {});
  }

  Future<void> _removeCustomAlarm(AlarmSound alarm) async {
    // Must keep at least 1 alarm
    if (AlarmService().allAlarms.length <= 1) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Harus ada minimal 1 alarm'), backgroundColor: Colors.orange),
      );
      return;
    }

    final confirm = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Hapus Alarm'),
        content: Text('Hapus "${alarm.label}" dari daftar alarm?'),
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
      await AlarmService().removeCustomAlarm(alarm.id);
      setState(() {});
    }
  }

  @override
  Widget build(BuildContext context) {
    final settings = context.watch<SettingsProvider>();
    final alarmService = AlarmService();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Settings'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // ─── PRTG Connection ─────────────────────────────────────
            _buildSectionTitle('Koneksi PRTG'),
            const SizedBox(height: 8),
            Form(
              key: _formKey,
              child: Column(
                children: [
                  _buildTextField(
                    controller: _urlController,
                    label: 'PRTG Base URL',
                    hint: 'http://prtg.example.com/index.htm',
                    icon: Icons.link,
                    validator: (v) =>
                        v == null || v.isEmpty ? 'URL wajib diisi' : null,
                  ),
                  const SizedBox(height: 12),
                  _buildTextField(
                    controller: _usernameController,
                    label: 'Username',
                    hint: 'noc',
                    icon: Icons.person,
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Username wajib diisi' : null,
                  ),
                  const SizedBox(height: 12),
                  _buildTextField(
                    controller: _passhashController,
                    label: 'Passhash',
                    hint: 'PRTG passhash (bukan password)',
                    icon: Icons.key,
                    obscure: true,
                    validator: (v) =>
                        v == null || v.isEmpty ? 'Passhash wajib diisi' : null,
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),

            // Test & Save buttons
            Row(
              children: [
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _isTesting ? null : _testConnection,
                    icon: _isTesting
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Icon(Icons.wifi_find),
                    label: const Text('Test Koneksi'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _saveSettings,
                    icon: const Icon(Icons.save),
                    label: const Text('Simpan'),
                  ),
                ),
              ],
            ),

            // Test result
            if (_showTestResult)
              Container(
                margin: const EdgeInsets.only(top: 8),
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: _testResult
                      ? Colors.green.withValues(alpha: 0.1)
                      : Colors.red.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(8),
                  border: Border.all(
                    color: _testResult ? Colors.green : Colors.red,
                  ),
                ),
                child: Row(
                  children: [
                    Icon(
                      _testResult ? Icons.check_circle : Icons.error,
                      color: _testResult ? Colors.green : Colors.red,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        _testResult
                            ? 'Koneksi berhasil!'
                            : 'Koneksi gagal. Periksa URL dan credentials.',
                        style: TextStyle(
                          color: _testResult ? Colors.green : Colors.red,
                        ),
                      ),
                    ),
                  ],
                ),
              ),

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── Alarm Settings ──────────────────────────────────────
            _buildSectionTitle('Alarm Sound'),
            const SizedBox(height: 8),

            // Alarm enabled toggle
            SwitchListTile(
              title: const Text('Alarm Sound'),
              subtitle: const Text('Bunyi alarm saat ada perubahan status'),
              value: settings.alarmEnabled,
              onChanged: (v) {
                settings.setAlarmEnabled(v);
                alarmService.setEnabled(v);
              },
              contentPadding: EdgeInsets.zero,
            ),

            if (settings.alarmEnabled) ...[
              // Alarm trigger settings
              const SizedBox(height: 4),
              const Text(
                'Alarm berbunyi saat:',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              SwitchListTile(
                title: const Text('DOWN / NO TRAFFIC'),
                subtitle: const Text('Alarm saat link DOWN'),
                value: settings.alarmOnDown,
                onChanged: (v) => settings.setAlarmOnDown(v),
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),
              SwitchListTile(
                title: const Text('LOW TRAFFIC'),
                subtitle: const Text('Alarm saat traffic rendah'),
                value: settings.alarmOnLowTraffic,
                onChanged: (v) => settings.setAlarmOnLowTraffic(v),
                contentPadding: EdgeInsets.zero,
                dense: true,
              ),

              const SizedBox(height: 8),

              // Add custom alarm button
              OutlinedButton.icon(
                onPressed: _addCustomAlarm,
                icon: const Icon(Icons.add, size: 18),
                label: const Text('Tambah Alarm Custom (MP3/WAV)'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size(double.infinity, 44),
                ),
              ),

              const SizedBox(height: 12),

              // Alarm list
              ...alarmService.allAlarms.map((alarm) => _AlarmSoundTile(
                    alarm: alarm,
                    isSelected: alarmService.selectedAlarmId == alarm.id,
                    onSelect: () {
                      alarmService.setSelectedAlarm(alarm.id);
                      settings.setAlarmType(BuiltInAlarm.values.first); // trigger rebuild
                      setState(() {});
                    },
                    onTest: () => alarmService.playTest(alarm),
                    onEdit: () => _editAlarmName(alarm),
                    onDelete: alarmService.allAlarms.length > 1
                        ? () => _removeCustomAlarm(alarm)
                        : null,
                  )),

              const SizedBox(height: 16),

              // Alarm duration
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Durasi Alarm'),
                subtitle: Text('${alarmService.alarmDuration} detik'),
                trailing: DropdownButton<int>(
                  value: alarmService.alarmDuration,
                  items: const [
                    DropdownMenuItem(value: 3, child: Text('3s')),
                    DropdownMenuItem(value: 5, child: Text('5s')),
                    DropdownMenuItem(value: 10, child: Text('10s')),
                    DropdownMenuItem(value: 15, child: Text('15s')),
                    DropdownMenuItem(value: 30, child: Text('30s')),
                    DropdownMenuItem(value: 60, child: Text('60s')),
                  ],
                  onChanged: (v) {
                    if (v != null) {
                      alarmService.setAlarmDuration(v);
                      setState(() {});
                    }
                  },
                ),
              ),

              const SizedBox(height: 8),

              // Vibration toggle
              SwitchListTile(
                title: const Text('Getaran'),
                subtitle: const Text('Getar HP saat alarm berbunyi'),
                value: alarmService.vibrationEnabled,
                onChanged: (v) {
                  alarmService.setVibrationEnabled(v);
                  setState(() {});
                },
                contentPadding: EdgeInsets.zero,
              ),

              // Vibration pattern selector
              if (alarmService.vibrationEnabled) ...[
                const Text('Pola Getaran:', style: TextStyle(fontSize: 12, color: Colors.grey)),
                const SizedBox(height: 4),
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: VibrationPattern.values
                      .where((v) => v != VibrationPattern.none)
                      .map((pattern) {
                    final isSelected = alarmService.vibrationPattern == pattern;
                    return ChoiceChip(
                      label: Text(pattern.label, style: TextStyle(fontSize: 10, color: isSelected ? Colors.white : Colors.grey)),
                      selected: isSelected,
                      onSelected: (_) {
                        alarmService.setVibrationPattern(pattern);
                        // Test vibration
                        if (pattern.pattern.isNotEmpty) {
                          alarmService.play().then((_) => Future.delayed(const Duration(seconds: 2), () => alarmService.stop()));
                        }
                        setState(() {});
                      },
                      selectedColor: Colors.blue.shade700,
                      backgroundColor: const Color(0xFF1A1A2E),
                      visualDensity: VisualDensity.compact,
                    );
                  }).toList(),
                ),
              ],
            ],

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── Notification Settings ───────────────────────────────
            _buildSectionTitle('Notifikasi'),
            const SizedBox(height: 8),

            SwitchListTile(
              title: const Text('Notifikasi DOWN'),
              subtitle: const Text('Tampilkan notif saat link DOWN'),
              value: settings.notifyDown,
              onChanged: (v) => settings.setNotifyDown(v),
              contentPadding: EdgeInsets.zero,
            ),
            SwitchListTile(
              title: const Text('Notifikasi LOW TRAFFIC'),
              subtitle: const Text('Tampilkan notif saat traffic rendah'),
              value: settings.notifyLowTraffic,
              onChanged: (v) => settings.setNotifyLowTraffic(v),
              contentPadding: EdgeInsets.zero,
            ),

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── Escalation Settings ─────────────────────────────────
            _buildSectionTitle('Eskalasi (Re-alarm)'),
            const SizedBox(height: 8),

            SwitchListTile(
              title: const Text('Eskalasi Alarm'),
              subtitle: const Text('Alarm ulang jika sensor masih DOWN'),
              value: settings.escalationEnabled,
              onChanged: (v) => settings.setEscalationEnabled(v),
              contentPadding: EdgeInsets.zero,
            ),

            if (settings.escalationEnabled)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Interval Eskalasi'),
                subtitle: Text('Setiap ${settings.escalationMinutes} menit'),
                trailing: DropdownButton<int>(
                  value: settings.escalationMinutes,
                  items: const [
                    DropdownMenuItem(value: 5, child: Text('5m')),
                    DropdownMenuItem(value: 10, child: Text('10m')),
                    DropdownMenuItem(value: 15, child: Text('15m')),
                    DropdownMenuItem(value: 30, child: Text('30m')),
                    DropdownMenuItem(value: 60, child: Text('60m')),
                  ],
                  onChanged: (v) {
                    if (v != null) settings.setEscalationMinutes(v);
                  },
                ),
              ),

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── Daily Summary Settings ──────────────────────────────
            _buildSectionTitle('Ringkasan Harian'),
            const SizedBox(height: 8),

            SwitchListTile(
              title: const Text('Daily Summary'),
              subtitle: const Text('Notifikasi ringkasan DOWN harian'),
              value: settings.dailySummaryEnabled,
              onChanged: (v) => settings.setDailySummaryEnabled(v),
              contentPadding: EdgeInsets.zero,
            ),

            if (settings.dailySummaryEnabled)
              ListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Waktu Notifikasi'),
                subtitle: Text(
                  '${settings.dailySummaryHour.toString().padLeft(2, '0')}:${settings.dailySummaryMinute.toString().padLeft(2, '0')}',
                ),
                trailing: IconButton(
                  icon: const Icon(Icons.access_time),
                  onPressed: () async {
                    final time = await showTimePicker(
                      context: context,
                      initialTime: TimeOfDay(
                        hour: settings.dailySummaryHour,
                        minute: settings.dailySummaryMinute,
                      ),
                    );
                    if (time != null) {
                      settings.setDailySummaryTime(time.hour, time.minute);
                    }
                  },
                ),
              ),

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── App Lock Settings ───────────────────────────────────
            _buildSectionTitle('Keamanan'),
            const SizedBox(height: 8),

            SwitchListTile(
              title: const Text('App Lock'),
              subtitle: const Text('Kunci app dengan biometrik/PIN'),
              value: settings.appLockEnabled,
              onChanged: (v) => settings.setAppLockEnabled(v),
              contentPadding: EdgeInsets.zero,
            ),

            const SizedBox(height: 24),
            const Divider(color: Colors.grey),
            const SizedBox(height: 16),

            // ─── Polling Settings ────────────────────────────────────
            _buildSectionTitle('Polling'),
            const SizedBox(height: 8),

            ListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Polling Interval'),
              subtitle: Text('Setiap ${settings.pollingInterval} detik'),
              trailing: DropdownButton<int>(
                value: settings.pollingInterval,
                items: const [
                  DropdownMenuItem(value: 30, child: Text('30s')),
                  DropdownMenuItem(value: 60, child: Text('60s')),
                  DropdownMenuItem(value: 120, child: Text('2m')),
                  DropdownMenuItem(value: 300, child: Text('5m')),
                ],
                onChanged: (v) {
                  if (v != null) settings.setPollingInterval(v);
                },
              ),
            ),

            const SizedBox(height: 32),

            // ─── Info ────────────────────────────────────────────────
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: Colors.blue.withValues(alpha: 0.1),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: Colors.blue.withValues(alpha: 0.3)),
              ),
              child: const Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'ℹ️ Cara mendapatkan Passhash:',
                    style: TextStyle(
                      fontWeight: FontWeight.bold,
                      color: Colors.blue,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    '1. Login ke PRTG Web Interface\n'
                    '2. Buka Setup → Account Settings → My Account\n'
                    '3. Scroll ke bawah, cari "Passhash"\n'
                    '4. Copy passhash tersebut',
                    style: TextStyle(fontSize: 12, color: Colors.grey),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 16),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionTitle(String title) {
    return Text(
      title,
      style: const TextStyle(
        fontSize: 16,
        fontWeight: FontWeight.bold,
        color: Colors.white,
      ),
    );
  }

  Widget _buildTextField({
    required TextEditingController controller,
    required String label,
    required String hint,
    required IconData icon,
    bool obscure = false,
    String? Function(String?)? validator,
  }) {
    return TextFormField(
      controller: controller,
      obscureText: obscure,
      validator: validator,
      decoration: InputDecoration(
        labelText: label,
        hintText: hint,
        prefixIcon: Icon(icon),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
        ),
        filled: true,
        fillColor: const Color(0xFF1A1A2E),
      ),
    );
  }
}

/// Tile for displaying an alarm sound option
class _AlarmSoundTile extends StatelessWidget {
  final AlarmSound alarm;
  final bool isSelected;
  final VoidCallback onSelect;
  final VoidCallback onTest;
  final VoidCallback onEdit;
  final VoidCallback? onDelete;

  const _AlarmSoundTile({
    required this.alarm,
    required this.isSelected,
    required this.onSelect,
    required this.onTest,
    required this.onEdit,
    this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 4),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 8),
        leading: Text(alarm.emoji, style: const TextStyle(fontSize: 20)),
        title: Text(alarm.label, style: const TextStyle(fontSize: 13)),
        subtitle: Text(
          alarm.isCustom ? 'Custom' : 'Built-in',
          style: TextStyle(fontSize: 10, color: alarm.isCustom ? Colors.cyan : Colors.grey),
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              icon: const Icon(Icons.play_arrow, size: 18),
              onPressed: onTest,
              tooltip: 'Test',
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              padding: EdgeInsets.zero,
            ),
            IconButton(
              icon: const Icon(Icons.edit_outlined, size: 18),
              onPressed: onEdit,
              tooltip: 'Edit nama',
              constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
              padding: EdgeInsets.zero,
            ),
            if (onDelete != null)
              IconButton(
                icon: const Icon(Icons.delete_outline, size: 18, color: Colors.red),
                onPressed: onDelete,
                tooltip: 'Hapus',
                constraints: const BoxConstraints(minWidth: 32, minHeight: 32),
                padding: EdgeInsets.zero,
              ),
            if (isSelected)
              const Padding(
                padding: EdgeInsets.only(left: 4),
                child: Icon(Icons.check_circle, color: Colors.green, size: 18),
              ),
          ],
        ),
        selected: isSelected,
        selectedTileColor: Colors.blue.withValues(alpha: 0.1),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        onTap: onSelect,
      ),
    );
  }
}
