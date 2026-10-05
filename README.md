# BOT JUALAN VPS 🚀

Bot Telegram untuk jualan VPS dengan pembayaran **QRIS manual** + konfirmasi admin.

## ✨ Fitur

- Menu **inline button** premium (pesan di-edit, bukan spam chat)
- Katalog produk via menu admin
- Alur order: pilih produk → QRIS → kirim bukti → admin approve
- Admin kirim detail VPS (IP, User, Password, Port) otomatis ke pelanggan
- `/start` ulang → pesan lama otomatis dihapus (kecuali pesan data VPS)
- Format HTML rapi (blockquote, bold, code)

## ⚡ INSTALL 1 SCRIPT (VPS baru)

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/akunkhususjualanssh-create/bot-jualan-vps-clean/main/install.sh)
```

atau:

```bash
git clone https://github.com/akunkhususjualanssh-create/bot-jualan-vps-clean.git
cd bot-jualan-vps-clean
bash install.sh
```

Installer akan otomatis:
1. Install Node.js (kalau belum ada)
2. Install dependency
3. **Nanya token bot & owner ID kamu**
4. Jalanin bot 24 jam (screen/PM2)

## 🔧 Konfigurasi Manual

Kalau mau isi ulang konfigurasi:
```bash
nano .env
```
```env
BOT_TOKEN=token_bot_dari_botfather
ADMIN_IDS=id_telegram_kamu
SUPPORT=@username_support
STORE_NAME=NAMA TOKO
```

## 🎮 Perintah

**User:** `/start` `/produk` `/order`

**Admin:** `/admin` (menu tombol) • `/kirim ORDERID IP USER PASS PORT`

## 📦 Alur Pesanan

1. Pelanggan pilih produk & bayar QRIS
2. Kirim screenshot bukti
3. Admin dapat notif + tombol ✅ Proses / ❌ Tolak
4. Admin proses 10–15 menit
5. Admin kirim: `/kirim ORDERID IP USER PASS PORT`
6. Detail VPS otomatis sampai ke pelanggan

## 🔄 Manage Bot

```bash
bash install.sh        # install ulang / isi ulang config
pm2 status             # cek status (via PM2)
pm2 restart botvps     # restart
pm2 stop botvps        # stop
screen -r botvps       # masuk (via screen)
```

---

Script by **GEN SSH STORE**
