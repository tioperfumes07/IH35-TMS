═══════════════════════════════════════════════════════════════
BLOCK A9 — AUDIT-CI-EMIT-GUARD  (the lock that keeps it from regressing)
Relates to: Universal Audit Linkage — enforcement. After A2–A5 land.
═══════════════════════════════════════════════════════════════

GOAL
A CI gate that FAILS the build if any mutating endpoint does not emit a spine event.
This is what guarantees audit coverage stays complete as new code is added — the
same philosophy as "we always fix, never defer": you can't merge a mutation that
isn't audited.

TO THE CODER — off current main (after emit-coverage blocks merged):
  git checkout main && git pull origin main && npm install
  git checkout -b feat/a9-audit-ci-emit-guard

NO migration. This is a CI script + ci.yml wiring.

GUARD SCRIPT — scripts/verify-audit-emit-coverage.mjs (Node built-ins only):
  - Walk apps/backend/src/**/*.routes.ts (and services).
  - For each handler that performs a mutation (INSERT/UPDATE/DELETE, or calls a
    create/update/delete/void/post service method), assert the same handler (or the
    service it calls) contains a log_event( call.
  - Maintain an ALLOWLIST file (audit-emit-allowlist.json) for legitimately
    non-auditable endpoints (pure reads mislabeled, health, etc.) — explicit, reviewed.
  - Exit non-zero with a clear list of offending handlers if any mutation lacks emit.

CI WIRING — .github/workflows/ci.yml:
  - add step:  - name: verify:audit-emit-coverage
                 run: npm run verify:audit-emit-coverage
  - package.json: "verify:audit-emit-coverage": "node scripts/verify-audit-emit-coverage.mjs"
  - KEEP ALL existing verify lines (geofence, forced-driver-ack, signed-safety-docs,
    broker-auto-update, time-utilization, + the A-block verifies). Never drop a line.

verify (meta): run the guard against current main; it should PASS once A2–A5 emit
coverage is in. If it flags gaps, those are real — fix the emit, don't weaken the guard.
Push BLOCK_ID=A9-AUDIT-CI-EMIT-GUARD, ls-remote, open PR. Report PR# + SHA.
═══════════════════════════════════════════════════════════════
