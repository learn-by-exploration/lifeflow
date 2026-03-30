#!/bin/bash
# LifeFlow Database Backup Script
# Usage: bash scripts/backup.sh [backup_dir]
#
# Creates timestamped SQLite backup + JSON export.
# Keeps last 30 backups by default.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DB_PATH="${PROJECT_DIR}/lifeflow.db"
BACKUP_DIR="${1:-${PROJECT_DIR}/backups}"
KEEP_COUNT=30
TIMESTAMP=$(date +%Y-%m-%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB_PATH" ]; then
  echo "SKIP: Database not found at $DB_PATH (CI or fresh install)"
  exit 0
fi

BACKUP_FILE="${BACKUP_DIR}/lifeflow-${TIMESTAMP}.db"
JSON_FILE="${BACKUP_DIR}/lifeflow-${TIMESTAMP}.json"

node -e "
const Database = require('better-sqlite3');
const fs = require('fs');
const dbPath = process.argv[1];
const backupPath = process.argv[2];
const jsonPath = process.argv[3];
const pkgPath = process.argv[4];

const db = new Database(dbPath, { readonly: true });
db.backup(backupPath).then(() => {
  console.log('DB backup:', backupPath);
  const bk = new Database(backupPath, { readonly: true });
  const data = {
    backupDate: new Date().toISOString(),
    version: require(pkgPath).version,
    areas: bk.prepare('SELECT * FROM life_areas').all(),
    goals: bk.prepare('SELECT * FROM goals').all(),
    tasks: bk.prepare('SELECT * FROM tasks').all(),
    subtasks: bk.prepare('SELECT * FROM subtasks').all(),
    tags: bk.prepare('SELECT * FROM tags').all(),
    task_tags: bk.prepare('SELECT * FROM task_tags').all(),
    task_comments: bk.prepare('SELECT * FROM task_comments').all(),
    task_templates: bk.prepare('SELECT * FROM task_templates').all(),
    settings: bk.prepare('SELECT * FROM settings').all(),
  };
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
  console.log('JSON backup:', jsonPath);
  bk.close();
  db.close();
}).catch(err => {
  console.error('Backup failed:', err.message);
  db.close();
  process.exit(1);
});
" "$DB_PATH" "$BACKUP_FILE" "$JSON_FILE" "$PROJECT_DIR/package.json"

# Prune old backups (keep last N)
cd "$BACKUP_DIR"
ls -t lifeflow-*.db 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -f
ls -t lifeflow-*.json 2>/dev/null | tail -n +$((KEEP_COUNT + 1)) | xargs -r rm -f

echo "Backup complete. $(ls lifeflow-*.db 2>/dev/null | wc -l) backups retained."
