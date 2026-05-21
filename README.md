# Qianai
**Qianai** adalah aplikasi chat privat yang dirancang khusus untuk dua orang yang saling terhubung sebagai pasangan. Berbeda dari aplikasi pesan pada umumnya, Qianai tidak menggunakan akun berbasis email, nomor telepon, atau platform pihak ketiga. Identitas setiap pengguna dibangun dari sidik jari mereka sendiri, di mana proses autentikasi menggunakan **cryptographic device key** yang dibuat dan disimpan langsung di secure hardware perangkat seperti TPM atau Secure Enclave. Kunci ini tidak pernah meninggalkan perangkat, tidak bisa disalin, tidak bisa direkayasa balik, dan secara alami tahan terhadap perubahan karena terikat pada hardware fisik pengguna itu sendiri. Dari proses ini lahir ID unik dan kode QR sebagai satu-satunya cara untuk saling terhubung. Dua orang hanya bisa terhubung melalui proses scan QR secara langsung, menjadikan setiap koneksi terasa intim dan disengaja. Setelah terhubung, keduanya mendapatkan ruang chat pribadi yang sepenuhnya terisolasi, di mana percakapan, momen, dan kehadiran satu sama lain tersimpan dalam sistem yang mereka miliki sendiri. Tidak ada iklan, tidak ada algoritma, tidak ada orang lain. Qianai bukan sekadar aplikasi chat, tapi sebuah ruang digital eksklusif yang hanya berisi dua orang.

---

**Identity System**
Registrasi tidak menggunakan kredensial tradisional. WebAuthn meminta browser membuat keypair kriptografis di secure hardware perangkat (TPM / Secure Enclave). Private key tidak pernah keluar dari hardware. Public key dikirim ke server, diverifikasi, lalu server men-generate ID 8 digit unik dan QR code yang terikat ke public key tersebut. Setiap challenge autentikasi hanya bisa dijawab oleh perangkat fisik yang sama.

**Pairing System**
Server menyimpan relasi dua arah antara dua user ID. Pairing hanya bisa terjadi melalui QR scan, di mana QR berisi token sementara yang di-generate server, bukan ID mentah. Token ini single-use, expire dalam waktu terbatas, dan divalidasi server sebelum relasi dicatat ke database. Client tidak pernah tahu ID pasangan secara langsung, semua resolusi terjadi di server.

**Signaling + WebRTC**
Saat pairing selesai, server menggunakan koneksi WebSocket yang sudah aktif dari kedua user untuk menjalankan WebRTC signaling. Server bertukar SDP offer/answer dan ICE candidates antara dua peer. Setelah handshake selesai, Data Channel terbentuk langsung antar device. Server keluar dari jalur komunikasi sepenuhnya.

**Offline + Sync System**
Data esensial seperti profil, session token, dan riwayat pesan di-cache ke IndexedDB saat pertama kali online. Pesan yang dikirim saat offline masuk ke antrian lokal dengan status `pending` dan timestamp + UUID unik. WebRTC Data Channel tetap hidup selama kedua device berada di jaringan yang sama meski internet terputus. Saat koneksi kembali, Service Worker menjalankan background sync, mendorong semua pesan pending ke PostgreSQL dengan mekanisme upsert berbasis message ID untuk mencegah duplikat.

---

**Storage Architecture**
```
PostgreSQL     → source of truth, identitas + relasi + riwayat pesan
IndexedDB      → cache lokal, antrian offline, state WebRTC
localStorage   → session token, data profil ringan

Browser request halaman
        ↓
Service Worker intercept
        ↓
Ada internet?
├── YA  → fetch dari network, update cache, sajikan
└── TIDAK → sajikan dari cache langsung
```

**Service Worker.**
Service Worker adalah script yang berjalan di background browser, terpisah dari halaman. Dia duduk di antara browser dan network, mencegat semua request. Saat online, dia cache semua aset penting. Saat offline, dia sajikan dari cache itu.

**Schema Database PostgreSQL**

```sql
TABLE users_qianai
├── id              CHAR(8) PRIMARY KEY
├── data            JSONB NOT NULL
│   ├── username        STRING
│   ├── bio             STRING
│   └── avatar          TEXT (base64)
├── device          JSONB NOT NULL
│   ├── user_agent      STRING
│   ├── browser         STRING
│   ├── os              STRING
│   ├── timezone        STRING
│   ├── locale          STRING
│   ├── screen          OBJECT
│   │   ├── width       INTEGER
│   │   ├── height      INTEGER
│   │   └── dpr         FLOAT
│   ├── network         OBJECT
│   │   ├── type        STRING (4g, wifi, etc)
│   │   └── downlink    FLOAT
│   ├── permissions     OBJECT
│   │   ├── camera      STRING (granted, denied, prompt)
│   │   ├── microphone  STRING
│   │   └── notifications STRING
│   └── media_devices   ARRAY
│       ├── audioinput  INTEGER (count)
│       ├── audiooutput INTEGER (count)
│       └── videoinput  INTEGER (count)
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE credentials_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── user_id         CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── credential_id   STRING
│   ├── public_key      TEXT (base64)
│   └── sign_count      INTEGER
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE sessions_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── user_id         CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── token           STRING
│   ├── is_active       BOOLEAN
│   └── device          OBJECT (snapshot device saat login)
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE pairs_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── user_a          CHAR(8) REFERENCES users_qianai(id)
├── user_b          CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── status          STRING (pending, active, ended)
│   └── paired_at       STRING
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE pair_tokens_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── user_id         CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── token           STRING
│   ├── qr_payload      TEXT (base64 encoded QR image)
│   └── is_used         BOOLEAN
├── ip              INET
├── expires_at      TIMESTAMPTZ
└── created_at      TIMESTAMPTZ DEFAULT NOW()

TABLE messages_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── pair_id         UUID REFERENCES pairs_qianai(id)
├── sender_id       CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── type            STRING (text, image, video, file)
│   ├── content         TEXT
│   ├── reply_to        UUID nullable
│   ├── is_deleted      BOOLEAN
│   └── status          STRING (sent, delivered, read)
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE media_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── message_id      UUID REFERENCES messages_qianai(id)
├── user_id         CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── type            STRING (image, video, file)
│   ├── filename        STRING
│   ├── mimetype        STRING
│   ├── size_bytes      INTEGER
│   └── blob            TEXT (base64)
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
└── updated_at      TIMESTAMPTZ DEFAULT NOW()

TABLE ip_logs_qianai
├── id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
├── user_id         CHAR(8) REFERENCES users_qianai(id)
├── data            JSONB NOT NULL
│   ├── ip_previous     INET
│   ├── ip_new          INET
│   └── qr_refreshed    BOOLEAN
├── ip              INET
├── created_at      TIMESTAMPTZ DEFAULT NOW()
```

**Logika IP Change + QR Refresh**

```
User login / buka app
        ↓
Server ambil ip terakhir dari users_qianai
        ↓
Bandingkan dengan IP request masuk
        ↓
Sama?
├── YA   → lanjut normal, tidak ada aksi
└── TIDAK → generate QR baru
           → update qr_payload di pair_tokens_qianai
           → update ip di users_qianai
           → catat log di ip_logs_qianai
           → kirim QR baru ke client via WebSocket
```

**Device data yang dikumpulkan saat login (client-side)**

```javascript
const device = {
    user_agent   : navigator.userAgent,
    browser      : navigator.appName,
    os           : navigator.platform,
    timezone     : Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale       : navigator.language,
    screen       : {
        width    : screen.width,
        height   : screen.height,
        dpr      : window.devicePixelRatio
    },
    network      : {
        type     : navigator.connection?.effectiveType,
        downlink : navigator.connection?.downlink
    },
    permissions  : {
        camera        : await navigator.permissions.query({ name: 'camera' }),
        microphone    : await navigator.permissions.query({ name: 'microphone' }),
        notifications : await navigator.permissions.query({ name: 'notifications' })
    },
    media_devices : {
        audioinput  : devices.filter(d => d.kind === 'audioinput').length,
        audiooutput : devices.filter(d => d.kind === 'audiooutput').length,
        videoinput  : devices.filter(d => d.kind === 'videoinput').length
    }
}
```

---

**Struktur Folder**

```
qianai/
│
├── app.js
├── package.json
├── .env
│
├── config/
│   └── index.js          → db, env, constants semua dari sini
│
├── core/
│   ├── auth.js           → webauthn register + verify + session
│   ├── pairing.js        → generate QR, token, relasi user
│   ├── signaling.js      → WebRTC signaling via socket
│   └── sync.js           → offline queue + IP change handler
│
├── routes/
│   └── index.js          → semua route digabung di satu file
│
├── models/
│   └── index.js          → semua query SQL dari satu file
│
├── socket/
│   └── index.js          → socket.io handler + event registry
│
├── middleware/
│   └── index.js          → auth guard, rate limit, error handler
│
├── uploads/
│   ├── images/
│   ├── videos/
│   └── files/
│
├── public/
│   ├── index.html        → dashboard / chat utama
│   ├── auth.html         → register + login fingerprint
│   ├── pair.html         → scan QR + pairing
│   └── settings.html     → profil, username, bio, avatar
│
└── assets/
    ├── css/
    │   ├── base.css      → design tokens, reset, typography
    │   ├── components.css → button, input, card, avatar, bubble
    │   └── pages.css     → layout spesifik per halaman
    ├── js/
    │   ├── sw.js         → service worker + cache strategy
    │   ├── store.js      → localStorage + IndexedDB handler
    │   ├── api.js        → semua fetch ke backend dari sini
    │   ├── webauthn.js   → client-side fingerprint flow
    │   ├── webrtc.js     → peer connection + data channel
    │   ├── chat.js       → UI chat + media + sync handler
    │   ├── pair.js       → QR scanner + pairing flow
    │   └── settings.js   → update profil handler
    └── images/
```

---

**Penjelasan keputusan penggabungan**

```
config/index.js
→ db connection, env variables, dan constants
  tidak perlu 3 file terpisah untuk hal yang saling bergantung

core/*.js
→ setiap file adalah satu domain logika utuh
  auth.js bukan hanya webauthn, tapi juga session management
  pairing.js bukan hanya QR, tapi juga token dan relasi

routes/index.js
→ semua endpoint di satu tempat
  mudah lihat peta API tanpa buka banyak file
  dikelompokkan per domain dengan komentar section

models/index.js
→ semua SQL query function di satu file
  tidak ada ORM, pure query function
  mudah di-trace dan di-maintain

middleware/index.js
→ auth guard, rate limiter, error handler digabung
  ketiganya kecil dan saling berkaitan

assets/js/api.js
→ semua fetch call dari client ke backend
  tidak ada fetch tersebar di mana-mana
  satu pintu untuk semua komunikasi HTTP

assets/js/store.js
→ localStorage dan IndexedDB dalam satu handler
  konsistensi akses data lokal dari satu tempat
```

---

**File terpenting sebagai entry point pemahaman project**

```
app.js            → lihat ini untuk memahami server secara keseluruhan
routes/index.js   → lihat ini untuk memahami semua API
models/index.js   → lihat ini untuk memahami semua interaksi database
assets/js/api.js  → lihat ini untuk memahami semua komunikasi client
```

---

