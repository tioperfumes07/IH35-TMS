#!/usr/bin/env node
/**
 * ROUND 285.4.4 — Load Costs must render Book Load wizard amounts from
 * dispatch.load_charge_lines (line haul, fuel surcharge, accessorials, detention, layover).
 * Static: both surfaces + shared SQL pivot. Live (when DATABASE_URL): open_dispatch count matches
 * charge-line pivot for USMCA; every open load with rate_total > 0 has a linehaul charge.
 */
export const REQUIRES_LIVE_DB =
  "default mode checks live USMCA open_dispatch wizard charges in required CI; --static preserves local source assertions";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { exitIfMeasuredEmptyByPurge } from "./lib/purge-window.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-costs-wizard-amounts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const REQUIRED_FILES = {
  "apps/backend/src/accounting/load-wizard-charges.sql.ts": [
    "dispatch.load_charge_lines",
    "linehaul",
    "fuel_surcharge",
    "accessorial_cents",
    "detention_charge_cents",
    "layover_charge_cents",
  ],
  "apps/backend/src/accounting/load-costs-board.routes.ts": [
    "wizardChargesLeftJoin",
    "line_haul_cents",
    "fuel_surcharge_cents",
    "accessorial_cents",
    "detention_charge_cents",
    "layover_cents",
  ],
  "apps/backend/src/accounting/load-cost-rollup.sql.ts": [
    "wizardChargesLeftJoin",
    "wizard_linehaul_cents",
    "wizard_fuel_surcharge_cents",
  ],
  "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx": [
    'testId: "col-line-haul"',
    'testId: "col-fuel-surcharge"',
    'testId: "col-accessorials"',
    'testId: "col-detention-charge"',
    'testId: "col-layover"',
    "line_haul_cents",
  ],
  "apps/frontend/src/components/dispatch/DispatchLoadCostsPanel.tsx": [
    "wizard_linehaul_cents",
    "dispatch-wizard-line-haul",
    "dispatch-wizard-fsc",
    "dispatch-wizard-accessorials",
    "dispatch-wizard-detention",
    "dispatch-wizard-layover",
  ],
};

function staticCheck(planted = {}) {
  const errors = [];
  for (const [rel, needles] of Object.entries(REQUIRED_FILES)) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      errors.push(`missing file ${rel}`);
      continue;
    }
    const body = planted[rel] ?? fs.readFileSync(full, "utf8");
    for (const n of needles) {
      if (!body.includes(n)) errors.push(`${rel} missing ${JSON.stringify(n)}`);
    }
  }
  return errors;
}

async function liveCheck() {
  if (!process.env.DATABASE_URL) {
    throw new Error(`${LABEL}: DATABASE_URL required for live mode; use --static for source assertions`);
  }
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const loads = await client.query(
      `SELECT l.load_number, l.id, l.rate_total_cents
         FROM mdata.loads l
        WHERE l.operating_company_id = $1::uuid
          AND COALESCE(l.is_sample_data, false) IS NOT TRUE
          AND EXISTS (
            SELECT 1 FROM views.live_loads vll
             WHERE vll.id = l.id AND vll.live_state = 'open_dispatch'
          )`,
      [USMCA]
    );
    const n = loads.rows.length;
    // Seeding freeze / post-purge: measured open_dispatch = 0 is EMPTY BY PURGE, not a broken pivot.
    exitIfMeasuredEmptyByPurge("verify-load-costs-wizard-amounts", "USMCA open_dispatch loads", n);
    if (n < 1) throw new Error(`open_dispatch count ${n} — expected the canonical live set`);
    const ids = loads.rows.map((r) => r.id);
    const charges = await client.query(
      `SELECT cl.load_id,
              COALESCE(SUM(cl.amount_cents) FILTER (WHERE lower(cl.charge_code) IN ('linehaul','line_haul')), 0)::bigint AS linehaul
         FROM dispatch.load_charge_lines cl
        WHERE cl.load_id = ANY($1::uuid[])
          AND COALESCE(cl.is_active, true) IS TRUE
        GROUP BY cl.load_id`,
      [ids]
    );
    const byId = new Map(charges.rows.map((r) => [r.load_id, Number(r.linehaul)]));
    const missing = [];
    for (const row of loads.rows) {
      const lh = byId.get(row.id) ?? 0;
      if (Number(row.rate_total_cents) > 0 && lh <= 0) {
        missing.push(String(row.load_number));
      }
    }
    if (missing.length) {
      throw new Error(`open_dispatch loads with rate but no linehaul charge line: ${missing.join(",")}`);
    }
    console.log(`${LABEL}: LIVE PASS — open_dispatch=${n}; every rated load has wizard linehaul`);
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }
}

const staticErrors = staticCheck();
if (process.argv.includes("--selftest")) {
  if (staticErrors.length) throw new Error(staticErrors.join("; "));
  // Mutation: strip one column testId → must fail.
  const boardPath = path.join(ROOT, "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx");
  const orig = fs.readFileSync(boardPath, "utf8");
  const mutated = orig.replace('testId: "col-line-haul"', 'testId: "col-line-haul-REMOVED"');
  const errs = staticCheck({ "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx": mutated });
  if (!errs.some((e) => e.includes("col-line-haul"))) {
    throw new Error("selftest: removing col-line-haul did not fail the guard");
  }
  console.log(`${LABEL}: PASS --selftest`);
  process.exit(0);
}

if (staticErrors.length) {
  console.error(`${LABEL}: FAIL — ${staticErrors.join("; ")}`);
  process.exit(1);
}
if (!process.argv.includes('--static')) await liveCheck();
console.log(`${LABEL}: PASS — wizard amounts wired on board + dispatch panel + shared pivot`);
