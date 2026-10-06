# Bot Jualan VPS — GEN SSH STORE (v2.2 Auto Payment)

Bot Telegram jualan VPS dengan **pembayaran otomatis** via GoMerch (QRIS dinamis GoPay Merchant).

## Alur Order
1. Buyer pilih produk → bot generate **QRIS dinamis** otomatis
2. Buyer scan & bayar (GoPay/DANA/OVO/dll, nominal persis)
3. Bot polling mutasi → dana masuk terdeteksi → **AUTO-APPROVE**
4. Admin kirim detail VPS: `/kirim ORDxxx <detail>`

## Install (VPS)
```
git clone https://github.com/akunkhususjualanssh-create/bot-jualan-vps-clean.git
cd bot-jualan-vps-clean
npm install
cp gomerch.json.example gomerch.json  # isi kredensial
node index.js
```

## Konfigurasi
- Token bot & admin: edit `CONFIG` di `index.js`
- Kredensial payment: isi `gomerch.json` (jangan di-commit!)
  - `access_token`, `refresh_token` dari login GoMerch (OTP GoBiz)
  - `merchant_id`, `static_qr` dari akun GoPay Merchant
- Token expired → auto-refresh (butuh `refresh_token`)

## Fitur
- ⚡ QRIS dinamis otomatis per order
- 🤖 Auto-approve saat dana masuk (polling mutasi 5 detik)
- ⏰ Timeout bayar 15 menit
- 🛡️ Fallback ke QRIS statis manual kalau API gangguan
- 🧹 Chat bersih (pesan lama auto-delete saat /start)
