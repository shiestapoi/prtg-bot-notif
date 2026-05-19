# PRTG Monitor Android

Aplikasi Android untuk monitoring PRTG secara langsung (tanpa backend), dengan notifikasi pinned dan alarm yang berjalan di latar belakang.

## Fitur

- **Direct PRTG Polling** — Langsung ke PRTG API menggunakan `historicdata.json` dengan autentikasi username/passhash
- **Background Service** — Monitoring tetap berjalan meskipun app ditutup
- **Pinned Notification** — Notifikasi ongoing yang menampilkan status real-time (DOWN/Warning/Normal)
- **Alert Notification** — Notifikasi terpisah saat ada link DOWN atau LOW TRAFFIC
- **Custom Alarm Sound** — 5 pilihan alarm (Beep, Sshh, Alarm 3, Fahhh, Alarm 2)
- **Configurable** — URL, username, passhash, polling interval, dan notifikasi bisa diatur
- **Static Seeder** — Data config sama dengan backend (15 sensor, 8 group)

## Setup

### Prerequisites

- Flutter SDK >= 3.2.0
- Android SDK (min API 24 / Android 7.0)

### Langkah Install

```bash
cd prtg_monitor_android
flutter pub get
flutter run
```

### Konfigurasi PRTG

1. Buka app → tab **Settings**
2. Isi:
   - **PRTG Base URL**: `http://prtg.r1net.id/index.htm`
   - **Username**: `noc`
   - **Passhash**: (dapatkan dari PRTG → Setup → Account Settings → My Account)
3. Klik **Test Koneksi** untuk verifikasi
4. Klik **Simpan** untuk mulai monitoring

### Cara Mendapatkan Passhash

1. Login ke PRTG Web Interface
2. Buka **Setup → Account Settings → My Account**
3. Scroll ke bawah, cari bagian **Passhash**
4. Copy passhash tersebut (bukan password biasa)

## Arsitektur

```
┌─────────────────────────────────────────────────────┐
│                  Flutter App                          │
├─────────────────────────────────────────────────────┤
│  UI Layer (Pages)                                    │
│  ├── DashboardPage (grid status cards)               │
│  └── SettingsPage (PRTG config, alarm, notif)        │
├─────────────────────────────────────────────────────┤
│  State Layer (Providers)                             │
│  ├── MonitoringProvider (polling + status)            │
│  └── SettingsProvider (SharedPreferences)             │
├─────────────────────────────────────────────────────┤
│  Service Layer                                       │
│  ├── PrtgApiService (HTTP → PRTG historicdata.json)  │
│  ├── BackgroundService (foreground service)           │
│  ├── NotificationService (pinned + alert notif)      │
│  └── AlarmService (audioplayers)                     │
├─────────────────────────────────────────────────────┤
│  Data Layer                                          │
│  ├── Seeder (static config data)                     │
│  └── SharedPreferences (settings storage)            │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  PRTG Server (Direct HTTP)                           │
│  GET /api/historicdata.json?id={sensorId}&...        │
│      &username={user}&passhash={hash}                │
└─────────────────────────────────────────────────────┘
```

## Data Seeder

Sensor configs yang di-monitor (sama dengan backend):

| ID | Title | Sensor ID | Group |
|----|-------|-----------|-------|
| 1 | LL SOLNET | 2669 | SIAK KOTA |
| 2 | LL INDOSAT | 2624 | SIAK KOTA |
| 3 | LL TELKOM | 2659 | SEI PAKNING |
| 4 | LL INDOSAT | 2658 | SEI PAKNING |
| 5 | LL SOLNET | 2719 | PERAWANG |
| 6 | LL INDOSAT | 2717 | RAWANGKAO |
| 7 | LL XL | 2588 | BUNGARAYA |
| 8 | LL MORA | 2511 | DUMAI |
| 39 | LL INDOSAT | 2484 | DUMAI |
| 40 | LL INDOSAT | 2657 | PERAWANG |
| 55 | IPTX SOLNET | 2242 | PEKANBARU |
| 56 | IPTX TELKOM | 2249 | PEKANBARU |
| 57 | CDN H3I | 2506 | PEKANBARU |
| 58 | RUMBAI TRAFFIC | 2411 | RUMBAI |
| 88 | LL INDOSAT | 2721 | BUNGARAYA |

## Sound Files

Copy file alarm dari `frontend/public/sounds/` ke `assets/sounds/`:

```bash
cp ../frontend/public/sounds/beep.wav assets/sounds/
cp ../frontend/public/sounds/sshh.wav assets/sounds/
cp ../frontend/public/sounds/alarm3.wav assets/sounds/
cp ../frontend/public/sounds/fahhh.wav assets/sounds/
cp ../frontend/public/sounds/alarm2.wav assets/sounds/
```

## Build APK

```bash
flutter build apk --release
```

Output: `build/app/outputs/flutter-apk/app-release.apk`
