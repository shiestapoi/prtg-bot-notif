import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:wakelock_plus/wakelock_plus.dart';

import 'services/notification_service.dart';
import 'services/permission_service.dart';
import 'services/alarm_service.dart';
import 'services/background_service.dart';
import 'services/daily_summary_service.dart';
import 'services/app_lock_service.dart';
import 'providers/monitoring_provider.dart';
import 'providers/settings_provider.dart';
import 'pages/dashboard_page.dart';
import 'pages/config_page.dart';
import 'pages/settings_page.dart';

final FlutterLocalNotificationsPlugin flutterLocalNotificationsPlugin =
    FlutterLocalNotificationsPlugin();

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize notifications (creates channels)
  await NotificationService.initialize(flutterLocalNotificationsPlugin);

  // Initialize daily summary service
  await DailySummaryService.initialize(flutterLocalNotificationsPlugin);

  // Load alarm service
  await AlarmService().load();

  runApp(const PrtgMonitorApp());
}

class PrtgMonitorApp extends StatelessWidget {
  const PrtgMonitorApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => SettingsProvider()..load()),
        ChangeNotifierProvider(create: (_) => MonitoringProvider()),
      ],
      child: MaterialApp(
        title: 'PRTG Monitor',
        debugShowCheckedModeBanner: false,
        theme: ThemeData.dark(useMaterial3: true).copyWith(
          scaffoldBackgroundColor: const Color(0xFF0A0A0F),
          colorScheme: ColorScheme.dark(
            primary: Colors.blue.shade400,
            secondary: Colors.cyan.shade400,
            surface: const Color(0xFF1A1A2E),
            error: Colors.red.shade400,
          ),
          appBarTheme: const AppBarTheme(
            backgroundColor: Color(0xFF0A0A0F),
            elevation: 0,
          ),
          cardTheme: CardThemeData(
            color: const Color(0xFF1A1A2E),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
            ),
          ),
        ),
        home: const MainScreen(),
      ),
    );
  }
}

class MainScreen extends StatefulWidget {
  const MainScreen({super.key});

  @override
  State<MainScreen> createState() => _MainScreenState();
}

class _MainScreenState extends State<MainScreen> with WidgetsBindingObserver {
  int _currentIndex = 0;
  bool _isLocked = true; // Start locked — will unlock after auth check
  bool _isAuthenticating = false;

  final _pages = const [
    DashboardPage(),
    ConfigPage(),
    SettingsPage(),
  ];

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);

    // Check app lock on startup
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _initialLockCheck();
    });

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;

      // Request permissions
      PermissionService.requestAll(context);

      // Listen for settings to be loaded, then start monitoring
      final settings = context.read<SettingsProvider>();
      final monitoring = context.read<MonitoringProvider>();

      if (settings.isConfigured) {
        _startMonitoring(settings, monitoring);
      } else {
        // Settings might still be loading — listen for changes
        settings.addListener(() {
          if (settings.isConfigured && !monitoring.isPolling) {
            _startMonitoring(settings, monitoring);
          }
        });
      }
    });
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  /// Check app lock on initial startup
  Future<void> _initialLockCheck() async {
    final settings = context.read<SettingsProvider>();
    // Wait a moment for settings to load
    await Future.delayed(const Duration(milliseconds: 500));
    if (!mounted) return;

    if (settings.appLockEnabled) {
      setState(() => _isLocked = true);
      _checkAppLock();
    } else {
      setState(() => _isLocked = false);
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      WakelockPlus.enable();
      // Tell native service Flutter is alive — stop native polling
      BackgroundServiceHelper.notifyFlutterAlive();
      // App lock: authenticate on resume
      _checkAppLock();
    }
    if (state == AppLifecycleState.paused) {
      _markLocked();
    }
  }

  Future<void> _markLocked() async {
    final settings = context.read<SettingsProvider>();
    if (settings.appLockEnabled) {
      setState(() => _isLocked = true);
    }
  }

  Future<void> _checkAppLock() async {
    if (!_isLocked || _isAuthenticating) return;

    final settings = context.read<SettingsProvider>();
    if (!settings.appLockEnabled) {
      setState(() => _isLocked = false);
      return;
    }

    _isAuthenticating = true;
    try {
      final authenticated = await AppLockService.authenticate();
      if (mounted) {
        setState(() {
          _isLocked = !authenticated;
          _isAuthenticating = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _isLocked = false;
          _isAuthenticating = false;
        });
      }
    }
  }

  Future<void> _startMonitoring(SettingsProvider settings, MonitoringProvider monitoring) async {
    // Start foreground service (persistent notification)
    await BackgroundServiceHelper.startService();

    // Enable wakelock to prevent CPU sleep
    await WakelockPlus.enable();

    // Start polling
    await monitoring.startPolling(settings);
  }

  @override
  Widget build(BuildContext context) {
    // Show lock screen if locked
    if (_isLocked) {
      return _buildLockScreen();
    }

    return Scaffold(
      body: _pages[_currentIndex],
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) => setState(() => _currentIndex = index),
        backgroundColor: const Color(0xFF0F0F1A),
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.monitor_heart_outlined),
            selectedIcon: Icon(Icons.monitor_heart),
            label: 'Monitor',
          ),
          NavigationDestination(
            icon: Icon(Icons.tune_outlined),
            selectedIcon: Icon(Icons.tune),
            label: 'Config',
          ),
          NavigationDestination(
            icon: Icon(Icons.settings_outlined),
            selectedIcon: Icon(Icons.settings),
            label: 'Settings',
          ),
        ],
      ),
    );
  }

  Widget _buildLockScreen() {
    return Scaffold(
      backgroundColor: const Color(0xFF0A0A0F),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.lock_outline, size: 64, color: Colors.white54),
            const SizedBox(height: 16),
            const Text(
              'PRTG Monitor Terkunci',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold, color: Colors.white),
            ),
            const SizedBox(height: 8),
            const Text(
              'Autentikasi untuk membuka',
              style: TextStyle(fontSize: 14, color: Colors.grey),
            ),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _checkAppLock,
              icon: const Icon(Icons.fingerprint),
              label: const Text('Unlock'),
            ),
          ],
        ),
      ),
    );
  }
}
