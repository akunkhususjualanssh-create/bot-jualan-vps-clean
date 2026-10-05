#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════
#   ONE-CLICK INSTALLER — BOT JUALAN VPS
#   Pakai:  bash install.sh
#   Nanti ditanya: token bot + owner id + dll
# ═══════════════════════════════════════════════════════
set -e

REPO="https://github.com/akunkhususjualanssh-create/bot-jualan-vps-clean.git"
DIR="$HOME/bot-jualan-vps"

echo "═══════════════════════════════════════"
echo "   🚀 INSTALLER BOT JUALAN VPS"
echo "═══════════════════════════════════════"

# ── 1. Node.js ──
if ! command -v node >/dev/null 2>&1; then
  echo "[*] Node.js belum ada → installing Node 20..."
  if command -v apt >/dev/null 2>&1; then
    apt-get update -qq
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null 2>&1
    apt-get install -y nodejs >/dev/null 2>&1
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y nodejs
  elif command -v yum >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
    yum install -y nodejs
  else
    echo "[✗] Gak ketemu package manager. Install Node.js manual dulu: https://nodejs.org"
    exit 1
  fi
fi
echo "[✓] Node $(node -v)"

# ── 2. Clone repo ──
if [ -d "$DIR/.git" ]; then
  echo "[*] Folder sudah ada → update repo..."
  cd "$DIR" && git pull -q || true
else
  echo "[*] Clone repo..."
  git clone -q "$REPO" "$DIR"
  cd "$DIR"
fi
echo "[✓] Repo siap"

# ── 3. Install dependency ──
echo "[*] Install dependency..."
npm install --no-audit --no-fund >/dev/null 2>&1
echo "[✓] Dependency terpasang"

# ── 4. Tanya konfigurasi ──
if [ -f .env ]; then
  echo "[i] File .env sudah ada."
  read -p "    Isi ulang konfigurasi? (y/N): " RECONF
else
  RECONF="y"
fi

if [ "$RECONF" = "y" ] || [ "$RECONF" = "Y" ]; then
  echo ""
  echo "─── KONFIGURASI BOT ───"
  read -p "🤖 Token bot (dari @BotFather): " BOT_TOKEN
  read -p "👑 Owner ID / Admin ID (contoh: 7761880504): " ADMIN_IDS
  read -p "📞 Username support (default @gensshstore): " SUPPORT
  read -p "🏪 Nama toko (default GEN SSH STORE): " STORE_NAME
  SUPPORT=${SUPPORT:-@gensshstore}
  STORE_NAME=${STORE_NAME:-GEN SSH STORE}

  cat > .env <<ENVEOF
BOT_TOKEN=$BOT_TOKEN
ADMIN_IDS=$ADMIN_IDS
SUPPORT=$SUPPORT
STORE_NAME=$STORE_NAME
ENVEOF
  echo "[✓] .env tersimpan"
fi

# ── 5. Stop bot lama ──
pkill -f "node.*$DIR/index.js" 2>/dev/null || true
screen -S botvps -X quit 2>/dev/null || true
pm2 delete botvps 2>/dev/null || true
sleep 1

# ── 6. Jalankan 24 jam ──
if command -v pm2 >/dev/null 2>&1; then
  RUNNER="pm2"
elif command -v screen >/dev/null 2>&1; then
  RUNNER="screen"
else
  RUNNER="none"
fi

case "$RUNNER" in
  pm2)
    echo "[*] Jalankan via PM2 (auto-restart)..."
    pm2 start index.js --name botvps >/dev/null
    pm2 save >/dev/null
    ;;
  screen)
    echo "[*] Jalankan via screen..."
    screen -dmS botvps bash -c "cd '$DIR' && node index.js > bot.log 2>&1"
    ;;
  *)
    echo "[!] screen & pm2 tidak ada → jalan langsung (Ctrl+C = stop)"
    node index.js
    exit 0
    ;;
esac

# ── 7. Verifikasi ──
sleep 4
if pgrep -f "node.*index.js" >/dev/null; then
  echo "═══════════════════════════════════════"
  echo "  ✅ BOT JALAN! 🎉"
  echo "═══════════════════════════════════════"
  echo "  Log     : tail -f $DIR/bot.log"
  if [ "$RUNNER" = "pm2" ]; then
    echo "  Status  : pm2 status"
    echo "  Stop    : pm2 stop botvps"
    echo "  Restart : pm2 restart botvps"
  else
    echo "  Masuk   : screen -r botvps"
    echo "  Stop    : screen -S botvps -X quit"
  fi
  echo "═══════════════════════════════════════"
else
  echo "[✗] Bot gagal start. Log:"
  tail -20 "$DIR/bot.log" 2>/dev/null || true
  exit 1
fi
