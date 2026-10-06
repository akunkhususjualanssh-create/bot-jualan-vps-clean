// ===== BOT JUALAN VPS - GEN SSH STORE (v2.2 — AUTO PAYMENT GOMERCH) =====
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');
const gomerch = require('./gomerch'); // QRIS dinamis + auto-deteksi pembayaran

const CONFIG = {
  token: '8996665187:AAF4mZHyiHo6CwmCwEFaEWL4VFStidoZVzE',
  adminIds: [7761880504],
  support: '@gensshstore',
  storeName: 'GEN SSH STORE',
  dbFile: path.join(__dirname, 'db.json')
};

let db = { products: [], orders: {}, qris: '' };
if (fs.existsSync(CONFIG.dbFile)) {
  try { db = JSON.parse(fs.readFileSync(CONFIG.dbFile, 'utf8')); } catch (e) {}
}
db.products = db.products || [];
db.orders = db.orders || {};
db.qris = db.qris || '';
const save = () => fs.writeFileSync(CONFIG.dbFile, JSON.stringify(db, null, 2));

const bot = new TelegramBot(CONFIG.token, { polling: true });
console.log('Bot v2.1 HTML UI started!');

// pengaman: error di 1 callback jangan sampai matiin bot
process.on('uncaughtException', (e) => console.error('[uncaught]', e && e.message));
process.on('unhandledRejection', (e) => console.error('[unhandled]', e && (e.message || e)));

const isAdmin = (id) => CONFIG.adminIds.includes(id);
const fmt = (n) => 'Rp' + Number(n).toLocaleString('id-ID');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const LINE = '━━━━━━━━━━━━━━━━━━';

// ---------- UI ----------
function mainMenuText() {
  return `${LINE}\n` +
    `🔥 <b>${CONFIG.storeName}</b> 🔥\n` +
    `${LINE}\n\n` +
    `<blockquote>⚡ Server Premium • Harga Merakyat\n🚀 Kualitas Terbaik • Support 24/7\n🔒 Aman • Cepat • Terpercaya</blockquote>\n\n` +
    `👋 Selamat datang! Silakan pilih menu:`;
}

function mainMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '🛒 Beli VPS', callback_data: 'menu_order' },
       { text: '📦 Katalog', callback_data: 'menu_katalog' }],
      [{ text: '💎 Testimoni', callback_data: 'menu_testi' },
       { text: '❓ Cara Order', callback_data: 'menu_cara' }],
      [{ text: '📞 Hubungi Admin', url: `https://t.me/${CONFIG.support.replace('@', '')}` }],
      [{ text: '👑 Menu Admin', callback_data: 'menu_admin' }]
    ]
  };
}

function katalogKeyboard() {
  const kb = db.products.map((p, i) => [{
    text: `📦 ${p.nama} • ${fmt(p.harga)}`,
    callback_data: `view_${i}`
  }]);
  kb.push([{ text: '« Kembali', callback_data: 'menu_main' }]);
  return { inline_keyboard: kb };
}

function katalogText() {
  if (!db.products.length)
    return `📦 <b>KATALOG VPS</b>\n\n<blockquote>Belum ada produk tersedia.\nHubungi ${CONFIG.support} untuk info.</blockquote>`;
  let t = `📦 <b>KATALOG VPS</b> 📦\n${LINE}\n\n`;
  db.products.forEach((p, i) => {
    t += `<blockquote>${i + 1}. 🖥️ <b>${esc(p.nama)}</b>\n${esc(p.deskripsi)}\n💰 Harga: <b>${fmt(p.harga)}</b></blockquote>\n\n`;
  });
  t += `👇 <i>Klik produk untuk detail &amp; beli</i>`;
  return t;
}

function productDetail(i) {
  const p = db.products[i];
  if (!p) return null;
  return {
    text: `🖥️ <b>${esc(p.nama)}</b>\n${LINE}\n\n` +
      `<blockquote>📝 ${esc(p.deskripsi)}\n💰 Harga: <b>${fmt(p.harga)}</b>\n⚡ Ready stok\n🚀 Proses cepat 10-15 menit</blockquote>\n\n` +
      `Klik <b>🛒 Beli Sekarang</b> untuk lanjut:`,
    keyboard: {
      inline_keyboard: [
        [{ text: '🛒 Beli Sekarang', callback_data: `buy_${i}` }],
        [{ text: '« Kembali ke Katalog', callback_data: 'menu_katalog' }]
      ]
    }
  };
}

function adminMenuKeyboard() {
  return {
    inline_keyboard: [
      [{ text: '➕ Tambah Produk', callback_data: 'adm_add' },
       { text: '📋 List Produk', callback_data: 'menu_katalog' }],
      [{ text: '🗑 Hapus Produk', callback_data: 'adm_del' },
       { text: '🖼 Set QRIS', callback_data: 'adm_qris' }],
      [{ text: '📊 Daftar Pesanan', callback_data: 'adm_orders' }],
      [{ text: '« Menu Utama', callback_data: 'menu_main' }]
    ]
  };
}

function adminMenuText() {
  const pending = Object.values(db.orders).filter(o => o.status === 'menunggu_konfirmasi' || o.status === 'diproses').length;
  return `👑 <b>MENU ADMIN</b>\n${LINE}\n\n` +
    `<blockquote>📊 Statistik:\n• Produk: ${db.products.length}\n• Total order: ${Object.keys(db.orders).length}\n• Pending: ${pending}</blockquote>`;
}

// ---------- Helpers ----------
const userState = {};
const activeWatchers = {}; // orderId -> watcher (auto-detect bayar)

// kirim buffer (gambar QR dari memory)
const trackSendBuffer = async (chatId, method, buffer, opts) => {
  try {
    const msg = await bot.sendPhoto(chatId, buffer, opts);
    return msg;
  } catch (e) { console.error('sendBuffer err', e.message); }
};

// ---------- Message tracking (auto-delete on /start) ----------
const tracked = {}; // uid -> [msgIds]
const keep = new Set(); // msgIds of VPS detail (never deleted)
const trackSend = async (chatId, method, ...args) => {
  const m = await bot[method](chatId, ...args);
  (tracked[chatId] = tracked[chatId] || []).push(m.message_id);
  return m;
};
const cleanup = async (chatId) => {
  const ids = tracked[chatId] || [];
  for (const id of ids) {
    if (!keep.has(id)) await bot.deleteMessage(chatId, id).catch(() => {});
  }
  tracked[chatId] = [];
};


function sendMain(chatId, msgId) {
  const opts = { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() };
  if (msgId) bot.editMessageText(mainMenuText(), { chat_id: chatId, message_id: msgId, ...opts }).catch(() => {});
  else bot.sendMessage(chatId, mainMenuText(), opts);
}

// ---------- Commands ----------
bot.onText(/\/start/, async (msg) => {
  await cleanup(msg.chat.id);
  await trackSend(msg.chat.id, 'sendMessage', mainMenuText(), { parse_mode: 'HTML', reply_markup: mainMenuKeyboard() });
});

bot.onText(/\/admin/, (msg) => {
  if (!isAdmin(msg.from.id)) return;
  trackSend(msg.chat.id, 'sendMessage', adminMenuText(), { parse_mode: 'HTML', reply_markup: adminMenuKeyboard() });
});

bot.onText(/\/produk/, (msg) =>
  trackSend(msg.chat.id, 'sendMessage', katalogText(), { parse_mode: 'HTML', reply_markup: katalogKeyboard() })
);

bot.onText(/\/order/, (msg) =>
  trackSend(msg.chat.id, 'sendMessage', katalogText(), { parse_mode: 'HTML', reply_markup: katalogKeyboard() })
);

// ---------- Callback handler ----------
bot.on('callback_query', async (q) => {
  const chatId = q.message.chat.id, msgId = q.message.message_id, uid = q.from.id;
  const data = q.data;
  const answer = (t) => bot.answerCallbackQuery(q.id, { text: t || '' }).catch(() => {});
  const edit = (text, kb) => bot.editMessageText(text, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML', reply_markup: kb }).catch(() => {});

  // Navigation
  if (data === 'menu_main') { edit(mainMenuText(), mainMenuKeyboard()); return answer(); }
  if (data === 'menu_katalog' || data === 'menu_order') { edit(katalogText(), katalogKeyboard()); return answer(); }
  if (data === 'menu_cara') {
    edit(`❓ <b>CARA ORDER</b>\n${LINE}\n\n` +
      `<blockquote>1️⃣ Pilih produk di katalog\n2️⃣ Bayar via QRIS yang muncul\n3️⃣ Screenshot bukti transfer\n4️⃣ Kirim bukti ke bot ini\n5️⃣ Tunggu 10–15 menit diproses\n6️⃣ Detail VPS dikirim otomatis</blockquote>\n\n` +
      `📞 Butuh bantuan? ${CONFIG.support}`,
      { inline_keyboard: [[{ text: '« Kembali', callback_data: 'menu_main' }]] });
    return answer();
  }
  if (data === 'menu_testi') {
    edit(`💎 <b>TESTIMONI</b>\n${LINE}\n\n<blockquote>⭐⭐⭐⭐⭐\n"Server kencang, proses cepat!"\n\n⭐⭐⭐⭐⭐\n"Recommended, admin ramah"\n\n⭐⭐⭐⭐⭐\n"Harga termurah, kualitas oke"</blockquote>\n\n🛒 Yuk order sekarang!`,
      { inline_keyboard: [[{ text: '🛒 Beli Sekarang', callback_data: 'menu_katalog' }], [{ text: '« Kembali', callback_data: 'menu_main' }]] });
    return answer();
  }
  if (data === 'menu_admin') {
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    edit(adminMenuText(), adminMenuKeyboard());
    return answer();
  }

  // View product
  if (data.startsWith('view_')) {
    const det = productDetail(parseInt(data.split('_')[1]));
    if (!det) return answer('Produk tidak ditemukan');
    edit(det.text, det.keyboard);
    return answer();
  }

  // Buy flow — AUTO PAYMENT (QRIS dinamis GoMerch + auto-deteksi)
  if (data.startsWith('buy_')) {
    const i = parseInt(data.split('_')[1]);
    const p = db.products[i];
    if (!p) return answer('Produk tidak ditemukan');
    const orderId = 'ORD' + Date.now().toString(36).toUpperCase();
    answer('⏳ Membuat QRIS...');
    try {
      const qr = await gomerch.generateQris(p.harga);
      const img = await gomerch.downloadQrImage(qr.qr_url);
      const startTime = new Date().toISOString();
      userState[uid] = { step: 'menunggu_bayar', orderId, productIndex: i };

      const caption = `🧾 <b>PESANAN ${orderId}</b>\n${LINE}\n\n` +
        `<blockquote>📦 Produk: <b>${esc(p.nama)}</b>\n💰 Total: <b>${fmt(p.harga)}</b>\n⏰ Batas bayar: 15 menit</blockquote>\n\n` +
        `📱 Scan QRIS ini pakai <b>GoPay / DANA / OVO / ShopeePay / m-banking</b>\n\n` +
        `<blockquote>✅ Bayar PERSIS ${fmt(p.harga)}\n⚡ Begitu dana masuk, order <b>OTOMATIS disetujui</b> — gak perlu kirim bukti!</blockquote>\n\n` +
        `📞 Butuh bantuan? ${CONFIG.support}`;
      const kb = { inline_keyboard: [[{ text: '🔄 Sudah Bayar? Cek Status', callback_data: 'cekstatus_' + orderId }], [{ text: '« Kembali ke Katalog', callback_data: 'menu_katalog' }]] };
      await trackSendBuffer(chatId, 'sendPhoto', img, { caption, parse_mode: 'HTML', reply_markup: kb });

      // AUTO-DETECT pembayaran
      const watcher = gomerch.watchPayment({
        amount: p.harga, startTime,
        onPaid: async (match) => {
          db.orders[orderId] = {
            orderId, userId: uid, username: q.from.username || q.from.first_name,
            produk: p.nama, harga: p.harga, status: 'diproses',
            paid_via: match.qris_provider_aspi_issuer || 'QRIS',
            payer: (match.customer_first_name || '') + ' ' + (match.customer_last_name || ''),
            paid_at: new Date().toISOString()
          };
          save();
          userState[uid] = { step: 'menunggu_proses', orderId, productIndex: i };
          await trackSend(chatId, 'sendMessage',
            `🎉 <b>PEMBAYARAN DITERIMA!</b>\n${LINE}\n\n<blockquote>🧾 Order: <code>${orderId}</code>\n💰 ${fmt(p.harga)} — LUNAS\n👤 Pembayar: ${esc((match.customer_first_name || '').trim())}\n💳 Via: ${esc(match.qris_provider_aspi_issuer || 'GoPay')}</blockquote>\n\n⏳ <b>Sedang diproses otomatis...</b>\n📦 Detail VPS dikirim ke sini sekitar 10–15 menit\n📞 Jika lama, hubungi ${CONFIG.support}`,
            { parse_mode: 'HTML' });
          CONFIG.adminIds.forEach(aid => {
            bot.sendMessage(aid,
              `🔔 <b>ORDER LUNAS (AUTO-APPROVE)!</b>\n${LINE}\n\n<blockquote>🧾 ${orderId}\n👤 @${esc(q.from.username || q.from.first_name)} (<code>${uid}</code>)\n📦 ${esc(p.nama)}\n💰 ${fmt(p.harga)} — paid via ${esc(match.qris_provider_aspi_issuer || 'GoPay')}</blockquote>\n\n⚡ Kirim detail VPS: <code>/kirim ${orderId} &lt;detail&gt;</code>`,
              { parse_mode: 'HTML' }).catch(() => {});
          });
        },
        onExpire: async () => {
          if (userState[uid]?.orderId === orderId && userState[uid].step === 'menunggu_bayar') {
            userState[uid].step = 'expired';
            trackSend(chatId, 'sendMessage', `⏰ <b>Waktu bayar habis</b> (15 menit) untuk order <code>${orderId}</code>.\nSilakan order ulang di katalog.`, { parse_mode: 'HTML' }).catch(() => {});
          }
        }
      });
      activeWatchers[orderId] = watcher;
    } catch (e) {
      // fallback ke QRIS statis kalau API gagal
      console.error('gomerch err', e.message);
      userState[uid] = { step: 'await_bukti', orderId, productIndex: i };
      const caption = `🧾 <b>PESANAN ${orderId}</b>\n${LINE}\n\n` +
        `<blockquote>📦 Produk: <b>${esc(p.nama)}</b>\n💰 Total: <b>${fmt(p.harga)}</b></blockquote>\n\n` +
        `📷 Scan QRIS di atas untuk bayar\n\n` +
        `<blockquote>1️⃣ Bayar via QRIS\n2️⃣ Screenshot bukti transfer\n3️⃣ Kirim bukti ke sini</blockquote>\n\n` +
        `⚠️ <i>Pembayaran otomatis sedang gangguan — pakai cara manual ya</i>\n📞 ${CONFIG.support}`;
      const kb = { inline_keyboard: [[{ text: '« Kembali ke Katalog', callback_data: 'menu_katalog' }]] };
      if (db.qris) await trackSend(chatId, 'sendPhoto', db.qris, { caption, parse_mode: 'HTML', reply_markup: kb });
      else await trackSend(chatId, 'sendMessage', caption + '\n\n⚠️ QRIS belum tersedia, hubungi admin.', { parse_mode: 'HTML', reply_markup: kb });
    }
    return answer();
  }

  // Cek status bayar manual (kalau auto-detect telat)
  if (data.startsWith('cekstatus_')) {
    const oid = data.split('_')[1];
    const o = db.orders[oid];
    const st = userState[uid];
    if (o) return answer('Order ' + oid + ': ' + o.status);
    if (st?.orderId === oid && st.step === 'menunggu_bayar') return answer('⏳ Belum terdeteksi. Kalau sudah bayar, tunggu ±30 detik lalu cek lagi.');
    return answer('Order tidak ditemukan / belum dibayar.');
  }

  // Admin actions
  if (data === 'adm_add') {
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    userState[uid] = { step: 'add_nama' };
    bot.sendMessage(chatId, '➕ <b>Tambah Produk</b>\n\n📝 Kirim nama produk:', { parse_mode: 'HTML' });
    return answer();
  }
  if (data === 'adm_del') {
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    if (!db.products.length) return answer('Belum ada produk');
    userState[uid] = { step: 'del_idx' };
    bot.sendMessage(chatId, katalogText() + '\n\n🗑 Kirim <b>nomor</b> produk yang mau dihapus:', { parse_mode: 'HTML' });
    return answer();
  }
  if (data === 'adm_qris') {
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    userState[uid] = { step: 'setqris' };
    bot.sendMessage(chatId, '🖼 Kirim <b>foto QRIS</b> kamu:', { parse_mode: 'HTML' });
    return answer();
  }
  if (data === 'adm_orders') {
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    const list = Object.values(db.orders);
    if (!list.length) { bot.sendMessage(chatId, '📭 Belum ada pesanan.'); return answer(); }
    const icons = { menunggu_konfirmasi: '⏳', diproses: '🔄', selesai: '✅', ditolak: '❌' };
    const t = `📊 <b>DAFTAR PESANAN</b>\n${LINE}\n\n` + list
      .map(o => `<blockquote>${icons[o.status] || '•'} <b>${o.orderId}</b>\n👤 @${esc(o.username)}\n📦 ${esc(o.produk)}\n💰 ${fmt(o.harga)}\n📌 ${o.status}</blockquote>`)
      .join('\n');
    bot.sendMessage(chatId, t, { parse_mode: 'HTML' });
    return answer();
  }

  // Approve / reject order
  if (data.startsWith('proses_') || data.startsWith('tolak_')) {
    const [act, orderId, targetUid] = data.split('_');
    if (!isAdmin(uid)) return answer('❌ Bukan admin!');
    const order = db.orders[orderId];
    if (!order) return answer('Order tidak ditemukan');
    if (act === 'proses') {
      order.status = 'diproses'; save();
      bot.sendMessage(parseInt(targetUid),
        `🔄 <b>PESANAN DIPROSES</b>\n${LINE}\n\n<blockquote>🧾 Order: <code>${orderId}</code>\n⏳ Estimasi: 10–15 menit\n\nTunggu ya, detail VPS akan dikirim ke sini.</blockquote>\n\n📞 Jika lama, hubungi ${CONFIG.support}`,
        { parse_mode: 'HTML' });
      bot.editMessageCaption(
        `✅ <b>DIPROSES</b> — ${orderId}\n👤 @${esc(order.username)}\n📦 ${esc(order.produk)}\n💰 ${fmt(order.harga)}\n\n➡️ Kirim detail VPS:\n<code>/kirim ${orderId} IP USER PASS PORT</code>`,
        { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
      return answer('✅ Diproses!');
    } else {
      order.status = 'ditolak'; save();
      bot.sendMessage(parseInt(targetUid),
        `❌ <b>PESANAN DITOLAK</b>\n\n<blockquote>🧾 Order: <code>${orderId}</code>\nBukti transfer tidak valid.\n\n📞 ${CONFIG.support}</blockquote>`, { parse_mode: 'HTML' });
      bot.editMessageCaption(`❌ <b>DITOLAK</b> — ${orderId}`, { chat_id: chatId, message_id: msgId, parse_mode: 'HTML' }).catch(() => {});
      return answer('❌ Ditolak!');
    }
  }
});

// ---------- Message handler ----------
bot.on('message', async (msg) => {
  const chatId = msg.chat.id, uid = msg.from.id, text = (msg.text || '').trim();

  // Admin: set QRIS
  if (isAdmin(uid) && userState[uid]?.step === 'setqris' && msg.photo) {
    db.qris = msg.photo[msg.photo.length - 1].file_id; save();
    delete userState[uid];
    return bot.sendMessage(chatId, '✅ QRIS tersimpan!', { reply_markup: adminMenuKeyboard() });
  }

  // Admin: add produk
  if (isAdmin(uid) && userState[uid]?.step === 'add_nama') {
    userState[uid].nama = text; userState[uid].step = 'add_desk';
    return bot.sendMessage(chatId, '📝 Kirim deskripsi produk:');
  }
  if (isAdmin(uid) && userState[uid]?.step === 'add_desk') {
    userState[uid].deskripsi = text; userState[uid].step = 'add_harga';
    return bot.sendMessage(chatId, '💰 Kirim harga (angka, contoh: 15000):');
  }
  if (isAdmin(uid) && userState[uid]?.step === 'add_harga') {
    const harga = parseInt(text.replace(/\D/g, ''));
    if (!harga) return bot.sendMessage(chatId, '❌ Harga harus angka. Coba lagi:');
    db.products.push({ nama: userState[uid].nama, deskripsi: userState[uid].deskripsi, harga });
    save(); delete userState[uid];
    return bot.sendMessage(chatId, '✅ Produk ditambahkan!', { reply_markup: adminMenuKeyboard() });
  }

  // Admin: delete produk
  if (isAdmin(uid) && userState[uid]?.step === 'del_idx') {
    const idx = parseInt(text) - 1;
    if (db.products[idx]) {
      const removed = db.products.splice(idx, 1)[0]; save();
      bot.sendMessage(chatId, `🗑 "${removed.nama}" dihapus.`, { reply_markup: adminMenuKeyboard() });
    } else bot.sendMessage(chatId, '❌ Nomor tidak valid.');
    delete userState[uid];
    return;
  }

  // User kirim bukti transfer
  if (userState[uid]?.step === 'await_bukti' && msg.photo) {
    const st = userState[uid];
    const p = db.products[st.productIndex];
    if (!p) { delete userState[uid]; return bot.sendMessage(chatId, '❌ Order ulang ya.'); }
    db.orders[st.orderId] = {
      orderId: st.orderId, userId: uid, username: msg.from.username || msg.from.first_name,
      produk: p.nama, harga: p.harga, status: 'menunggu_konfirmasi'
    };
    save();
    userState[uid].step = 'menunggu_proses';

    await trackSend(chatId, 'sendMessage',
      `✅ <b>BUKTI DITERIMA!</b>\n${LINE}\n\n<blockquote>🧾 Order: <code>${st.orderId}</code>\n⏳ Sedang diproses...\nEstimasi: 10–15 menit</blockquote>\n\n📞 Jika lama, hubungi ${CONFIG.support}`,
      { parse_mode: 'HTML' });

    CONFIG.adminIds.forEach(aid => {
      bot.sendPhoto(aid, msg.photo[msg.photo.length - 1].file_id,
        {
          caption: `🔔 <b>ORDER BARU!</b>\n${LINE}\n\n<blockquote>🧾 ${st.orderId}\n👤 @${esc(msg.from.username || msg.from.first_name)} (<code>${uid}</code>)\n📦 ${esc(p.nama)}\n💰 ${fmt(p.harga)}</blockquote>`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Proses', callback_data: `proses_${st.orderId}_${uid}` },
               { text: '❌ Tolak', callback_data: `tolak_${st.orderId}_${uid}` }]
            ]
          }
        });
    });
    return;
  }

  // Admin kirim detail VPS
  if (isAdmin(uid) && text.startsWith('/kirim ')) {
    const parts = text.split(' ');
    const orderId = parts[1];
    const order = db.orders[orderId];
    if (!order) return bot.sendMessage(chatId, '❌ Format: /kirim ORDERID IP USER PASS PORT');
    const d = parts.slice(2);
    const vpsDetail =
      `🎉 <b>VPS KAMU SIAP!</b>\n${LINE}\n\n` +
      `<blockquote>🌐 IP: <code>${d[0] || '-'}</code>\n👤 User: <code>${d[1] || '-'}</code>\n🔑 Password: <code>${d[2] || '-'}</code>\n🔌 Port: <code>${d[3] || '-'}</code></blockquote>\n\n` +
      `🙏 Terima kasih sudah order di <b>${CONFIG.storeName}</b>!`;
    const dm = await trackSend(order.userId, 'sendMessage', vpsDetail, { parse_mode: 'HTML' });
    keep.add(dm.message_id);
    order.status = 'selesai'; save();
    return bot.sendMessage(chatId, `✅ Detail VPS terkirim ke pelanggan (${orderId})`);
  }
});


console.log('Ready. Admin:', CONFIG.adminIds);
