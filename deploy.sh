#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$repo_root" || ! -f "$repo_root/deploy/compose.yaml" ]]; then
  echo "Run ./deploy.sh from a cloned xju-lab repository." >&2
  exit 2
fi
cd "$repo_root"

branch="$(git branch --show-current)"
if [[ "$branch" != "main" ]]; then
  echo "Deployment is allowed from main only (current branch: $branch)." >&2
  exit 2
fi

origin="$(git remote get-url origin)"
case "$origin" in
  https://github.com/xju-arlab/xju-lab|https://github.com/xju-arlab/xju-lab.git|git@github.com:xju-arlab/xju-lab.git|ssh://git@github.com/xju-arlab/xju-lab.git) ;;
  *) echo "Unexpected origin remote: $origin" >&2; exit 2 ;;
esac

if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Tracked files are modified. Commit or restore them before deploying." >&2
  exit 2
fi

echo "Updating main from origin..."
deployment_script_before="$(git hash-object deploy.sh)"
git pull --ff-only origin main
if [[ "$(git hash-object deploy.sh)" != "$deployment_script_before" ]]; then
  echo "Deployment script updated; restarting with current main..."
  exec bash "$repo_root/deploy.sh"
fi

command -v docker >/dev/null || { echo "Docker is required." >&2; exit 2; }
docker compose version >/dev/null
command -v curl >/dev/null || { echo "curl is required for the local health check." >&2; exit 2; }

if [[ ! -f .env ]]; then
  echo "Missing production .env. Copy .env.example to .env and set production values first." >&2
  exit 2
fi
chmod 600 .env

required=(POSTGRES_PASSWORD REDIS_PASSWORD OIDC_ISSUER_URI OIDC_CLIENT_ID OIDC_CLIENT_SECRET BOOTSTRAP_ADMIN_ISSUER BOOTSTRAP_ADMIN_SUBJECT PRODUCT_REGISTRATION_DOMAIN APPROVAL_TOKEN_ENCRYPTION_KEY SMTP_HOST MAIL_FROM LAB_FRONTEND_ORIGIN)
env_value() {
  local value
  value="$(grep -m1 -E "^$1=" .env | cut -d= -f2- || true)"
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

for key in "${required[@]}"; do
  value="$(env_value "$key")"
  if [[ -z "$value" ]]; then
    echo "Missing required production value: $key" >&2
    exit 2
  fi
  case "${value,,}" in
    *change-me*|*example.invalid*|replace-with*|local-*|*localhost*|*mailpit*)
      echo "Replace the development placeholder for: $key" >&2
      exit 2
      ;;
  esac
done

if [[ "$(env_value LAB_FRONTEND_ORIGIN)" != "https://lab.icthub.top" ]]; then
  echo "LAB_FRONTEND_ORIGIN must be https://lab.icthub.top." >&2
  exit 2
fi
if [[ "$(env_value PRODUCT_REGISTRATION_DOMAIN | tr '[:upper:]' '[:lower:]')" != "icthub.top" ]]; then
  echo "PRODUCT_REGISTRATION_DOMAIN must be icthub.top." >&2
  exit 2
fi
if [[ "$(env_value OIDC_ISSUER_URI)" != https://* ]]; then
  echo "OIDC_ISSUER_URI must be an HTTPS issuer." >&2
  exit 2
fi
if [[ "$(env_value BOOTSTRAP_ADMIN_ISSUER)" != "$(env_value OIDC_ISSUER_URI)" ]]; then
  echo "BOOTSTRAP_ADMIN_ISSUER must match OIDC_ISSUER_URI exactly." >&2
  exit 2
fi
approval_key="$(env_value APPROVAL_TOKEN_ENCRYPTION_KEY)"
if [[ ${#approval_key} -lt 32 ]]; then
  echo "APPROVAL_TOKEN_ENCRYPTION_KEY must contain at least 32 characters." >&2
  exit 2
fi

if [[ "$(env_value SMTP_AUTH | tr '[:upper:]' '[:lower:]')" =~ ^(true|1|yes)$ ]]; then
  for key in SMTP_USERNAME SMTP_PASSWORD; do
    if [[ -z "$(env_value "$key")" ]]; then
      echo "SMTP_AUTH is enabled but $key is empty." >&2
      exit 2
    fi
  done
fi

compose=(docker compose --env-file .env -f deploy/compose.yaml --profile app)
"${compose[@]}" config --quiet
echo "Building and starting XJU Lab..."
"${compose[@]}" up -d --build app web

for attempt in $(seq 1 60); do
  if curl --noproxy 127.0.0.1 --fail --silent --max-time 5 http://127.0.0.1:18080/ >/dev/null \
      && curl --noproxy 127.0.0.1 --fail --silent --max-time 5 http://127.0.0.1:18080/api/v1/health >/dev/null \
      && curl --noproxy 127.0.0.1 --fail --silent --max-time 5 http://127.0.0.1:18080/api/v1/ready >/dev/null; then
    echo "Deployment is responding."
    echo "Local upstream: http://127.0.0.1:18080"
    echo "Public URL: https://lab.icthub.top"
    "${compose[@]}" ps
    exit 0
  fi
  sleep 2
done

echo "The local web/API health check did not pass. Inspect: docker compose --env-file .env -f deploy/compose.yaml --profile app logs --tail=100 app web" >&2
"${compose[@]}" ps
exit 1
