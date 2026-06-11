═══════════════════════════════════════════════════════════════
BLOCK E1 — SMOKE-SERVICE-TOKEN-AUTH  (final hardening / smoke)
Phase E. The closing block.
═══════════════════════════════════════════════════════════════

GOAL
Final end-to-end smoke + service-token auth hardening before calling the build done.

SCOPE
  - Service-token auth for internal/service-to-service + cron calls (the hourly PM-auto-WO
    cron at :05, daily probes, etc.) so they authenticate properly, not via a user session.
  - Daily end-to-end production smoke probes (health of the critical paths: a load can
    be created, a settlement read, an invoice read, spine writing) — read-only checks,
    alert on failure.
  - Confirm RLS holds on every endpoint touched this project (no tenant leak).
  - No financial writes. Hardening + verification only.

verify-smoke-service-token-auth.mjs: assert service-token path enforced on
service/cron endpoints; assert smoke probes are read-only; assert RLS coverage.
PRE-PUSH validate. Push BLOCK_ID=E1-SMOKE-SERVICE-TOKEN-AUTH, ls-remote, PR.
Report PR# + SHA. This is the final block — after it merges + deploys green, the
planned build scope is complete.
