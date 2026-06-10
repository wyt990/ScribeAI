#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."

if [ -f .env ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "请在 backend/.env 中配置 DATABASE_URL"
  exit 1
fi

# 从 DATABASE_URL 解析用户库名（简单解析 mysql://user:pass@host:port/db）
DB_USER=$(echo "$DATABASE_URL" | sed -n 's|mysql://\([^:]*\):.*|\1|p')
DB_PASS=$(echo "$DATABASE_URL" | sed -n 's|mysql://[^:]*:\([^@]*\)@.*|\1|p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')

echo ">>> 执行 manager_settings 迁移 (${DB_HOST}:${DB_PORT}/${DB_NAME})"
mysql -h "$DB_HOST" -P "$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  < prisma/migrations/20260610230000_manager_settings/migration.sql

echo ">>> npm run build"
npm run build

echo ">>> 完成。请手动重启前后端服务。"
