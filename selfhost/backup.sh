#!/usr/bin/env bash
# Saves everything of this HiveVoice server into one file: the database (pg_dumpall, all roles and data) and the stored
# files. ./backup.sh writes backups/hivevoice-<date>.tar.gz; copy it to another disk or computer.
# Back: ./setup.sh on a fresh machine, then ./backup.sh --restore backups/hivevoice-….tar.gz
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
if [ "${1:-}" = "--restore" ]; then
  file="${2:?Welche Sicherung? ./backup.sh --restore backups/hivevoice-….tar.gz}"
  tmp="$(mktemp -d)"; tar -xzf "$file" -C "$tmp"
  docker compose up -d --wait db
  docker compose exec -T db psql -q -U postgres -d postgres < "$tmp/db.sql"
  rm -rf data/storage && cp -R "$tmp/storage" data/storage
  rm -rf "$tmp"
  docker compose up -d
  echo "Wiederhergestellt aus $file."
  exit 0
fi
stamp="$(date +%Y-%m-%d-%H%M)"
tmp="$(mktemp -d)"
docker compose exec -T db pg_dumpall -U postgres --clean --if-exists > "$tmp/db.sql"
cp -R data/storage "$tmp/storage"
tar -czf "backups/hivevoice-$stamp.tar.gz" -C "$tmp" db.sql storage
rm -rf "$tmp"
echo "Gesichert: $(pwd)/backups/hivevoice-$stamp.tar.gz"
