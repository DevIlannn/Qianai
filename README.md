# Qianai
**Qianai** adalah aplikasi chat privat yang dirancang khusus untuk dua orang yang saling terhubung sebagai pasangan. Berbeda dari aplikasi pesan pada umumnya, Qianai tidak menggunakan akun berbasis email, nomor telepon, atau platform pihak ketiga. Identitas setiap pengguna dibangun dari sidik jari mereka sendiri, di mana proses autentikasi menggunakan **cryptographic device key** yang dibuat dan disimpan langsung di secure hardware perangkat seperti TPM atau Secure Enclave. Kunci ini tidak pernah meninggalkan perangkat, tidak bisa disalin, tidak bisa direkayasa balik, dan secara alami tahan terhadap perubahan karena terikat pada hardware fisik pengguna itu sendiri. Dari proses ini lahir ID unik dan kode QR sebagai satu-satunya cara untuk saling terhubung. Dua orang hanya bisa terhubung melalui proses scan QR secara langsung, menjadikan setiap koneksi terasa intim dan disengaja. Setelah terhubung, keduanya mendapatkan ruang chat pribadi yang sepenuhnya terisolasi, di mana percakapan, momen, dan kehadiran satu sama lain tersimpan dalam sistem yang mereka miliki sendiri. Tidak ada iklan, tidak ada algoritma, tidak ada orang lain. Qianai bukan sekadar aplikasi chat, tapi sebuah ruang digital eksklusif yang hanya berisi dua orang.

```
qianai/
├── app.js
├── public/
│   ├── index.html
│   └── auth.html
└── assets/
    ├── css/
    ├── js/
    └── images/
```

Oke README sudah terbaca. Ini penjelasan sistem secara teknis murni:

---

**Identity System**
Registrasi tidak menggunakan kredensial tradisional. WebAuthn meminta browser membuat keypair kriptografis di secure hardware perangkat (TPM / Secure Enclave). Private key tidak pernah keluar dari hardware. Public key dikirim ke server, diverifikasi, lalu server men-generate ID 8 digit unik dan QR code yang terikat ke public key tersebut. Setiap challenge autentikasi hanya bisa dijawab oleh perangkat fisik yang sama.

---

**Pairing System**
Server menyimpan relasi dua arah antara dua user ID. Pairing hanya bisa terjadi melalui QR scan, di mana QR berisi token sementara yang di-generate server, bukan ID mentah. Token ini single-use, expire dalam waktu terbatas, dan divalidasi server sebelum relasi dicatat ke database. Client tidak pernah tahu ID pasangan secara langsung, semua resolusi terjadi di server.

---

**Signaling + WebRTC**
Saat pairing selesai, server menggunakan koneksi WebSocket yang sudah aktif dari kedua user untuk menjalankan WebRTC signaling. Server bertukar SDP offer/answer dan ICE candidates antara dua peer. Setelah handshake selesai, Data Channel terbentuk langsung antar device. Server keluar dari jalur komunikasi sepenuhnya.

---

**Offline + Sync System**
Data esensial seperti profil, session token, dan riwayat pesan di-cache ke IndexedDB saat pertama kali online. Pesan yang dikirim saat offline masuk ke antrian lokal dengan status `pending` dan timestamp + UUID unik. WebRTC Data Channel tetap hidup selama kedua device berada di jaringan yang sama meski internet terputus. Saat koneksi kembali, Service Worker menjalankan background sync, mendorong semua pesan pending ke PostgreSQL dengan mekanisme upsert berbasis message ID untuk mencegah duplikat.

---

**Storage Architecture**
```
PostgreSQL     → source of truth, identitas + relasi + riwayat pesan
IndexedDB      → cache lokal, antrian offline, state WebRTC
localStorage   → session token, data profil ringan
```

---
```
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
