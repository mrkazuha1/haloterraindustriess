#!/usr/bin/env bash
# Установка сайта HALO TERRA INDUSTRIES на чистый VPS с Ubuntu 22.04 или 24.04.
# Запуск из папки сайта:  sudo bash deploy/setup-vps.sh
# Скрипт ставит Node.js 20 и pm2, запускает сайт на порту 3000 и включает автозапуск.
# Домен и A-запись у регистратора скрипт не настраивает.
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите скрипт с sudo: sudo bash deploy/setup-vps.sh"
  exit 1
fi

SITE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"

read -r -s -p "Придумайте пароль владельца (логин Owner): " OWNER_PASSWORD
echo
if [ "${#OWNER_PASSWORD}" -lt 6 ]; then
  echo "Пароль должен быть не короче 6 символов."
  exit 1
fi

read -r -p "Адрес сайта на GitHub, например https://mrkazuha1.github.io (Enter — пропустить): " ALLOWED_ORIGIN
ALLOWED_ORIGIN="$(printf '%s' "$ALLOWED_ORIGIN" | tr -d '[:space:]')"

echo "==> Node.js"
if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  apt-get update -y
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
echo "Node.js $(node -v)"

echo "==> pm2"
npm install -g pm2

echo "==> Запуск сайта на порту $PORT"
cd "$SITE_DIR"
pm2 delete halo-terra >/dev/null 2>&1 || true
PORT="$PORT" OWNER_PASSWORD="$OWNER_PASSWORD" ALLOWED_ORIGIN="$ALLOWED_ORIGIN" pm2 start server.js --name halo-terra --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null

echo "==> Порт $PORT"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT"/tcp
else
  echo "ufw не включён. Если у хостинга есть своя панель файрвола, откройте в ней порт $PORT."
fi

echo "==> Проверка"
sleep 2
if curl -fsS "http://127.0.0.1:$PORT/api/me" >/dev/null; then
  echo "Сайт отвечает на порту $PORT."
else
  echo "Сайт не отвечает. Посмотрите логи: pm2 logs halo-terra"
  exit 1
fi

IP="$(curl -fsS https://api.ipify.org 2>/dev/null || echo 'IP_СЕРВЕРА')"
echo
echo "Готово. Осталось в панели регистратора домена создать A-запись:"
echo "  haloterraindustries.ru  ->  $IP"
echo "После обновления DNS сайт откроется по адресу http://haloterraindustries.ru:$PORT"
