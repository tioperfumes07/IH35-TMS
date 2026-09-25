#!/usr/bin/env node
// ROUND 173 pt 5 / ROUND 166.1 pt 3 (Lead, 2026-09-25) — "No load-view query path reads rows
// outside the load's current tour or settlement." The boards show the current trip only. History
// lives in Reports.
//
// TWO ARMS:
//   A) STATIC, permanent regression lock — the two current-trip resolvers this round's own
//      findings named must keep their current-only logic:
//      - load-settlement-summary.routes.ts must resolve via mdata.loads.presettlement_link_id
//        FIRST (R-168's own current pointer) before any recency/heuristic fallback (the exact
//        gap this round's own finding fixed: created_at DESC with no cancelled filter could
//        surface a stale/superseded settlement).
//      - tour-readout.routes.ts must keep its DISPATCH-NO-HISTORY exclusion (a load already
//        settled into ANOTHER closed/locked settlement must not ride an open tour).
//   B) LIVE, self-arming population checks:
//      1. No load's presettlement_link_id points to a cancelled or reversed settlement (a stale
//         pointer is exactly "history" leaking into a current-trip surface).
//      2. No load rides an OPEN tour (presettlement_link_id -> an open settlement) while also
//         carrying an active settlement_lines row on a DIFFERENT, closed/locked settlement — the
//         exact defect class tour-readout.routes.ts's own DISPATCH-NO-HISTORY comment documents
//         (measured live there 2026-09-11: 8 such legs).
//
// Self-test: node scripts/verify-load-views-current-trip-only.mjs --selftest

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

// REQUIRES_LIVE_DB (ROUND 29.9-B convention): excludes this guard from verify-static.mjs's
// dead-port sentinel sweep. live() fails closed without DATABASE_URL by design.
export const REQUIRES_LIVE_DB = "live() fails closed without DATABASE_URL by design (ROUND 29.9-B)";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-views-current-trip-only";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BYPASS = `WITH b AS MATERIALIZED (SELECT set_config('app.bypass_rls','lucia',true) AS v)`;

const SETTLEMENT_SUMMARY_ROUTE = "apps/backend/src/dispatch/load-settlement-summary.routes.ts";
const TOUR_READOUT_ROUTE = "apps/backend/src/driver-finance/tour-readout.routes.ts";

/**
 * Pure — load-settlement-summary.routes.ts must resolve via loadRow.presettlement_link_id
 * (queried as a real column) BEFORE the fallback heuristic runs, and the fallback itself must
 * exclude cancelled settlements. Returns failure strings, empty when the file is current-only.
 */
export function auditSettlementSummaryCurrentOnly(src) {
  const failures = [];
  if (!/presettlement_link_id/.test(src)) {
    failures.push(`${SETTLEMENT_SUMMARY_ROUTE}: no longer reads presettlement_link_id at all — regressed to a pure historical-search resolver`);
    return failures;
  }
  if (!/status\s*<>\s*'cancelled'/.test(src)) {
    failures.push(`${SETTLEMENT_SUMMARY_ROUTE}: fallback resolver no longer excludes cancelled settlements`);
  }
  // The presettlement_link_id branch must be tried BEFORE the fallback query runs — the fallback
  // must be conditioned on the primary resolve having failed (an `if (!s)` / `s ?? ` shape).
  if (!/if\s*\(\s*!s\s*\)/.test(src)) {
    failures.push(`${SETTLEMENT_SUMMARY_ROUTE}: no longer gates the fallback query behind "only if the primary resolve found nothing" — could re-run the historical search even when presettlement_link_id already resolved a current settlement`);
  }
  return failures;
}

/**
 * Pure — tour-readout.routes.ts's legs CTE must keep its DISPATCH-NO-HISTORY exclusion: a load
 * with an active settlement_lines row on ANOTHER closed/locked settlement must not ride an open
 * tour.
 */
export function auditTourReadoutCurrentOnly(src) {
  const failures = [];
  if (!/DISPATCH-NO-HISTORY/.test(src)) {
    failures.push(`${TOUR_READOUT_ROUTE}: DISPATCH-NO-HISTORY marker/exclusion is gone — an open tour could show a load that already settled elsewhere`);
  }
  if (!/trip_closed_at IS NOT NULL OR s2\.locked_at IS NOT NULL/.test(src)) {
    failures.push(`${TOUR_READOUT_ROUTE}: the closed/locked-settlement exclusion condition changed shape — re-verify it still excludes history`);
  }
  return failures;
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error(`${LABEL}: DATABASE_URL not set. Refusing to pass a money gate that never ran.`);
    process.exit(1);
  }

  const staticFailures = [];
  const summaryPath = path.join(ROOT, SETTLEMENT_SUMMARY_ROUTE);
  if (fs.existsSync(summaryPath)) {
    staticFailures.push(...auditSettlementSummaryCurrentOnly(fs.readFileSync(summaryPath, "utf8")));
  } else {
    staticFailures.push(`${SETTLEMENT_SUMMARY_ROUTE}: file no longer exists — update this guard`);
  }
  const readoutPath = path.join(ROOT, TOUR_READOUT_ROUTE);
  if (fs.existsSync(readoutPath)) {
    staticFailures.push(...auditTourReadoutCurrentOnly(fs.readFileSync(readoutPath, "utf8")));
  } else {
    staticFailures.push(`${TOUR_READOUT_ROUTE}: file no longer exists — update this guard`);
  }

  const client = new pg.Client({ connectionString: url });
  const liveFailures = [];
  let staleLinkCount = 0;
  let crossSettlementCount = 0;
  try {
    await client.connect();
    await client.query("BEGIN");

    // Live check 1 — no load's current-trip pointer aims at dead history.
    const staleRes = await client.query(
      `${BYPASS}
       SELECT l.load_number, s.display_id
         FROM mdata.loads l
         JOIN driver_finance.driver_settlements s ON s.id = l.presettlement_link_id
        WHERE (SELECT v FROM b) = 'lucia'
          AND l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND (s.status = 'cancelled' OR s.reversed_at IS NOT NULL)`,
      [USMCA_COMPANY_ID]
    );
    staleLinkCount = staleRes.rows.length;
    for (const r of staleRes.rows) {
      liveFailures.push(`load ${r.load_number}: presettlement_link_id points at settlement ${r.display_id}, which is cancelled/reversed — a current-trip surface reading this pointer would show dead history`);
    }

    // Live check 2 — DISPATCH-NO-HISTORY population: a load on an OPEN tour that also carries an
    // active settlement_lines row on a DIFFERENT closed/locked settlement (the exact class
    // tour-readout.routes.ts's own comment documents, re-measured independently here).
    const crossRes = await client.query(
      `${BYPASS}
       SELECT l.load_number, s_open.display_id AS open_settlement, s_closed.display_id AS closed_settlement
         FROM mdata.loads l
         JOIN driver_finance.driver_settlements s_open ON s_open.id = l.presettlement_link_id AND s_open.trip_closed_at IS NULL
         JOIN driver_finance.settlement_lines sl ON sl.load_id = l.id AND sl.is_active AND sl.voided_at IS NULL
         JOIN driver_finance.driver_settlements s_closed ON s_closed.id = sl.settlement_id
        WHERE (SELECT v FROM b) = 'lucia'
          AND l.operating_company_id = $1::uuid AND l.soft_deleted_at IS NULL
          AND s_closed.id <> s_open.id
          AND s_closed.operating_company_id = $1::uuid
          AND s_closed.reversed_at IS NULL AND s_closed.voided_at IS NULL AND s_closed.status <> 'cancelled'
          AND (s_closed.trip_closed_at IS NOT NULL OR s_closed.locked_at IS NOT NULL)`,
      [USMCA_COMPANY_ID]
    );
    crossSettlementCount = crossRes.rows.length;
    for (const r of crossRes.rows) {
      liveFailures.push(`load ${r.load_number}: rides OPEN tour ${r.open_settlement} but already settled into CLOSED/LOCKED ${r.closed_settlement} — this is settled history, must not appear on the open tour`);
    }

    await client.query("ROLLBACK");
  } finally {
    await client.end().catch(() => {});
  }

  const failures = [...staticFailures, ...liveFailures];
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL — ${failures.length} problem(s):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL}: OK — load-settlement-summary.routes.ts and tour-readout.routes.ts both keep their current-only resolution logic; 0 stale presettlement_link_id pointer(s), 0 cross-settlement history leak(s) (population: ${staleLinkCount} + ${crossSettlementCount} checked).`
  );
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const goodSummary = `
    if (loadRow.presettlement_link_id) { /* try it */ }
    if (!s) {
      const settlRes = await client.query(\`SELECT ... WHERE s.status <> 'cancelled' AND (...)\`);
    }
  `;
  assert.ok(auditSettlementSummaryCurrentOnly(goodSummary).length === 0, "must accept the fixed current-first + cancelled-excluded shape");

  const plantedRedNoLink = `const settlRes = await client.query(\`SELECT ... ORDER BY s.created_at DESC\`);`;
  assert.ok(auditSettlementSummaryCurrentOnly(plantedRedNoLink).length > 0, "PLANTED-RED: a resolver with no presettlement_link_id read at all must be caught");

  const plantedRedNoCancelledFilter = `
    if (loadRow.presettlement_link_id) { /* try it */ }
    if (!s) {
      const settlRes = await client.query(\`SELECT ... ORDER BY s.created_at DESC\`);
    }
  `;
  assert.ok(auditSettlementSummaryCurrentOnly(plantedRedNoCancelledFilter).length > 0, "PLANTED-RED: fallback missing the cancelled exclusion must be caught");

  const goodReadout = `
    -- DISPATCH-NO-HISTORY (owner 2026-09-11): ...
    AND ($5::boolean IS FALSE OR NOT EXISTS (
      SELECT 1 FROM driver_finance.settlement_lines sl
      JOIN driver_finance.driver_settlements s2 ON s2.id = sl.settlement_id
     WHERE sl.load_id = l.id AND sl.is_active AND sl.voided_at IS NULL
       AND s2.id <> $1::uuid
       AND (s2.trip_closed_at IS NOT NULL OR s2.locked_at IS NOT NULL)))
  `;
  assert.ok(auditTourReadoutCurrentOnly(goodReadout).length === 0, "must accept the existing DISPATCH-NO-HISTORY block unchanged");

  const plantedRedReadout = `SELECT l.* FROM mdata.loads l WHERE l.presettlement_link_id = $1::uuid`;
  assert.ok(auditTourReadoutCurrentOnly(plantedRedReadout).length > 0, "PLANTED-RED: a legs query with the DISPATCH-NO-HISTORY exclusion stripped must be caught");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
