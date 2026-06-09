#!/bin/bash
# 宝塔/MySQL 默认 socket 在 /tmp/mysql.sock，直接 mysql 命令会连错路径，请用 -h 127.0.0.1
set -euo pipefail
cd "$(dirname "$0")/.."

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:-scribeai}"
DB_NAME="${DB_NAME:-scribeai}"

if [ -z "${DB_PASS:-}" ]; then
  echo "用法: DB_PASS=你的密码 ./scripts/migrate-summary-templates.sh"
  exit 1
fi

echo ">>> 执行 summary_templates 迁移 (${DB_HOST}:${DB_PORT}/${DB_NAME})"
mysql -h "$DB_HOST" -P "$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" \
  < prisma/migrations/20260610120000_summary_templates/migration.sql || true

echo ">>> 补全索引与外键（若迁移中断）"
mysql -h "$DB_HOST" -P "$DB_PORT" -u"$DB_USER" -p"$DB_PASS" "$DB_NAME" <<'SQL'
SET @idx_exists = (SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='summary' AND index_name='Summary_transcriptId_templateId_key');
SET @sql = IF(@idx_exists=0, 'CREATE UNIQUE INDEX Summary_transcriptId_templateId_key ON Summary(transcriptId, templateId)', 'SELECT 1');
PREPARE s FROM @sql; EXECUTE s; DEALLOCATE PREPARE s;
SET @fk_exists = (SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='summary' AND constraint_name='Summary_templateId_fkey');
SET @sql2 = IF(@fk_exists=0, 'ALTER TABLE Summary ADD CONSTRAINT Summary_templateId_fkey FOREIGN KEY (templateId) REFERENCES SummaryTemplate(id) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE s2 FROM @sql2; EXECUTE s2; DEALLOCATE PREPARE s2;
SQL

echo ">>> 重新 build 后端（同步 Prisma 客户端到 dist）"
npm run build

echo ">>> 完成。请重启后端: npm start 或重启对应 systemd/宝塔进程"
