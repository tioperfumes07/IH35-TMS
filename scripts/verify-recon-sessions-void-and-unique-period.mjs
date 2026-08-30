#!/usr/bin/env node
/**
 * GO-ACCT-01-DUP-RECON-SESSIONS-ONE-PERIOD -- static-shape guard.
 *
 * banking.reconciliation_sessions had no void/cancel mechanism at all (only active/terminal-SUCCESS
 * statuses), so a duplicate POST /start for the same bank_account_id + period silently created a
 * second row for the same real-world statement -- confirmed live, USMCA FREIGHT August 2026 carried
 * one correctly 'reconciled' row plus two stray 'open' duplicates.
 *
 * This guard confirms the fix: void-not-delete status + columns
 * (202613300700_go_acct_01_recon_sessions_void_status_and_unique.sql), a route-level pre-check in
 * POST /start that refuses a second non-voided session for the same account+period with a clear 409,
 * a POST /:sessionId/void route that can never void a 'reconciled' session (BANK-DOM-02's own
 * immutability law), and the DB-level backstop -- a partial UNIQUE index excluding voided rows.
 */
import { readFileSync } from "node:fs";

const MIGRATION_FILE = "db/migrations/202613300700_go_acct_01_recon_sessions_void_status_and_unique.sql";
const ROUTES_FILE = "apps/backend/src/banking/reconciliation.routes.ts";

function analyze(migration, routes) {
  const failures = [];

  if (!/ADD COLUMN IF NOT EXISTS voided_at timestamptz/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: voided_at column missing`);
  }
  if (!/ADD COLUMN IF NOT EXISTS voided_by_user_id uuid REFERENCES identity\.users\(id\)/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: voided_by_user_id column missing`);
  }
  if (!/ADD COLUMN IF NOT EXISTS void_reason text/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: void_reason column missing`);
  }
  if (!/CHECK \(status IN \('open', 'reconciled', 'disputed', 'finalized', 'reopened', 'voided'\)\)/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: status CHECK does not include 'voided' alongside every pre-existing status`);
  }
  if (!/CREATE UNIQUE INDEX IF NOT EXISTS ux_reconciliation_sessions_one_per_account_period/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: partial unique index is missing`);
  }
  if (!/ON banking\.reconciliation_sessions \(bank_account_id, period_start, period_end\)\s*\n\s*WHERE status <> 'voided'/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: unique index is not scoped to (bank_account_id, period_start, period_end) WHERE status <> 'voided'`);
  }
  if (!/AND rs\.status <> 'reconciled';/.test(migration)) {
    failures.push(`${MIGRATION_FILE}: duplicate backfill does not refuse to void a 'reconciled' row`);
  }

  if (!/WHERE bank_account_id = \$1::uuid\s*\n\s*AND operating_company_id = \$2::uuid\s*\n\s*AND period_start = \$3::date\s*\n\s*AND period_end = \$4::date\s*\n\s*AND status <> 'voided'/.test(routes)) {
    failures.push(`${ROUTES_FILE}: POST /start does not check for an existing non-voided session on the same account+period`);
  }
  if (!/return reply\.code\(409\)\.send\(\{\s*\n\s*error: "session_already_exists"/.test(routes)) {
    failures.push(`${ROUTES_FILE}: POST /start does not return 409 session_already_exists`);
  }
  if (!/app\.post\("\/api\/v1\/banking\/reconciliation\/:sessionId\/void"/.test(routes)) {
    failures.push(`${ROUTES_FILE}: POST /:sessionId/void route is missing`);
  }
  if (!/if \(session\.status === "reconciled"\) \{\s*\n\s*return reply\.code\(422\)\.send\(\{\s*\n\s*error: "reconciled_session_locked"/.test(routes)) {
    failures.push(`${ROUTES_FILE}: /void does not refuse to void a 'reconciled' session`);
  }
  if (!/AND status <> 'voided'\s*\n\s*AND status <> 'reconciled'\s*\n\s*RETURNING id/.test(routes)) {
    failures.push(`${ROUTES_FILE}: /void's UPDATE does not exclude both 'voided' and 'reconciled' at the SQL layer (defense-in-depth, not just the earlier read check)`);
  }
  if (!/OWNER_ADMIN_ROLES\.has\(user\.role as ReconciliationRole\)/.test(routes.split('app.post("/api/v1/banking/reconciliation/:sessionId/void"')[1] ?? "")) {
    failures.push(`${ROUTES_FILE}: /void is not gated to Owner/Administrator`);
  }

  return failures;
}

function readAll() {
  return {
    migration: readFileSync(MIGRATION_FILE, "utf8"),
    routes: readFileSync(ROUTES_FILE, "utf8"),
  };
}

function selftest() {
  const { migration, routes } = readAll();
  const good = analyze(migration, routes);
  if (good.length > 0) {
    console.error("verify-recon-sessions-void-and-unique-period --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "migration drops void_reason column",
      apply: (m, r) => [m.replace("  ADD COLUMN IF NOT EXISTS void_reason text;\n", ""), r],
    },
    {
      name: "migration status CHECK loses 'voided'",
      apply: (m, r) => [
        m.replace(
          "CHECK (status IN ('open', 'reconciled', 'disputed', 'finalized', 'reopened', 'voided'))",
          "CHECK (status IN ('open', 'reconciled', 'disputed', 'finalized', 'reopened'))"
        ),
        r,
      ],
    },
    {
      name: "migration's unique index drops the voided exclusion (would forbid ever voiding+re-starting)",
      apply: (m, r) => [
        m.replace(
          "ON banking.reconciliation_sessions (bank_account_id, period_start, period_end)\n    WHERE status <> 'voided';",
          "ON banking.reconciliation_sessions (bank_account_id, period_start, period_end);"
        ),
        r,
      ],
    },
    {
      name: "migration backfill loses the reconciled-row protection (would let automation void a closed period)",
      apply: (m, r) => [m.replace("\n    AND rs.status <> 'reconciled';", ";"), r],
    },
    {
      name: "routes.ts /start loses the pre-existing-session check",
      apply: (m, r) => [
        m,
        r.replace(
          /AND status <> 'voided'\s*\n\s*LIMIT 1/,
          "LIMIT 1"
        ),
      ],
    },
    {
      name: "routes.ts /void route deleted",
      apply: (m, r) => [m, r.replace(/app\.post\("\/api\/v1\/banking\/reconciliation\/:sessionId\/void"[\s\S]*?\n  \}\);\n\n  app\.get\("\/api\/v1\/banking\/reconciliation\/:sessionId"/, 'app.get("/api/v1/banking/reconciliation/:sessionId"')],
    },
    {
      name: "routes.ts /void stops refusing a reconciled session (would let a closed period be voided)",
      apply: (m, r) => [
        m,
        r.replace(
          'if (session.status === "reconciled") {\n      return reply.code(422).send({\n        error: "reconciled_session_locked",\n        message: "A reconciled session is a closed period and cannot be voided — reopen it first if it is genuinely wrong.",\n      });\n    }\n',
          ""
        ),
      ],
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const [mutatedMigration, mutatedRoutes] = mut.apply(migration, routes);
    const failures = analyze(mutatedMigration, mutatedRoutes);
    if (failures.length === 0) {
      console.error(`verify-recon-sessions-void-and-unique-period --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { migration, routes } = readAll();
  const failures = analyze(migration, routes);
  if (failures.length > 0) {
    console.error("verify-recon-sessions-void-and-unique-period: FAIL");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "verify-recon-sessions-void-and-unique-period: OK -- void-not-delete status+columns, /start pre-check, /void route (never on a reconciled session), and the partial unique-index backstop are all wired"
  );
}
