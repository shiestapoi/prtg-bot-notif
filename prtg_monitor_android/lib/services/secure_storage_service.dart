import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Service for securely storing credentials using flutter_secure_storage.
/// Migrates existing passhash from SharedPreferences on first run.
class SecureStorageService {
  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  static const _passhashKey = 'prtg_passhash_secure';
  static const _migratedKey = 'passhash_migrated';

  /// Read passhash from secure storage.
  static Future<String> getPasshash() async {
    try {
      final value = await _storage.read(key: _passhashKey);
      return value ?? '';
    } catch (e) {
      return '';
    }
  }

  /// Save passhash to secure storage.
  static Future<void> setPasshash(String passhash) async {
    try {
      await _storage.write(key: _passhashKey, value: passhash);
    } catch (e) {
      // Fallback: if secure storage fails, we still have SharedPreferences
    }
  }

  /// Delete passhash from secure storage.
  static Future<void> deletePasshash() async {
    try {
      await _storage.delete(key: _passhashKey);
    } catch (e) {
      // Ignore
    }
  }

  /// Migrate passhash from SharedPreferences to secure storage (one-time).
  /// Returns the passhash value (from secure storage after migration, or existing).
  static Future<String> migrateIfNeeded() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final alreadyMigrated = prefs.getBool(_migratedKey) ?? false;

      if (!alreadyMigrated) {
        final oldPasshash = prefs.getString('prtg_passhash') ?? '';
        if (oldPasshash.isNotEmpty) {
          await setPasshash(oldPasshash);
          // Remove from SharedPreferences after migration
          await prefs.remove('prtg_passhash');
        }
        await prefs.setBool(_migratedKey, true);
        return oldPasshash;
      }

      // Already migrated, read from secure storage
      return await getPasshash();
    } catch (e) {
      // Fallback: try reading from SharedPreferences
      final prefs = await SharedPreferences.getInstance();
      return prefs.getString('prtg_passhash') ?? '';
    }
  }
}
