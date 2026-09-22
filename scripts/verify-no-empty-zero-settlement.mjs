#!/usr/bin/env node
// A driver settlement with no live lines and $0.00 net pay is an empty shell, not a settlement
// (Lead round 67, 2026-09-22: "a driver_settlements row with ZERO lines and $0.00 net_pay is a build
// failure"). Live USMCA, read-only. Cancelled or voided settlements are out of scope: that is the
// void register the law keeps, printed here as information only.
//   an empty shell not in the baseline        -> FAIL (a new one was created)
//   a baselined shell that is no longer empty -> PASS, printed: remove it from the baseline
// Settlements are named by source_document_ref (the AlwaysTrack number), never display_id.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-empty-zero-settlement";
export const REQUIRES_LIVE_DB =
  "reads driver_finance.driver_settlements and settlement_lines on live USMCA in a READ ONLY transaction; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE_PATH =
  process.env.EMPTY_SETTLEMENT_BASELINE_PATH || path.join(ROOT, "scripts/verify-no-empty-zero-settlement.baseline.json");

const EMPTY_SQL = `
  SELECT s.id::text AS id,
         s.status::text AS status,
         CASE WHEN s.source_document_ref IS NOT NULL THEN s.source_document_ref
              WHEN s.status::text = 'open' THEN 'Open'
              ELSE '—' END AS label,
         (s.status::text = 'cancelled' OR s.voided_at IS NOT NULL) AS void_register
    FROM driver_finance.driver_settlements s
   WHERE s.operating_company_id = $1::uuid
     AND s.is_sample_data IS NOT TRUE
     AND coalesce(s.net_pay, 0) = 0
     AND NOT EXISTS (
       SELECT 1 FROM driver_finance.settlement_lines sl
        WHERE sl.settlement_id = s.id AND sl.voided_at IS NULL
     )
   ORDER BY s.created_at, s.id
`;

export function evaluate(rows, baselineIds) {
  const live = rows.filter((r) => !r.void_register);
  const known = new Set(baselineIds);
  const current = new Set(live.map((r) => r.id));
  return {
    newShells: live.filter((r) => !known.has(r.id)),
    resolved: [...known].filter((id) => !current.has(id)),
    knownShells: live.filter((r) => known.has(r.id)),
    voidRegister: rows.filter((r) => r.void_register),
  };
}

function selftest() {
  const check = (cond, msg) => {
    if (!cond) {
      console.error(`${LABEL} --selftest FAIL: ${msg}`);
      process.exit(1);
    }
  };
  const shell = (id, void_register = false) => ({ id, status: void_register ? "cancelled" : "open", label: id, void_register });
  check(evaluate([shell("a")], ["a"]).newShells.length === 0, "a baselined shell must pass");
  check(evaluate([shell("a"), shell("b")], ["a"]).newShells.length === 1, "a new shell must fail");
  check(evaluate([], ["a"]).resolved.length === 1, "a fixed shell must be reported for removal");
  check(evaluate([shell("c", true)], []).newShells.length === 0, "a cancelled or voided shell is the void register, not a failure");
  console.log(`${LABEL} --selftest PASS — 4 cases`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
let rows;
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const totals = await client.query(
    "SELECT count(*)::int AS n FROM driver_finance.driver_settlements WHERE operating_company_id = $1::uuid AND is_sample_data IS NOT TRUE",
    [USMCA_COMPANY_ID]
  );
  if (totals.rows[0].n === 0) {
    console.error(`${LABEL}: FAIL — 0 USMCA settlements visible; that is an instrument problem, not a clean result`);
    process.exit(1);
  }
  rows = (await client.query(EMPTY_SQL, [USMCA_COMPANY_ID])).rows;
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}

const { newShells, resolved, knownShells, voidRegister } = evaluate(rows, (baseline.settlements ?? []).map((s) => s.id));
if (voidRegister.length > 0) {
  console.log(`${LABEL}: ${voidRegister.length} cancelled/voided empty settlement(s) kept as the void register (not counted).`);
}
for (const id of resolved) {
  const label = baseline.settlements.find((s) => s.id === id)?.label ?? id;
  console.log(`${LABEL}: settlement ${label} is no longer an empty shell — remove it from ${path.basename(BASELINE_PATH)}`);
}
if (newShells.length > 0) {
  console.error(`${LABEL}: FAIL — ${newShells.length} new settlement(s) with no live lines and $0.00 net pay:`);
  for (const r of newShells) console.error(`  ✗ settlement ${r.label} (${r.status}) ${r.id}`);
  process.exit(1);
}
console.log(
  `${LABEL}: PASS — 0 new empty settlements; ${knownShells.length} known empty shell(s) still open as debt (baseline ${baseline.established}): ` +
    `${knownShells.map((r) => r.label).join(", ") || "none"}.`
);
