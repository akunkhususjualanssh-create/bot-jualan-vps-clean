/**
 * GOMERCH PAYMENT MODULE — QRIS dinamis GoPay Merchant + auto-deteksi
 * Untuk bot jualan VPS GEN SSH STORE.
 */
const fs = require('fs');
const path = require('path');

const BASE = 'https://qris.adijayavpnpedia.cloud';
const CREDS = JSON.parse(fs.readFileSync(path.join(__dirname, 'gomerch.json')));

const STATIC_QR = CREDS.static_qr;
let accessToken = CREDS.access_token;
let refreshToken = CREDS.refresh_token || null;

async function api(p, body) {
  const res = await fetch(BASE + p, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function refresh() {
  if (!refreshToken) return false;
  try {
    const d = await api('/gomerch/api/auth/refresh', { refresh_token: refreshToken });
    if (d.success && d.data?.access_token) {
      accessToken = d.data.access_token;
      if (d.data.refresh_token) refreshToken = d.data.refresh_token;
      const c = { ...CREDS, access_token: accessToken, refresh_token: refreshToken };
      fs.writeFileSync(path.join(__dirname, 'gomerch.json'), JSON.stringify(c, null, 2));
      console.log('[GoMerch] token refreshed');
      return true;
    }
  } catch (e) {}
  return false;
}

async function getMutasi() {
  const s = new Date(); s.setHours(0, 0, 0, 0);
  const e = new Date(); e.setHours(23, 59, 59, 999);
  let body = { access_token: accessToken, merchant_id: CREDS.merchant_id, start_time: s.toISOString(), end_time: e.toISOString() };
  let d = await api('/gomerch/api/mutasi', body);
  const msg = JSON.stringify(d);
  if (msg.includes('Invalid/Expired token') || msg.includes('expired')) {
    if (await refresh()) { body.access_token = accessToken; d = await api('/gomerch/api/mutasi', body); }
  }
  return d;
}

async function generateQris(amount) {
  const d = await api('/gomerch/api/qris/generate', { amount, static_qr: STATIC_QR });
  if (!d.success) throw new Error(d.message || 'gagal generate QRIS');
  return d; // { qr_url, qris_string, amount, success }
}

async function downloadQrImage(qrUrl) {
  const r = await fetch(qrUrl);
  return Buffer.from(await r.arrayBuffer());
}

/**
 * Pantau pembayaran sebuah order.
 * watch({ amount, startTime, onPaid(matchInfo), onExpire(), intervalMs })
 * return { stop() }
 */
function watchPayment({ amount, startTime, onPaid, onExpire, intervalMs = 5000, timeoutMs = 15 * 60 * 1000 }) {
  const expected = Math.floor(amount);
  const deadline = Date.now() + timeoutMs;
  let stopped = false;
  const timer = setInterval(async () => {
    if (stopped) return clearInterval(timer);
    if (Date.now() > deadline) {
      stopped = true; clearInterval(timer);
      return onExpire && onExpire();
    }
    try {
      const d = await getMutasi();
      const trx = d?.data?.transactions || [];
      const match = trx.find(t =>
        Math.floor(t.gross_amount || 0) === expected &&
        t.transaction_status === 'SETTLEMENT' &&
        new Date(t.transaction_time || t.settlement_time) >= new Date(startTime)
      );
      if (match) {
        stopped = true; clearInterval(timer);
        return onPaid && onPaid(match);
      }
    } catch (e) {
      console.error('[GoMerch] poll err', e.message);
    }
  }, intervalMs);
  return { stop() { stopped = true; clearInterval(timer); } };
}

module.exports = { generateQris, downloadQrImage, getMutasi, watchPayment };
