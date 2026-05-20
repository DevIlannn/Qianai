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
