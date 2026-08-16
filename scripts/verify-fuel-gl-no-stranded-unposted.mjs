#!/usr/bin/env node
/**
 * FINDING: row 626 (AUDIT-COVERAGE-LIVE) — fuel · full_chain, going-forward slice. The historical
 * $625k / 1,547-transaction backfill (row1, PRE-OP) is Cascade's lane, not this guard's concern.
 *
 * Root-caused live 2026-08-16: 9 TRANSP fuel.fuel_transactions (Relay-sourced, 2026-08-03 through
 * 2026-08-13, $2,541.53 total) were silently stranded unposted. EXPENSE_GL_POSTING_ENABLED was
 * flipped ON for all entities at 2026-08-16 01:06:58 (owner ruling, migration
 * 202612581400_owner_all_entities_non_qbo_flags_on.sql); before that moment it was OFF/unset for
 * TRANSP, so every candidate ingested during that window hit `skipped_flag_off` inside
 * flushFuelGlPostsAfterCommit and was never retried — nothing auto-reflushes a skipped candidate
 * when the flag later flips on. Confirmed via the existing, purpose-built
 * reflushUnpostedFuelGlExpenses (FUEL-01) tool: dry-run showed exactly those 9 candidates with
 * skipped_flag_off=0 (flag now on), then a real run posted all 9 with 0 errors. Live-verified
 * afterward: 0 unposted active fuel transactions remain.
 *
 * That tool is a manual, owner/accountant-gated catch-up — nothing runs it automatically. This
 * guard is the going-forward backstop: if EXPENSE_GL_POSTING_ENABLED is ever toggled off and back
 * on again (as it demonstrably was once already), a new stranded backlog would again sit silently
 * until someone thinks to run FUEL-01 by hand. A guard that ages out ANY unposted active fuel
 * transaction older than a few days, while its entity's flag is genuinely on, catches that
 * regardless of cause.
 *
 * Static check (always runs): the reflush service's selection predicate (archived_at IS NULL, no
 * posting_batches row) and its "never enables the flag" contract are intact on disk.
 *
 * Live check (opt-in): no ACTIVE fuel transaction older than STALE_THRESHOLD_DAYS remains unposted
 * for an entity whose EXPENSE_GL_POSTING_ENABLED is currently true.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const require = createRequire(import.meta.url);
const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const { Client } = pg;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-gl-no-stranded-unposted";
const REFLUSH_SERVICE_REL = "apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.ts";
const STALE_THRESHOLD_DAYS = 3;

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertReflushServiceIntact(source) {
  const errors = [];
  if (!source.includes("ft.archived_at IS NULL")) {
    errors.push("reflush service no longer restricts to active (archived_at IS NULL) rows — could resurrect voided fuel transactions");
  }
  if (!source.includes("pb.id IS NULL")) {
    errors.push("reflush service no longer restricts to rows missing a posting_batches row — could double-post");
  }
  if (!source.includes("Does NOT enable the flag")) {
    errors.push("reflush service's contract no longer documents that it never enables EXPENSE_GL_POSTING_ENABLED");
  }
  return errors;
}

function selftest() {
  const problems = [];
  const live = read(REFLUSH_SERVICE_REL);

  const liveErrors = assertReflushServiceIntact(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "archived-row guard dropped",
      live.replace("ft.archived_at IS NULL", "true"),
      "no longer restricts to active (archived_at IS NULL) rows",
    ],
    [
      "already-posted guard dropped",
      live.replace("pb.id IS NULL", "true"),
      "no longer restricts to rows missing a posting_batches row",
    ],
    [
      "never-enables-flag contract line removed",
      live.replace(/Does NOT enable the flag\./, "removed"),
      "no longer documents that it never enables",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertReflushServiceIntact(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

async function liveScan() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString || process.env.ENABLE_LIVE_DB_UNIT_TEST_GUARD !== "true") {
    const missing = !connectionString ? "DATABASE_URL is unset" : "ENABLE_LIVE_DB_UNIT_TEST_GUARD is not 'true'";
    console.log(`${LABEL} — static checks PASSED · SKIPPED-DB-CHECK (${missing}); the live scan did NOT run`);
    return;
  }

  const client = new Client(buildPgClientConfig(connectionString));
  await client.connect();
  try {
    // Single multi-statement query — see ACCT-F5391: a pooled/transaction-pooling endpoint can hand
    // a separate client.query() call a different backend, silently dropping a bypass set in its own
    // call. SET + SELECT in one message guarantees one backend for both.
    const results = await client.query(
      `
        SELECT set_config('app.bypass_rls', 'lucia', true);
        SELECT ft.id::text AS id, ft.operating_company_id::text AS operating_company_id,
               ft.transaction_at, ft.total_cost::text AS total_cost
        FROM fuel.fuel_transactions ft
        JOIN lib.feature_flag_overrides ffo
          ON ffo.flag_key = 'EXPENSE_GL_POSTING_ENABLED'
         AND ffo.operating_company_id = ft.operating_company_id
         AND ffo.enabled = true
        LEFT JOIN accounting.posting_batches pb ON pb.idempotency_key ILIKE '%' || ft.id::text || '%'
        WHERE ft.archived_at IS NULL
          AND pb.id IS NULL
          AND ft.transaction_at < now() - interval '${STALE_THRESHOLD_DAYS} days'
        ORDER BY ft.transaction_at ASC;
      `
    );
    const res = Array.isArray(results) ? results[results.length - 1] : results;

    if (res.rows.length > 0) {
      const ids = res.rows
        .map((row) => `${row.id} (${row.transaction_at}, $${row.total_cost})`)
        .join(", ");
      console.error(
        `${LABEL} FAILED\n- ${res.rows.length} fuel transaction(s) stranded unposted (>${STALE_THRESHOLD_DAYS}d old, flag ON, no posting_batches row): ${ids}\n- run FUEL-01 (POST /api/v1/fuel/gl/reflush-unposted) or reflushUnpostedFuelGlExpenses to catch up`
      );
      process.exit(1);
    }
  } finally {
    await client.end();
  }

  console.log(`${LABEL} — OK`);
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertReflushServiceIntact(read(REFLUSH_SERVICE_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }

  await liveScan();
}

main().catch((error) => {
  console.error(`${LABEL} FAILED\n- ${String(error?.message ?? error)}`);
  process.exit(1);
});
