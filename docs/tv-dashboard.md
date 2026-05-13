# TV Dashboard (`/tv`)

Halaman monitoring real-time yang dioptimalkan untuk ditampilkan di browser TV NOC (Network Operations Center). Diakses tanpa login.

---

## Akses

```
https://<domain>/tv
```

- Tidak memerlukan autentikasi (tanpa login)
- Tidak ada sidebar/navigation — full-screen
- Dark theme (background hitam) untuk visibilitas di ruangan NOC

---

## Fitur Utama

### 1. Real-time Status via SSE

- Terhubung ke `/api/monitoring/events` menggunakan Server-Sent Events
- Update status config secara instan tanpa refresh halaman
- Indikator koneksi: hijau = LIVE, merah = OFFLINE
- Auto-reconnect dengan exponential backoff jika koneksi terputus
- Fallback: data di-refresh setiap 15 detik via REST API

### 2. Grid Layout 4 Kolom

- Setiap card menampilkan:
  - Judul config + nama group
  - Badge status (NORMAL/DOWN/LOW_TRAFFIC/dll)
  - Chart PRTG (auto-refresh setiap poll)
  - Metrics: Total traffic, Inbound, Outbound
  - Waktu terakhir di-poll
- Sorting otomatis: DOWN di atas, lalu warning, lalu NORMAL

### 3. Alert Sound

- **Default: ON** — sound sudah enabled saat halaman dibuka
- Browser membutuhkan **1 klik pertama** di halaman untuk unlock audio (kebijakan browser)
- Sound berbunyi **5 detik** saat ada transisi baru ke DOWN
- 3 pilihan sound (file WAV di `/sounds/`):
  - 🔔 **Beep** (default) — beep on-off berulang
  - 🚨 **Siren** — nada naik-turun
  - 📢 **Klaxon** — dua nada bergantian
- Tombol **Test Alarm** untuk test sound yang dipilih
- Toggle ON/OFF di header

### 4. Spotlight Auto-Rotate (Toggle: default OFF)

Fitur modal overlay yang menampilkan detail satu config secara bergantian.

**Mode Normal (tidak ada DOWN/NO_TRAFFIC):**
- Cycle semua item, urutan dari traffic terendah
- Durasi: **3 detik** per item, jeda 1 detik antar item
- Jika ada status berubah ke LOW_TRAFFIC/warning → reset ke awal

**Mode DOWN (ada item DOWN/NO_TRAFFIC):**
- Hanya tampilkan item yang DOWN/NO_TRAFFIC
- Durasi: **10 detik** per item
- Tidak menampilkan item NORMAL
- Progress bar merah, border modal merah

**Kontrol:**
- Toggle "📺 Rotate ON/OFF" di header
- Default: OFF

### 5. Header Sticky

- Selalu terlihat di atas (termasuk saat spotlight overlay aktif)
- Menampilkan:
  - Judul "PRTG MONITORING"
  - Status koneksi SSE (LIVE/OFFLINE)
  - Counter: jumlah DOWN (merah), warning (kuning), NORMAL (hijau)
  - Dropdown pilihan alarm sound
  - Toggle sound ON/OFF
  - Toggle spotlight ON/OFF
  - Tombol Test Alarm
  - Jam real-time (timezone Asia/Jakarta)

### 6. Timezone

- Semua waktu menggunakan `Asia/Jakarta` (WIB) secara eksplisit
- Tidak bergantung pada setting timezone browser/TV

---

## Arsitektur Data

```
Browser TV ──SSE──► /api/monitoring/events (real-time status changes)
           ──GET──► /api/monitoring/summary (initial load + 15s refresh)
           ──GET──► /api/monitoring/chart/:sensorId (chart images)
```

Semua endpoint tanpa autentikasi.

---

## Tips Setup TV

1. Buka URL `/tv` di browser TV
2. **Klik sekali** di mana saja untuk mengaktifkan audio
3. (Opsional) Aktifkan "📺 Rotate ON" untuk auto-rotate detail
4. Biarkan berjalan 24/7

**Untuk auto-play sound tanpa klik (Chrome):**
```
chrome --kiosk --autoplay-policy=no-user-gesture-required https://<domain>/tv
```

---

## File Terkait

| File | Fungsi |
|------|--------|
| `frontend/src/pages/noc/tv.tsx` | Halaman TV dashboard |
| `frontend/src/hooks/use-sse.ts` | Hook SSE untuk real-time events |
| `frontend/public/sounds/*.wav` | File alarm sound |
| `src/monitoring/controller/monitoring-event.controller.ts` | SSE endpoint backend |
| `src/monitoring/controller/monitoring-history.controller.ts` | Summary API endpoint |
| `src/monitoring/controller/monitoring.controller.ts` | Chart proxy endpoint |
