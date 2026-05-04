# PRTG Report

Dashboard PRTG dan WhatsApp sender berbasis NestJS, Prisma, PostgreSQL, dan Baileys.

## Local Setup

```bash
npm install
npm run db:generate
npm run db:deploy
npm run db:seed
npm run start:dev
```

Salin `.env.example` ke `.env`, lalu sesuaikan `DATABASE_URL`,
`WHATSAPP_AUTH_POSTGRES_URL`, dan `AUTH_JWT_SECRET`.

## Heroku Setup

### 1. Login dan buat app

```bash
heroku login
heroku create prtg-report-app
```

### 2. Tambahkan PostgreSQL

```bash
heroku addons:create heroku-postgresql:essential-0 -a prtg-report-app
```

Heroku akan mengisi `DATABASE_URL` otomatis. Pakai database yang sama untuk
auth WhatsApp:

```bash
heroku config:set WHATSAPP_AUTH_POSTGRES_URL="$(heroku config:get DATABASE_URL -a prtg-report-app)" -a prtg-report-app
```

### 3. Set config vars

```bash
heroku config:set AUTH_JWT_SECRET="ganti-dengan-secret-panjang" -a prtg-report-app
heroku config:set WHATSAPP_SERVICE_ENABLED=true -a prtg-report-app
heroku config:set WHATSAPP_USE_LATEST_WA_WEB_VERSION=true -a prtg-report-app
heroku config:set WHATSAPP_PRINT_QR=false -a prtg-report-app
heroku config:set WHATSAPP_MESSAGE_SEND_RECEIPT=true -a prtg-report-app
```

Untuk seed admin opsional:

```bash
heroku config:set SEED_USERNAME="admin" SEED_PASSWORD="password-kuat" -a prtg-report-app
```

### 4. Deploy

```bash
git add .
git commit -m "Setup Heroku deployment"
git push heroku main
```

`Procfile` menjalankan:

- `release: npm run db:deploy` untuk `prisma migrate deploy`
- `web: npm run start:prod` untuk menjalankan Nest dari `dist`

Build Heroku menjalankan `npm run heroku-postbuild`, yaitu Prisma generate dan
Nest build.

### 5. Seed database

Jalankan seed setelah migration berhasil:

```bash
heroku run npm run db:seed -a prtg-report-app
```

### 6. Cek log dan buka app

```bash
heroku logs --tail -a prtg-report-app
heroku open -a prtg-report-app
```

## Notes

- `prtg.sql`, `storage/`, dan `prisma/dev.db` di-ignore karena berisi dump lokal,
  data runtime, atau kredensial/session.
- WhatsApp auth menggunakan PostgreSQL melalui `WHATSAPP_AUTH_POSTGRES_URL`,
  sehingga dyno Heroku yang ephemeral tetap bisa menyimpan session.
- QR WhatsApp bisa dilihat dari dashboard web, bukan terminal, ketika
  `WHATSAPP_PRINT_QR=false`.
