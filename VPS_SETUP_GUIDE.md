# Panduan Setup VPS (Ubuntu 22.04 / 24.04)
*Spesifikasi Target: 2 vCPU, 2GB RAM*

Panduan ini berisi langkah-langkah *copy-paste* untuk mengonfigurasi VPS baru Anda agar siap menjalankan **PRTG Report App**.

## 1. Buat Swap File (SANGAT PENTING!)
RAM 2GB sangat pas-pasan untuk Chromium (Puppeteer) + PostgreSQL + Node.js. Jika RAM habis, Linux akan mematikan aplikasi secara paksa. Kita harus membuat "RAM Cadangan" (Swap) sebesar 2GB atau 4GB di SSD.

Jalankan perintah ini di VPS Anda (sebagai root/sudo):
```bash
sudo fallocate -l 4G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Buat agar permanen setelah restart
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab

# Optimasi swappiness (prioritaskan RAM fisik daripada Swap)
sudo sysctl vm.swappiness=10
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
```

## 2. Install Docker & Docker Compose
Aplikasi dan database akan berjalan dengan aman di dalam container Docker.

```bash
# Update sistem
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose plugin
sudo apt-get install docker-compose-plugin -y

# Izinkan user Anda menjalankan docker tanpa sudo (Opsional, butuh re-login)
sudo usermod -aG docker $USER
```

## 3. Clone Repository Anda
Karena Anda berpindah dari Heroku, Anda hanya perlu meng-clone repo Git Anda ke VPS.

```bash
# Contoh (Sesuaikan dengan URL Git Anda)
git clone https://github.com/username-anda/prtg-report.git
cd prtg-report
```

## 4. Jalankan Aplikasi
Di dalam folder `prtg-report`, file `docker-compose.yml` sudah disiapkan. Anda hanya perlu menjalankannya!

```bash
# Jalankan di background
sudo docker compose up -d

# Cek status untuk memastikan keduanya (app & db) berjalan
sudo docker compose ps

# Cek log aplikasi jika ingin melihat proses booting NestJS
sudo docker compose logs -f app
```
Aplikasi Anda sekarang berjalan di `http://IP_VPS_ANDA:3000`.

## 5. (Opsional) Pasang Caddy Server untuk Otomatis HTTPS (Domain Anda)
Jika Anda memiliki domain (misal: `prtg.domain-anda.com`) dan ingin langsung terpasang HTTPS otomatis (gratis via Let's Encrypt), install Caddy:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy -y
```

Buka file konfigurasi Caddy:
```bash
sudo nano /etc/caddy/Caddyfile
```
Hapus isinya, lalu ganti menjadi:
```caddyfile
prtg.domain-anda.com {
    reverse_proxy localhost:3000
}
```
Lalu *restart* Caddy:
```bash
sudo systemctl restart caddy
```
Selesai! Aplikasi Anda kini bisa diakses dari HTTPS dengan aman.
