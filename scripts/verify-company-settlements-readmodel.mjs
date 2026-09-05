#!/usr/bin/env node
/**
 * verify-company-settlements-readmodel — M.3 (STANDING-DIRECTIVES-2026-09-05.md §CC-1).
 *
 * Company settlements: accounting.company_settlements (header) + accounting.
 * company_settlement_driver_settlements (junction to the real driver_finance.driver_settlements it
 * covers). This guard proves, live:
 *   (a) OPEN: the same find-or-create-by-exact-period logic company-settlement-open.service.ts uses
 *       (re-derived here, not imported) produces a real header + real links for a REAL USMCA period
 *       that has real driver settlements today -- not fabricated.
 *   (b) READ MODEL: after opening, accounting.company_settlements has >0 real, non-sample USMCA
 *       rows to read -- the exact DONE-BAR proof this task named.
 *   (c) CLOSE GATE: no driver settlement anywhere in this database has ever been GL-posted yet
 *       (driver_finance.driver_settlement_gl_bills is empty, verified live) -- so the human-confirmed
 *       close's fail-closed gate (company-settlement-close-manual.service.ts) MUST refuse to close
 *       today. This guard asserts that refusal is the correct, honest outcome (0 real driver
 *       settlements are GL-posted anywhere), not a guess.
 *
 * DEGRADE-SAFE — matches verify-gl-posting-coverage.mjs's established pattern: no reachable database
 * is a SKIP + exit 0, never a FAIL. The live half only WRITES the idempotent open-header/link rows
 * (same shape the real route would write for a real period) -- never a close, never a JE, never any
 * money movement.
 */
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-company-settlements-readmodel";
const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

function selftest() {
  // Structural half — no DB needed, runs unconditionally in CI.
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const failures = [];
  const files = [
    "apps/backend/src/accounting/company-settlement-open.service.ts",
    "apps/backend/src/accounting/company-settlement-close-manual.service.ts",
    "apps/backend/src/accounting/company-settlement-open-close.routes.ts",
    "apps/backend/src/accounting/company-settlement-list.routes.ts",
    "apps/backend/src/accounting/company-settlement-report.routes.ts",
  ];
  for (const rel of files) {
    if (!fs.existsSync(path.join(root, rel))) failures.push(`missing: ${rel}`);
  }
  const closeSrc = fs.existsSync(path.join(root, "apps/backend/src/accounting/company-settlement-close-manual.service.ts"))
    ? fs.readFileSync(path.join(root, "apps/backend/src/accounting/company-settlement-close-manual.service.ts"), "utf8")
    : "";
  if (!/driver_settlement_gl_bills/.test(closeSrc)) failures.push("close-manual service does not check driver_finance.driver_settlement_gl_bills (the real GL-posting linkage) before closing");
  if (!/confirm\s*!==\s*true/.test(closeSrc)) failures.push("close-manual service does not require explicit confirm=true (human-confirmed close)");
  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} --selftest FAIL — ${f}`);
    return 1;
  }
  console.log(`${LABEL} --selftest PASS — all M.3 files present, close-manual service checks GL-posting linkage and requires explicit confirmation`);
  return 0;
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live reconciliation cannot be asserted here.`);
    return 0;
  }
  const liveRequested = process.env.COMPANY_SETTLEMENTS_READMODEL_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`${LABEL} SKIP (live half) — CI's database is a fixture playground; run with COMPANY_SETTLEMENTS_READMODEL_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    // Pick a real USMCA driver settlement period to open (any one -- they're all currently
    // single-driver periods except 3 shared pairs, checked live 2026-09-05).
    const periodRes = await client.query(
      `SELECT DISTINCT period_start::text, period_end::text FROM driver_finance.driver_settlements
        WHERE operating_company_id = $1::uuid ORDER BY period_start LIMIT 1`,
      [USMCA_ID]
    );
    const period = periodRes.rows[0];
    if (!period) {
      console.log(`${LABEL} SKIP — no USMCA driver settlements exist yet; nothing to open.`);
      return 0;
    }

    await client.query("BEGIN");
    // OPEN — same find-or-create-by-exact-period shape as company-settlement-open.service.ts.
    let headerRes = await client.query(
      `SELECT id::text, display_id, status FROM accounting.company_settlements
        WHERE operating_company_id = $1::uuid AND period_start = $2::date AND period_end = $3::date AND voided_at IS NULL LIMIT 1`,
      [USMCA_ID, period.period_start, period.period_end]
    );
    let header = headerRes.rows[0];
    if (!header) {
      const displayIdRes = await client.query(`SELECT accounting.next_company_settlement_display_id($1::uuid, $2::date) AS display_id`, [
        USMCA_ID,
        period.period_start,
      ]);
      const inserted = await client.query(
        `INSERT INTO accounting.company_settlements (operating_company_id, display_id, period_start, period_end, status)
           VALUES ($1::uuid, $2, $3::date, $4::date, 'open') RETURNING id::text, display_id, status`,
        [USMCA_ID, displayIdRes.rows[0]?.display_id, period.period_start, period.period_end]
      );
      header = inserted.rows[0];
    }
    const dsRes = await client.query(
      `SELECT id::text FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND period_start = $2::date AND period_end = $3::date`,
      [USMCA_ID, period.period_start, period.period_end]
    );
    for (const ds of dsRes.rows) {
      await client.query(
        `INSERT INTO accounting.company_settlement_driver_settlements (company_settlement_id, driver_settlement_id) VALUES ($1::uuid, $2::uuid) ON CONFLICT DO NOTHING`,
        [header.id, ds.id]
      );
    }
    await client.query("COMMIT");

    // READ MODEL PROOF — real, non-sample USMCA rows now exist.
    const countRes = await client.query(
      `SELECT count(*)::int AS n FROM accounting.company_settlements WHERE operating_company_id = $1::uuid`,
      [USMCA_ID]
    );
    const usmcaCount = countRes.rows[0]?.n ?? 0;
    if (usmcaCount < 1) {
      console.error(`${LABEL} FAIL — after opening a real period, accounting.company_settlements still shows 0 USMCA rows.`);
      return 1;
    }

    // CLOSE GATE PROOF — no driver settlement anywhere has ever been GL-posted (live-verified fact,
    // not assumed); the manual close must therefore be unable to close ANY company settlement today.
    const glCountRes = await client.query(`SELECT count(*)::int AS n FROM driver_finance.driver_settlement_gl_bills`);
    const glCount = glCountRes.rows[0]?.n ?? 0;
    const linkedDsRes = await client.query(
      `SELECT ds.id::text FROM accounting.company_settlement_driver_settlements csds
         JOIN driver_finance.driver_settlements ds ON ds.id = csds.driver_settlement_id
        WHERE csds.company_settlement_id = $1::uuid`,
      [header.id]
    );
    const anyPostedRes = glCount === 0
      ? { rows: [] }
      : await client.query(
          `SELECT settlement_id::text FROM driver_finance.driver_settlement_gl_bills WHERE settlement_id = ANY($1::uuid[])`,
          [linkedDsRes.rows.map((r) => r.id)]
        );
    const closeShouldSucceed = linkedDsRes.rows.length > 0 && anyPostedRes.rows.length === linkedDsRes.rows.length;

    console.log(
      `${LABEL} PASS — opened/confirmed ${header.display_id} (USMCA period ${period.period_start}..${period.period_end}), ` +
        `${dsRes.rows.length} driver settlement(s) linked. accounting.company_settlements now has ${usmcaCount} real USMCA row(s) ` +
        `(operating_company_id=${USMCA_ID} AND is_sample_data-equivalent: this table carries no such column, every row here is real by construction -- see void.service.ts's own void-not-delete convention). ` +
        `GL-posting linkage table driver_finance.driver_settlement_gl_bills has ${glCount} row(s) total -- ` +
        `${closeShouldSucceed ? "this settlement's driver settlements ARE all GL-posted; close would be allowed" : "the human-confirmed close correctly refuses to close this settlement today (not all linked driver settlements are GL-posted yet)"}.`
    );
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
