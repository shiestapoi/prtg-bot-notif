import 'package:local_auth/local_auth.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Service for app lock using biometric/PIN authentication.
class AppLockService {
  static final LocalAuthentication _auth = LocalAuthentication();
  static const _enabledKey = 'app_lock_enabled';

  /// Check if app lock is enabled in settings.
  static Future<bool> isEnabled() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getBool(_enabledKey) ?? false;
  }

  /// Set app lock enabled/disabled.
  static Future<void> setEnabled(bool value) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_enabledKey, value);
  }

  /// Check if device supports biometric/PIN authentication.
  static Future<bool> isDeviceSupported() async {
    try {
      return await _auth.isDeviceSupported();
    } catch (e) {
      return false;
    }
  }

  /// Check if biometrics are available.
  static Future<bool> canCheckBiometrics() async {
    try {
      return await _auth.canCheckBiometrics;
    } catch (e) {
      return false;
    }
  }

  /// Authenticate the user with biometric or device PIN.
  /// Returns true if authentication succeeded.
  static Future<bool> authenticate() async {
    try {
      final isSupported = await _auth.isDeviceSupported();
      if (!isSupported) return true; // Skip if device doesn't support it

      return await _auth.authenticate(
        localizedReason: 'Autentikasi untuk membuka PRTG Monitor',
        options: const AuthenticationOptions(
          stickyAuth: true,
          biometricOnly: false, // Allow PIN/pattern as fallback
        ),
      );
    } catch (e) {
      // If auth fails due to error, allow access
      return true;
    }
  }
}
