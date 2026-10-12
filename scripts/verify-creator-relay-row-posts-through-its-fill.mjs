#!/usr/bin/env node
/**
 * GUARD — ACCT-F44335: every live fuel.fuel_transactions row that is relay-linked
 * (relay_fuel_transaction_id IS NOT NULL) must have a posted accounting.posting_batches row
 * with source_transaction_type='fuel_event' and source_transaction_id = relay_fuel_transaction_id.
 *
 * WHY: before the Lead ruling 2026-10-10, ACCT-F403 linked relay-matched settlement rows but never
 * posted them — the fill consumed the wallet on Banking's side but the fuel cost never reached the
 * GL. After the ruling, the Creator posts through the relay fill at Creator time, so every
 * relay-linked row must have its fuel_event posting_batch. A missing batch means the wallet was
 * charged but the expense never posted.
 *
 * BASELINE RATCHET (shrink-only): pre-existing unposted relay-linked rows from before 2026-10-10
 * are recorded in the baseline; new violations fail the build. Fix a row, remove it from baseline.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { resolveGateReadonlyDbUrl } from "./lib/gate-db-credential.mjs";

const LABEL = "verify:creator-relay-row-posts-through-its-fill";
const BASELINE_PATH = join("scripts", "verify-creator-relay-row-posts-through-its-fill.baseline.json");

export const ALLOW_OFFLINE_SKIP =
  "reads live accounting.posting_batches; set DATABASE_URL_READONLY or rely on gate-db-credential.mjs";

// SQL that finds relay-linked fuel rows missing their posted fuel_event batch.
// Returns (fuel_transaction_id, relay_fill_id, transaction_at, operating_company_id).
export const UNPOSTED_RELAY_ROWS_SQL = `
  SELECT f.id::text AS fuel_transaction_id,
         f.relay_fuel_transaction_id::text AS relay_fill_id,
         f.transaction_at::date::text AS transaction_at,
         f.operating_company_id::text AS operating_company_id
    FROM fuel.fuel_transactions f
   WHERE f.voided_at IS NULL
     AND f.relay_fuel_transaction_id IS NOT NULL
     AND NOT EXISTS (
           SELECT 1 FROM accounting.posting_batches pb
            WHERE pb.operating_company_id = f.operating_company_id
              AND pb.source_transaction_type = 'fuel_event'
              AND pb.source_transaction_id::text = f.relay_fuel_transaction_id::text
              AND pb.batch_status = 'posted')
   ORDER BY f.transaction_at, f.id
`;

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  // SQL must reference the right table and column names
  t("SQL references fuel.fuel_transactions", UNPOSTED_RELAY_ROWS_SQL.includes("fuel.fuel_transactions"));
  t("SQL filters relay_fuel_transaction_id IS NOT NULL", UNPOSTED_RELAY_ROWS_SQL.includes("relay_fuel_transaction_id IS NOT NULL"));
  t("SQL checks accounting.posting_batches", UNPOSTED_RELAY_ROWS_SQL.includes("accounting.posting_batches"));
  t("SQL checks source_transaction_type = fuel_event", UNPOSTED_RELAY_ROWS_SQL.includes("source_transaction_type = 'fuel_event'"));
  t("SQL checks batch_status = posted", UNPOSTED_RELAY_ROWS_SQL.includes("batch_status = 'posted'"));
  t("SQL checks source_transaction_id = relay_fuel_transaction_id", UNPOSTED_RELAY_ROWS_SQL.includes("source_transaction_id::text = f.relay_fuel_transaction_id::text"));
  t("SQL filters voided_at IS NULL", UNPOSTED_RELAY_ROWS_SQL.includes("f.voided_at IS NULL"));
  t("ALLOW_OFFLINE_SKIP is exported", typeof ALLOW_OFFLINE_SKIP === "string" && ALLOW_OFFLINE_SKIP.length > 0);
  t("BASELINE_PATH ends with .json", BASELINE_PATH.endsWith(".json"));
  {
    const src = readFileSync(new URL(import.meta.url), "utf8");
    t("resolveDbUrl uses resolveGateReadonlyDbUrl", src.includes("resolveGateReadonlyDbUrl"));
    // Legacy file-path join must stay gone (ROUND 210/370). Assert on the join call shape, not a
    // string that this selftest itself would re-introduce into `src`.
    t("resolveDbUrl has no HOME+legacy join", !/join\(\s*process\.env\.HOME/.test(src));
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 11 cases`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

async function resolveDbUrl() {
  // Explicit env wins (money-pr-local-gate / hand runs). Never read neon-prod-readonly.url
  // directly — ROUND 210 retired that path (owner creds leaked into it) and ROUND 370
  // requires IH35_NO_GATE_CREDENTIAL_FALLBACK so verify-static noDbEnv cannot quietly open
  // Neon and ETIMEDOUT under parallel load (alwaysRun tip rot, 2026-10-11).
  const env = process.env.DATABASE_URL_READONLY ?? process.env.DATABASE_URL;
  if (env) return env;
  return resolveGateReadonlyDbUrl() ?? null;
}

async function run() {
  const dbUrl = await resolveDbUrl();
  if (!dbUrl) {
    console.log(`${LABEL} SKIP — no database credential (${ALLOW_OFFLINE_SKIP})`);
    process.exit(0);
  }

  const client = new pg.Client({ connectionString: dbUrl, connectionTimeoutMillis: 30000 });
  await client.connect();
  let rows;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    await client.query("SET LOCAL search_path TO public");
    const result = await client.query(UNPOSTED_RELAY_ROWS_SQL);
    await client.query("COMMIT");
    rows = result.rows;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await client.end();
  }

  const live = new Set(rows.map(r => r.fuel_transaction_id));

  if (process.argv.includes("--write-baseline")) {
    writeFileSync(
      BASELINE_PATH,
      JSON.stringify(
        {
          _comment: "ACCT-F44335 — shrink-only baseline of relay-linked fuel rows not yet posted through their fill. Fix a row, remove its entry. A new violation not in this list fails the build.",
          established: new Date().toISOString().slice(0, 10),
          measured_at: new Date().toISOString(),
          rows: Object.fromEntries(rows.map(r => [r.fuel_transaction_id, { relay_fill_id: r.relay_fill_id, transaction_at: r.transaction_at }])),
        },
        null,
        2
      ) + "\n"
    );
    console.log(`${LABEL}: wrote baseline with ${live.size} known-debt row(s)`);
    process.exit(0);
  }

  const baseline = existsSync(BASELINE_PATH)
    ? JSON.parse(readFileSync(BASELINE_PATH, "utf8"))
    : null;

  if (!baseline) {
    if (live.size > 0) {
      console.error(`${LABEL}: FAIL — no baseline and ${live.size} unposted relay-linked row(s). Run --write-baseline or fix them.`);
      for (const r of rows) console.error(`  fuel_txn ${r.fuel_transaction_id} → fill ${r.relay_fill_id} (${r.transaction_at})`);
      process.exit(1);
    }
    console.log(`${LABEL} OK — 0 unposted relay-linked rows, no baseline needed`);
    process.exit(0);
  }

  const baselineIds = new Set(Object.keys(baseline.rows ?? {}));
  const newViolations = [...live].filter(id => !baselineIds.has(id));
  const nowFixed = [...baselineIds].filter(id => !live.has(id));

  if (newViolations.length > 0) {
    console.error(`${LABEL}: FAIL — new unposted relay-linked row(s) not in baseline:`);
    for (const id of newViolations) {
      const r = rows.find(x => x.fuel_transaction_id === id);
      console.error(`  fuel_txn ${id} → fill ${r?.relay_fill_id} (${r?.transaction_at})`);
    }
    process.exit(1);
  }
  if (nowFixed.length > 0) {
    console.error(`${LABEL}: FAIL — these baselined rows are now fixed; remove them from the baseline (shrink-only ratchet):\n  ${nowFixed.join("\n  ")}`);
    process.exit(1);
  }

  console.log(`${LABEL} OK — ${live.size} known-debt row(s) unchanged (baseline ${baseline.established}), 0 new violations`);
}

run().catch(e => {
  console.error(`${LABEL}: ERROR —`, e.message ?? e);
  process.exit(1);
});
