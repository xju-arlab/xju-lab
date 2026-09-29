#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"

command -v pnpm >/dev/null
command -v python3 >/dev/null
command -v docker >/dev/null

echo '== Frontend =='
(cd "$ROOT/frontend" && pnpm build && pnpm test:assessment && pnpm test:seats)

echo '== Backend =='
(cd "$ROOT/backend" && ./mvnw -B verify)

echo '== Printer Agent =='
python3 -m compileall -q "$ROOT/printer-agent/printer_agent" "$ROOT/printer-agent/tests"
(cd "$ROOT/printer-agent" && python3 -m unittest discover -s tests -v)

echo '== Deployment configuration =='
(cd "$ROOT" && docker compose --env-file .env.example -f deploy/compose.yaml config --quiet)

echo 'All local checks passed.'
