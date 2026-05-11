# Cara Kerja Versioning di Android

Dokumen ini menjelaskan secara lengkap dan mendalam bagaimana sistem versioning bekerja di platform Android, mulai dari konsep dasar hingga implementasi kompleks.

---

## Daftar Isi

1. [Konsep Dasar Versioning](#1-konsep-dasar-versioning)
2. [Version Code vs Version Name](#2-version-code-vs-version-name)
3. [Konfigurasi di build.gradle](#3-konfigurasi-di-buildgradle)
4. [Semantic Versioning](#4-semantic-versioning)
5. [Auto-Increment Version](#5-auto-increment-version)
6. [Multi-Flavor Versioning](#6-multi-flavor-versioning)
7. [Version dari Git](#7-version-dari-git)
8. [CI/CD Versioning](#8-cicd-versioning)
9. [Google Play Store Requirements](#9-google-play-store-requirements)
10. [Best Practices](#10-best-practices)

---

## 1. Konsep Dasar Versioning

Android menggunakan dua komponen utama untuk versioning:

| Komponen | Tipe | Fungsi |
|----------|------|--------|
| `versionCode` | Integer | Identifikasi internal untuk update detection |
| `versionName` | String | Label yang ditampilkan ke user |

### Bagaimana Android Mendeteksi Update

```
┌─────────────────────────────────────────────────┐
│           Google Play Store                      │
│                                                  │
│  App Terpasang: versionCode = 5                  │
│  App di Store:  versionCode = 6                  │
│                                                  │
│  6 > 5 → Tampilkan tombol "Update"              │
└─────────────────────────────────────────────────┘
```

**Aturan penting:**
- `versionCode` HARUS selalu naik (increment) setiap rilis
- `versionCode` tidak pernah ditampilkan ke user
- `versionName` bisa berupa string apapun (misal "1.0.0-beta")
- Dua APK dengan `versionCode` sama TIDAK bisa di-upload ke Play Store

---

## 2. Version Code vs Version Name

### Version Code (Integer)

```kotlin
// Contoh progression versionCode
versionCode 1    // Rilis pertama
versionCode 2    // Bug fix
versionCode 3    // Fitur baru
versionCode 10   // Major update (boleh loncat)
versionCode 11   // Patch
```

**Batasan:**
- Minimum: 1
- Maximum: 2100000000 (2.1 miliar)
- Harus integer positif
- Harus selalu lebih besar dari versi sebelumnya

### Version Name (String)

```kotlin
// Format bebas, contoh:
versionName "1.0.0"           // Semantic versioning
versionName "2.3.1-beta"     // Pre-release
versionName "2024.05.11"     // Date-based
versionName "Oreo-1.2"       // Custom naming
```

---

## 3. Konfigurasi di build.gradle

### Kotlin DSL (build.gradle.kts) - Modern

```kotlin
// app/build.gradle.kts
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.example.myapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.myapp"
        minSdk = 24
        targetSdk = 34
        versionCode = 1
        versionName = "1.0.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            // Debug build bisa punya suffix berbeda
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
    }
}
```

### Groovy DSL (build.gradle) - Legacy

```groovy
// app/build.gradle
plugins {
    id 'com.android.application'
    id 'org.jetbrains.kotlin.android'
}

android {
    namespace 'com.example.myapp'
    compileSdk 34

    defaultConfig {
        applicationId "com.example.myapp"
        minSdk 24
        targetSdk 34
        versionCode 1
        versionName "1.0.0"
    }

    buildTypes {
        release {
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'),
                'proguard-rules.pro'
        }
        debug {
            applicationIdSuffix ".debug"
            versionNameSuffix "-debug"
        }
    }
}
```

### Menggunakan File Properties Terpisah

```properties
# version.properties
VERSION_MAJOR=2
VERSION_MINOR=3
VERSION_PATCH=1
VERSION_BUILD=47
```

```kotlin
// app/build.gradle.kts
import java.util.Properties

val versionProps = Properties().apply {
    file("version.properties").inputStream().use { load(it) }
}

val vMajor = versionProps["VERSION_MAJOR"].toString().toInt()
val vMinor = versionProps["VERSION_MINOR"].toString().toInt()
val vPatch = versionProps["VERSION_PATCH"].toString().toInt()
val vBuild = versionProps["VERSION_BUILD"].toString().toInt()

android {
    defaultConfig {
        versionCode = vMajor * 10000 + vMinor * 100 + vPatch
        versionName = "$vMajor.$vMinor.$vPatch"
    }
}
```

---

## 4. Semantic Versioning

### Format: MAJOR.MINOR.PATCH

```
MAJOR.MINOR.PATCH[-PRERELEASE][+BUILD]

Contoh:
  2.3.1
  2.3.1-beta.1
  2.3.1-rc.2+build.456
```

### Aturan Semantic Versioning

| Perubahan | Kapan Dinaikkan | Contoh |
|-----------|-----------------|--------|
| MAJOR | Breaking changes, API berubah | 1.x.x → 2.0.0 |
| MINOR | Fitur baru, backward compatible | 1.2.x → 1.3.0 |
| PATCH | Bug fix, tidak ada fitur baru | 1.2.3 → 1.2.4 |

### Implementasi Lengkap

```kotlin
// app/build.gradle.kts

// Definisi versi terpusat
object AppVersion {
    const val MAJOR = 2
    const val MINOR = 5
    const val PATCH = 3

    // Pre-release identifier (kosongkan untuk release)
    const val PRE_RELEASE = "" // "beta.1", "rc.2", dll

    // Hitung versionCode otomatis
    // Format: MAJOR(2 digit) + MINOR(2 digit) + PATCH(2 digit)
    // Contoh: 2.5.3 → 020503
    val code: Int
        get() = MAJOR * 10000 + MINOR * 100 + PATCH

    // Hitung versionName
    val name: String
        get() {
            val base = "$MAJOR.$MINOR.$PATCH"
            return if (PRE_RELEASE.isNotEmpty()) "$base-$PRE_RELEASE" else base
        }
}

android {
    defaultConfig {
        versionCode = AppVersion.code   // 20503
        versionName = AppVersion.name   // "2.5.3"
    }
}
```

### Konversi versionCode dari Semantic Version

```
Strategi 1: Simple concatenation
  1.2.3 → 10203
  2.15.7 → 21507
  Formula: MAJOR * 10000 + MINOR * 100 + PATCH

Strategi 2: Bit shifting (lebih banyak ruang)
  Formula: MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 + BUILD
  1.2.3 build 5 → 1020305

Strategi 3: Timestamp-based
  20240511 → versionCode = 20240511
  (cocok untuk continuous deployment)
```

---

## 5. Auto-Increment Version

### Otomatis Increment saat Build

```kotlin
// app/build.gradle.kts
import java.util.Properties

fun incrementVersionCode(): Int {
    val propsFile = file("version.properties")
    val props = Properties()

    if (propsFile.exists()) {
        propsFile.inputStream().use { props.load(it) }
    }

    val currentCode = props.getProperty("VERSION_CODE", "0").toInt()
    val newCode = currentCode + 1

    props.setProperty("VERSION_CODE", newCode.toString())
    propsFile.outputStream().use { props.store(it, "Auto-incremented") }

    return newCode
}

android {
    defaultConfig {
        versionCode = incrementVersionCode()
        versionName = "1.0.${defaultConfig.versionCode}"
    }
}
```

### Increment Hanya untuk Release Build

```kotlin
// app/build.gradle.kts
import java.util.Properties

val isReleaseBuild = gradle.startParameter.taskNames.any {
    it.contains("release", ignoreCase = true)
}

fun getVersionCode(): Int {
    val propsFile = file("version.properties")
    val props = Properties()

    if (propsFile.exists()) {
        propsFile.inputStream().use { props.load(it) }
    }

    var code = props.getProperty("VERSION_CODE", "1").toInt()

    if (isReleaseBuild) {
        code++
        props.setProperty("VERSION_CODE", code.toString())
        propsFile.outputStream().use { props.store(it, null) }
    }

    return code
}

android {
    defaultConfig {
        versionCode = getVersionCode()
    }
}
```



---

## 6. Multi-Flavor Versioning

### Konsep Product Flavors

Product flavors memungkinkan satu codebase menghasilkan beberapa varian APK dengan konfigurasi berbeda.

```
┌─────────────────────────────────────────────┐
│              Source Code                      │
├──────────┬──────────┬───────────────────────┤
│   free   │   pro    │   enterprise          │
├──────────┼──────────┼───────────────────────┤
│ vCode: 1 │ vCode: 1 │ vCode: 1              │
│ ads: yes │ ads: no  │ ads: no, SSO: yes     │
└──────────┴──────────┴───────────────────────┘
```

### Implementasi Multi-Flavor

```kotlin
// app/build.gradle.kts
android {
    flavorDimensions += listOf("tier", "region")

    productFlavors {
        // Dimension: tier
        create("free") {
            dimension = "tier"
            applicationIdSuffix = ".free"
            versionCode = 1
            versionName = "1.0.0-free"
            buildConfigField("boolean", "SHOW_ADS", "true")
            buildConfigField("int", "MAX_ITEMS", "10")
        }
        create("pro") {
            dimension = "tier"
            applicationIdSuffix = ".pro"
            versionCode = 1
            versionName = "1.0.0-pro"
            buildConfigField("boolean", "SHOW_ADS", "false")
            buildConfigField("int", "MAX_ITEMS", "999")
        }
        create("enterprise") {
            dimension = "tier"
            applicationIdSuffix = ".enterprise"
            versionCode = 1
            versionName = "1.0.0-enterprise"
            buildConfigField("boolean", "SHOW_ADS", "false")
            buildConfigField("int", "MAX_ITEMS", "999")
            buildConfigField("boolean", "SSO_ENABLED", "true")
        }

        // Dimension: region
        create("indonesia") {
            dimension = "region"
            buildConfigField("String", "API_BASE", "\"https://api.id.example.com\"")
        }
        create("global") {
            dimension = "region"
            buildConfigField("String", "API_BASE", "\"https://api.example.com\"")
        }
    }
}
```

### Versioning Berbeda per Flavor

```kotlin
// app/build.gradle.kts
android {
    productFlavors {
        create("free") {
            dimension = "tier"
            versionCode = 100  // Free dimulai dari 100
            versionName = "1.0.0"
        }
        create("pro") {
            dimension = "tier"
            versionCode = 200  // Pro dimulai dari 200
            versionName = "2.0.0"
        }
    }
}

// Atau menggunakan versionCode offset per flavor
android {
    applicationVariants.all {
        val variant = this
        val flavorName = variant.productFlavors[0].name

        val offset = when (flavorName) {
            "free" -> 0
            "pro" -> 1000000
            "enterprise" -> 2000000
            else -> 0
        }

        variant.outputs.all {
            (this as com.android.build.gradle.internal.api.BaseVariantOutputImpl)
                .versionCodeOverride = variant.versionCode + offset
        }
    }
}
```

### Multi-APK dengan ABI Split

```kotlin
// app/build.gradle.kts
android {
    splits {
        abi {
            isEnable = true
            reset()
            include("armeabi-v7a", "arm64-v8a", "x86", "x86_64")
            isUniversalApk = true
        }
    }
}

// Setiap ABI mendapat versionCode unik
val abiCodes = mapOf(
    "armeabi-v7a" to 1,
    "arm64-v8a" to 2,
    "x86" to 3,
    "x86_64" to 4
)

android {
    applicationVariants.all {
        outputs.all {
            val output = this as com.android.build.gradle.internal.api.ApkVariantOutputImpl
            val abi = output.getFilter(com.android.build.OutputFile.ABI)
            val abiCode = abiCodes[abi] ?: 0

            // Format: ABI(1 digit) + baseVersionCode
            // arm64-v8a dengan versionCode 15 → 2000015
            output.versionCodeOverride = abiCode * 1000000 + (output.versionCode ?: 0)
        }
    }
}
```

---

## 7. Version dari Git

### Menggunakan Git Commit Count

```kotlin
// app/build.gradle.kts
fun gitVersionCode(): Int {
    return try {
        val process = ProcessBuilder("git", "rev-list", "--count", "HEAD")
            .directory(projectDir)
            .start()
        process.inputStream.bufferedReader().readText().trim().toInt()
    } catch (e: Exception) {
        1 // Fallback jika git tidak tersedia
    }
}

fun gitVersionName(): String {
    return try {
        val process = ProcessBuilder("git", "describe", "--tags", "--always")
            .directory(projectDir)
            .start()
        process.inputStream.bufferedReader().readText().trim()
    } catch (e: Exception) {
        "0.0.1-unknown"
    }
}

android {
    defaultConfig {
        versionCode = gitVersionCode()      // misal: 347
        versionName = gitVersionName()      // misal: "v2.3.1-5-g1a2b3c4"
    }
}
```

### Git Tag-Based Versioning

```kotlin
// app/build.gradle.kts

/**
 * Mengambil versi dari git tag terakhir.
 * Format tag: v1.2.3
 *
 * Hasil:
 * - Jika HEAD tepat di tag: "1.2.3"
 * - Jika ada commit setelah tag: "1.2.3-5-g1a2b3c4"
 */
fun getGitVersion(): Triple<Int, Int, Int> {
    return try {
        val tag = ProcessBuilder("git", "describe", "--tags", "--abbrev=0")
            .directory(projectDir)
            .start()
            .inputStream.bufferedReader().readText().trim()
            .removePrefix("v")

        val parts = tag.split(".")
        Triple(
            parts.getOrNull(0)?.toIntOrNull() ?: 0,
            parts.getOrNull(1)?.toIntOrNull() ?: 0,
            parts.getOrNull(2)?.toIntOrNull() ?: 0
        )
    } catch (e: Exception) {
        Triple(0, 0, 1)
    }
}

fun getCommitsSinceTag(): Int {
    return try {
        val process = ProcessBuilder(
            "git", "rev-list", "--count", "HEAD", "^$(git describe --tags --abbrev=0)"
        ).directory(projectDir).start()
        process.inputStream.bufferedReader().readText().trim().toIntOrNull() ?: 0
    } catch (e: Exception) {
        0
    }
}

fun getGitHash(): String {
    return try {
        ProcessBuilder("git", "rev-parse", "--short", "HEAD")
            .directory(projectDir)
            .start()
            .inputStream.bufferedReader().readText().trim()
    } catch (e: Exception) {
        "unknown"
    }
}

fun isDirty(): Boolean {
    return try {
        val process = ProcessBuilder("git", "status", "--porcelain")
            .directory(projectDir)
            .start()
        process.inputStream.bufferedReader().readText().isNotEmpty()
    } catch (e: Exception) {
        false
    }
}

val (major, minor, patch) = getGitVersion()
val commitsSince = getCommitsSinceTag()
val gitHash = getGitHash()
val dirty = isDirty()

android {
    defaultConfig {
        // versionCode: MAJOR * 10000 + MINOR * 100 + PATCH
        versionCode = major * 10000 + minor * 100 + patch

        // versionName: "2.3.1" atau "2.3.1-5-g1a2b3c4-dirty"
        versionName = buildString {
            append("$major.$minor.$patch")
            if (commitsSince > 0) {
                append("-$commitsSince-g$gitHash")
            }
            if (dirty) {
                append("-dirty")
            }
        }
    }
}
```

### Contoh Output Git Versioning

```
Skenario 1: Tepat di tag v2.3.1
  versionCode = 20301
  versionName = "2.3.1"

Skenario 2: 5 commit setelah tag v2.3.1
  versionCode = 20301
  versionName = "2.3.1-5-g1a2b3c4"

Skenario 3: Ada perubahan belum di-commit
  versionCode = 20301
  versionName = "2.3.1-5-g1a2b3c4-dirty"
```



---

## 8. CI/CD Versioning

### GitHub Actions

```yaml
# .github/workflows/release.yml
name: Android Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0  # Penting untuk git describe

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Extract version from tag
        id: version
        run: |
          TAG=${GITHUB_REF#refs/tags/v}
          MAJOR=$(echo $TAG | cut -d. -f1)
          MINOR=$(echo $TAG | cut -d. -f2)
          PATCH=$(echo $TAG | cut -d. -f3)
          VERSION_CODE=$((MAJOR * 10000 + MINOR * 100 + PATCH))
          echo "version_name=$TAG" >> $GITHUB_OUTPUT
          echo "version_code=$VERSION_CODE" >> $GITHUB_OUTPUT

      - name: Build Release APK
        run: |
          ./gradlew assembleRelease \
            -PversionCode=${{ steps.version.outputs.version_code }} \
            -PversionName=${{ steps.version.outputs.version_name }}

      - name: Upload to Play Store
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_JSON }}
          packageName: com.example.myapp
          releaseFiles: app/build/outputs/apk/release/*.apk
          track: production
```

### Gradle Menerima Parameter dari CI

```kotlin
// app/build.gradle.kts
android {
    defaultConfig {
        // Ambil dari parameter CI, fallback ke default
        versionCode = (project.findProperty("versionCode") as? String)?.toInt() ?: 1
        versionName = (project.findProperty("versionName") as? String) ?: "1.0.0-dev"
    }
}
```

### GitLab CI

```yaml
# .gitlab-ci.yml
stages:
  - build
  - deploy

variables:
  VERSION_CODE: $CI_PIPELINE_IID  # Auto-increment dari GitLab

build_release:
  stage: build
  image: openjdk:17-jdk
  script:
    - |
      # Extract version dari tag
      if [[ $CI_COMMIT_TAG ]]; then
        VERSION_NAME=${CI_COMMIT_TAG#v}
      else
        VERSION_NAME="0.0.0-${CI_COMMIT_SHORT_SHA}"
      fi
    - ./gradlew assembleRelease
        -PversionCode=$VERSION_CODE
        -PversionName=$VERSION_NAME
  artifacts:
    paths:
      - app/build/outputs/apk/release/
  only:
    - tags

deploy_play_store:
  stage: deploy
  script:
    - bundle exec fastlane deploy
  only:
    - tags
```

### Fastlane Integration

```ruby
# fastlane/Fastfile
default_platform(:android)

platform :android do
  desc "Deploy to Play Store"
  lane :deploy do
    # Auto-increment versionCode dari Play Store
    version_codes = google_play_track_version_codes(
      track: "production",
      package_name: "com.example.myapp"
    )
    new_version_code = version_codes.max + 1

    # Build dengan version baru
    gradle(
      task: "bundle",
      build_type: "Release",
      properties: {
        "versionCode" => new_version_code,
        "versionName" => "1.2.3"
      }
    )

    # Upload ke Play Store
    upload_to_play_store(
      track: "production",
      aab: "app/build/outputs/bundle/release/app-release.aab",
      skip_upload_metadata: true,
      skip_upload_images: true
    )
  end

  desc "Deploy beta"
  lane :beta do
    version_codes = google_play_track_version_codes(
      track: "beta",
      package_name: "com.example.myapp"
    )
    new_version_code = version_codes.max + 1

    gradle(
      task: "bundle",
      build_type: "Release",
      properties: {
        "versionCode" => new_version_code,
        "versionName" => "1.2.3-beta.#{new_version_code}"
      }
    )

    upload_to_play_store(
      track: "beta",
      aab: "app/build/outputs/bundle/release/app-release.aab"
    )
  end
end
```

---

## 9. Google Play Store Requirements

### Aturan versionCode di Play Store

```
┌─────────────────────────────────────────────────────────────┐
│                    Play Store Rules                           │
├─────────────────────────────────────────────────────────────┤
│ 1. versionCode HARUS integer positif                         │
│ 2. versionCode HARUS lebih besar dari versi sebelumnya       │
│ 3. Maximum versionCode: 2100000000                           │
│ 4. Setiap track (production, beta, alpha) independen         │
│ 5. Multi-APK: setiap APK harus punya versionCode unik       │
│ 6. AAB (App Bundle) menggantikan multi-APK                   │
└─────────────────────────────────────────────────────────────┘
```

### Multi-Track Versioning Strategy

```
Production Track:  versionCode 100, 101, 102, ...
Beta Track:        versionCode 200, 201, 202, ...
Alpha Track:       versionCode 300, 301, 302, ...
Internal Testing:  versionCode 400, 401, 402, ...

PENTING: Saat promote dari beta ke production,
versionCode beta HARUS > versionCode production terakhir.

Strategi yang lebih baik:
- Gunakan single sequence: 1, 2, 3, 4, ...
- Promote build yang sama antar track
```

### App Bundle (AAB) Versioning

```kotlin
// app/build.gradle.kts
android {
    bundle {
        language {
            // Hanya include bahasa yang dibutuhkan
            enableSplit = true
        }
        density {
            enableSplit = true
        }
        abi {
            enableSplit = true
        }
    }

    defaultConfig {
        // Untuk AAB, satu versionCode cukup
        // Google Play akan generate split APKs otomatis
        versionCode = 42
        versionName = "3.1.0"
    }
}
```

### Managed Publishing & Staged Rollout

```
Upload versionCode 50 → Staged Rollout 10%
  ↓ (monitor crash rate)
Increase to 50%
  ↓ (monitor crash rate)
Increase to 100%
  ↓
Full rollout complete

Jika ada masalah:
  → Halt rollout
  → Upload versionCode 51 (hotfix)
  → Rollout versionCode 51
```

---

## 10. Best Practices

### DO ✅

1. **Gunakan file terpisah untuk version**
   ```properties
   # version.properties - mudah di-track dan di-update
   VERSION_CODE=42
   VERSION_NAME=3.1.0
   ```

2. **Otomatisasi versionCode di CI/CD**
   ```kotlin
   // Jangan manual increment, biarkan CI yang handle
   versionCode = System.getenv("BUILD_NUMBER")?.toInt() ?: 1
   ```

3. **Gunakan semantic versioning untuk versionName**
   ```
   MAJOR.MINOR.PATCH = 2.5.3
   ```

4. **Simpan mapping versionCode ↔ git commit**
   ```kotlin
   // BuildConfig akan berisi git hash
   buildConfigField("String", "GIT_HASH", "\"${getGitHash()}\"")
   buildConfigField("String", "BUILD_TIME", "\"${java.time.Instant.now()}\"")
   ```

5. **Test version di runtime**
   ```kotlin
   // Kotlin code untuk cek versi saat runtime
   val versionCode = BuildConfig.VERSION_CODE
   val versionName = BuildConfig.VERSION_NAME
   val gitHash = BuildConfig.GIT_HASH

   Log.d("AppVersion", "v$versionName ($versionCode) - $gitHash")
   ```

### DON'T ❌

1. **Jangan hardcode versionCode di banyak tempat**
   ```kotlin
   // BAD - sulit maintain
   // defaultConfig { versionCode = 42 }
   // Dan di tempat lain: versionCode = 42
   ```

2. **Jangan gunakan versionCode yang bisa turun**
   ```kotlin
   // BAD - timestamp bisa lebih kecil jika timezone berubah
   // versionCode = (System.currentTimeMillis() / 1000).toInt()
   ```

3. **Jangan skip versionCode terlalu jauh tanpa alasan**
   ```
   // BAD: 1, 2, 3, 1000000, 1000001
   // Anda akan kehabisan ruang
   ```

4. **Jangan lupa increment saat upload ke Play Store**
   ```
   // Error: "Version code 42 has already been used"
   // Solusi: Selalu increment sebelum upload
   ```

---

## Contoh Proyek Lengkap

### Struktur File

```
my-android-app/
├── app/
│   ├── build.gradle.kts          # Konfigurasi utama
│   ├── version.properties        # File versi terpisah
│   └── src/
│       └── main/
│           └── kotlin/
│               └── com/example/
│                   └── AppInfo.kt  # Runtime version info
├── build.gradle.kts              # Root build file
├── gradle.properties             # Gradle properties
├── .github/
│   └── workflows/
│       └── release.yml           # CI/CD
└── fastlane/
    └── Fastfile                  # Fastlane config
```

### File Lengkap: app/build.gradle.kts

```kotlin
import java.util.Properties
import java.time.Instant

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// === VERSION MANAGEMENT ===
val versionPropsFile = file("version.properties")
val versionProps = Properties().apply {
    if (versionPropsFile.exists()) {
        versionPropsFile.inputStream().use { load(it) }
    }
}

val appVersionMajor = versionProps.getProperty("MAJOR", "1").toInt()
val appVersionMinor = versionProps.getProperty("MINOR", "0").toInt()
val appVersionPatch = versionProps.getProperty("PATCH", "0").toInt()

// CI override atau hitung dari properties
val appVersionCode: Int = (project.findProperty("versionCode") as? String)?.toInt()
    ?: (appVersionMajor * 10000 + appVersionMinor * 100 + appVersionPatch)

val appVersionName: String = (project.findProperty("versionName") as? String)
    ?: "$appVersionMajor.$appVersionMinor.$appVersionPatch"

// Git info
fun execCommand(vararg args: String): String {
    return try {
        ProcessBuilder(*args)
            .directory(projectDir)
            .start()
            .inputStream.bufferedReader().readText().trim()
    } catch (e: Exception) { "" }
}

val gitHash = execCommand("git", "rev-parse", "--short", "HEAD")
val gitBranch = execCommand("git", "rev-parse", "--abbrev-ref", "HEAD")
val buildTime = Instant.now().toString()

// === ANDROID CONFIG ===
android {
    namespace = "com.example.myapp"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.example.myapp"
        minSdk = 24
        targetSdk = 34
        versionCode = appVersionCode
        versionName = appVersionName

        // Expose build info ke runtime
        buildConfigField("String", "GIT_HASH", "\"$gitHash\"")
        buildConfigField("String", "GIT_BRANCH", "\"$gitBranch\"")
        buildConfigField("String", "BUILD_TIME", "\"$buildTime\"")
        buildConfigField("int", "VERSION_MAJOR", "$appVersionMajor")
        buildConfigField("int", "VERSION_MINOR", "$appVersionMinor")
        buildConfigField("int", "VERSION_PATCH", "$appVersionPatch")
    }

    signingConfigs {
        create("release") {
            storeFile = file(System.getenv("KEYSTORE_PATH") ?: "keystore.jks")
            storePassword = System.getenv("KEYSTORE_PASSWORD") ?: ""
            keyAlias = System.getenv("KEY_ALIAS") ?: ""
            keyPassword = System.getenv("KEY_PASSWORD") ?: ""
        }
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug+$gitHash"
            isDebuggable = true
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }
}

// Print version info saat build
println("=== Build Info ===")
println("Version: $appVersionName ($appVersionCode)")
println("Git: $gitHash @ $gitBranch")
println("Time: $buildTime")
println("==================")
```

### File Lengkap: AppInfo.kt

```kotlin
package com.example.myapp

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build

/**
 * Utility class untuk mengakses informasi versi aplikasi saat runtime.
 */
object AppInfo {

    /** Version name dari BuildConfig (misal: "2.5.3") */
    val versionName: String = BuildConfig.VERSION_NAME

    /** Version code dari BuildConfig (misal: 20503) */
    val versionCode: Int = BuildConfig.VERSION_CODE

    /** Git commit hash saat build */
    val gitHash: String = BuildConfig.GIT_HASH

    /** Git branch saat build */
    val gitBranch: String = BuildConfig.GIT_BRANCH

    /** Waktu build */
    val buildTime: String = BuildConfig.BUILD_TIME

    /** Semantic version components */
    val major: Int = BuildConfig.VERSION_MAJOR
    val minor: Int = BuildConfig.VERSION_MINOR
    val patch: Int = BuildConfig.VERSION_PATCH

    /** Full version string untuk display */
    val fullVersion: String
        get() = "$versionName ($versionCode) [$gitHash]"

    /** User-Agent string */
    val userAgent: String
        get() = "MyApp/$versionName (Android ${Build.VERSION.RELEASE}; ${Build.MODEL})"

    /**
     * Cek apakah versi saat ini lebih baru dari versi yang diberikan.
     */
    fun isNewerThan(otherMajor: Int, otherMinor: Int, otherPatch: Int): Boolean {
        if (major != otherMajor) return major > otherMajor
        if (minor != otherMinor) return minor > otherMinor
        return patch > otherPatch
    }

    /**
     * Mendapatkan info versi dari PackageManager (alternatif).
     */
    fun getPackageVersion(context: Context): Pair<String, Long> {
        val packageInfo = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.packageManager.getPackageInfo(
                context.packageName,
                PackageManager.PackageInfoFlags.of(0)
            )
        } else {
            @Suppress("DEPRECATION")
            context.packageManager.getPackageInfo(context.packageName, 0)
        }

        val name = packageInfo.versionName ?: "unknown"
        val code = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            packageInfo.longVersionCode
        } else {
            @Suppress("DEPRECATION")
            packageInfo.versionCode.toLong()
        }

        return Pair(name, code)
    }

    /**
     * Cek apakah ini debug build.
     */
    val isDebug: Boolean = BuildConfig.DEBUG

    /**
     * Print semua info untuk debugging.
     */
    fun debugInfo(): String = buildString {
        appendLine("=== App Info ===")
        appendLine("Version: $fullVersion")
        appendLine("Branch: $gitBranch")
        appendLine("Built: $buildTime")
        appendLine("Debug: $isDebug")
        appendLine("Device: ${Build.MANUFACTURER} ${Build.MODEL}")
        appendLine("Android: ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})")
        appendLine("================")
    }
}
```

### File Lengkap: version.properties

```properties
# Version configuration
# Updated automatically by CI or manually for releases
MAJOR=2
MINOR=5
PATCH=3
```

---

## Diagram Alur Versioning Lengkap

```
Developer                    CI/CD                     Play Store
    │                          │                           │
    │  git tag v2.5.3          │                           │
    │─────────────────────────>│                           │
    │                          │                           │
    │                    ┌─────┴─────┐                     │
    │                    │ Extract   │                     │
    │                    │ version   │                     │
    │                    │ from tag  │                     │
    │                    └─────┬─────┘                     │
    │                          │                           │
    │                    ┌─────┴─────┐                     │
    │                    │ Calculate │                     │
    │                    │ vCode:    │                     │
    │                    │ 2*10000+  │                     │
    │                    │ 5*100+3   │                     │
    │                    │ = 20503   │                     │
    │                    └─────┬─────┘                     │
    │                          │                           │
    │                    ┌─────┴─────┐                     │
    │                    │ Build AAB │                     │
    │                    │ with:     │                     │
    │                    │ code=20503│                     │
    │                    │ name=2.5.3│                     │
    │                    └─────┬─────┘                     │
    │                          │                           │
    │                    ┌─────┴─────┐                     │
    │                    │ Sign AAB  │                     │
    │                    └─────┬─────┘                     │
    │                          │                           │
    │                          │  Upload AAB               │
    │                          │──────────────────────────>│
    │                          │                           │
    │                          │                     ┌─────┴─────┐
    │                          │                     │ Validate: │
    │                          │                     │ 20503 >   │
    │                          │                     │ 20502?    │
    │                          │                     │ YES ✓     │
    │                          │                     └─────┬─────┘
    │                          │                           │
    │                          │                     ┌─────┴─────┐
    │                          │                     │ Publish   │
    │                          │                     │ to users  │
    │                          │                     └───────────┘
```

---

## Referensi

- [Android Developer - Version your app](https://developer.android.com/studio/publish/versioning)
- [Semantic Versioning 2.0.0](https://semver.org/)
- [Google Play Console - Manage releases](https://support.google.com/googleplay/android-developer/answer/9859348)
- [Gradle - Android Plugin DSL Reference](https://developer.android.com/reference/tools/gradle-api)
- [Fastlane - Android Setup](https://docs.fastlane.tools/getting-started/android/setup/)
