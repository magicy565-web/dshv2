#!/bin/sh
# Stop writers for a consistent encrypted snapshot; resume exactly the previously running services.
set -eu
cd "$(dirname "$0")"
compose() { docker compose --env-file private/deployment.env --profile crm --profile tools "$@"; }
running="$(compose ps --status running --services)"
resume() { if [ -n "$running" ]; then compose start $running; fi; }
trap resume EXIT
if [ -n "$running" ]; then compose stop $running; fi
if [ ! -f backups/config ]; then compose run --rm --no-deps backup init; fi
compose run --rm --no-deps backup backup /snapshot
compose run --rm --no-deps backup check
