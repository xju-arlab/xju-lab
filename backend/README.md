# Backend

Java 21 / Spring Boot 3.5.16 modular monolith. PostgreSQL is the source of truth; Flyway owns schema changes, Redis backs HTTP sessions, and `outbox_event` records external work in the same database transaction. API contracts live in [`../contracts/openapi.yaml`](../contracts/openapi.yaml).

## Local development

From the repository root:

```bash
cp .env.example .env
docker compose --env-file .env -f deploy/compose.yaml --profile local-idp up -d postgres redis object-store mailpit keycloak
set -a; . ./.env; set +a
export OIDC_CLIENT_ID=lab-dev OIDC_CLIENT_SECRET=lab-dev-secret
export OIDC_ISSUER_URI=http://localhost:8081/realms/xju-lab
export LAB_FRONTEND_ORIGIN=http://localhost:5173
export REDIS_PORT=${REDIS_HOST_PORT:-16379}
cd backend
SPRING_PROFILES_ACTIVE=dev ./mvnw spring-boot:run
```

The local-only Keycloak realm has three isolated test users. Their passwords are `local-admin-change-me`, `local-member-a-change-me`, and `local-member-b-change-me`; change them before exposing the local test identity provider to another network. The first account has `LAB_ADMIN` only in the `dev` profile. No production profile imports these users or roles.

In another WSL shell, run `cd frontend && pnpm install --frozen-lockfile && pnpm dev` for the explicitly selected demo UI, or `pnpm dev:api` to use the session API. API mode reports service failures and never loads demo data. Visit `http://localhost:5173`.

## Verification

```bash
./mvnw -B verify
```

The backend integration suite runs the Flyway migrations against real PostgreSQL and Redis containers through Testcontainers. Docker must be available. The repository CI runs this suite together with the frontend build/regressions and OpenAPI type generation check.

## Production

The `prod` profile requires OIDC issuer/client settings, HTTPS frontend origin, admission group, PostgreSQL, and Redis configuration. It rejects loopback or placeholder OIDC issuers and non-HTTPS frontends, and enables Secure/HttpOnly session cookies. Configure `BOOTSTRAP_ADMIN_ISSUER` and `BOOTSTRAP_ADMIN_SUBJECT` with the exact verified identity; the first matching, admitted login receives the one-time `SUPER_ADMIN` bootstrap and an audit event. Do not enable the local Keycloak profile in production.

Compose volumes are service data, not disposable reset targets. Keep `.env` local, make protected backups, and never run `down -v` against non-test data.
