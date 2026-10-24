#!/usr/bin/env sh
set -eu
mkdir -p backups
backup_file="backups/eatfood-$(date +%Y%m%d-%H%M%S).dump"
docker compose exec -T db pg_dump -U eatfood -d eatfood -Fc > "$backup_file"
printf 'Backup saved: %s\n' "$backup_file"
