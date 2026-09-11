#!/usr/bin/env node
// SETTLEMENT/TOUR NUMBER SWEEP owner order (2026-09-11), PART 3: "every load must be detectable
// and correctly attached to its owning settlement." No general orphan-detection mechanism existed
// anywhere in the codebase before this guard (confirmed: no cron, no health route, no /api
// endpoint — the only prior art was scripts/ops/link-orphan-loads-presettlement.ts, a one-off
// repair script with a HARDCODED TARGETS array of exactly 2 load numbers, not a scan). This guard
// is that mechanism, made permanent.
//
// Two classes of defect, both confirmed live on prod (tiny-field-89581227, USMCA
// 5c854333-6ea5-4faa-af31-67cb272fef80) 2026-09-11:
//
//  1. ORPHAN: a load that has reached dispatch (status != 'cancelled') but carries no
//     mdata.loads.presettlement_link_id at all. Company-wide sweep found exactly ONE:
//     load 13508 (closed, driver-assigned, has its own real settlement S-2026-0007 whose
//     first_load_id/last_load_id both equal 13508 -- the link was simply never written back).
//     A second load, 13556, has no link but is legitimately EXPECTED STATE (cancelled before ever
//     being assigned a driver -- confirmed assigned_primary_driver_id IS NULL) and must never be
//     flagged; the ORPHAN class below excludes cancelled loads for exactly this reason.
//
//  2. MISATTACHED LINE: a settlement_lines row whose canonical resolved load
//     (COALESCE(driver_bills.load_id, settlement_lines.load_id) per the ACCT-F275/F290 owner
//     ruling) sits on a DIFFERENT settlement than the load's own mdata.loads.presettlement_link_id.
//     Company-wide sweep found exactly load 13508's 2 deduction lines ($10, $25) sitting on
//     S-2026-0015 (a different driver's settlement) instead of 13508's own S-2026-0007. This class
//     is flagged, NOT auto-fixed here -- correcting a line already inside a CLOSED settlement is an
//     audited-reversal-class change (touches already-settled money), out of scope for this pass.
//
// RATCHET, not a hard 0-gate: baseline files record the count at ship time; a NEW occurrence of
// either class (one this guard didn't already know about) fails the build. The known load-13508
// misattached-line pair stays flagged (tracked in the baseline) until an owner-reviewed reversal
// closes it -- this guard's job is to make sure it never grows, not to silently re-litigate it.
//
// LIVE-DATA CHECK: requires DATABASE_URL pointed at a read-only prod role (same convention as
// verify-no-unmanifested-prod-financial-fixtures.mjs). SKIPs (not fails) without one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-settlement-linkage";
const USMCA_OPCO_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ORPHAN_BASELINE_PATH = path.join(ROOT, "scripts/.load-settlement-linkage-orphan-baseline.json");
const MISATTACHED_BASELINE_PATH = path.join(ROOT, "scripts/.load-settlement-linkage-misattached-baseline.json");

/**
 * Pure: which loads are ORPHANED (reached dispatch, no settlement link at all)?
 * @param {{load_id: string, load_number: string|number, status: string, presettlement_link_id: string|null}[]} loads
 */
export function detectOrphans(loads) {
  return loads.filter((l) => l.status !== "cancelled" && l.presettlement_link_id === null);
}

/**
 * Pure: which settlement_lines resolve to a load that HAS its own link, but sit on a DIFFERENT
 * settlement than that link points to?
 * @param {{line_id: string, resolved_load_id: string, settlement_id: string}[]} lines
 * @param {Map<string, string>} loadLinkMap  load_id -> presettlement_link_id (settlement id)
 */
export function detectMisattachedLines(lines, loadLinkMap) {
  const out = [];
  for (const line of lines) {
    const ownSettlementId = loadLinkMap.get(line.resolved_load_id);
    if (ownSettlementId && line.settlement_id !== ownSettlementId) {
      out.push(line);
    }
  }
  return out;
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const loadsRes = await client.query(
      `SELECT id AS load_id, load_number, status, presettlement_link_id
       FROM mdata.loads
       WHERE operating_company_id = $1`,
      [USMCA_OPCO_ID]
    );
    const loads = loadsRes.rows;
    const loadLinkMap = new Map(
      loads.filter((l) => l.presettlement_link_id !== null).map((l) => [l.load_id, l.presettlement_link_id])
    );

    const linesRes = await client.query(
      `SELECT sl.id AS line_id,
              COALESCE(db.load_id, sl.load_id) AS resolved_load_id,
              sl.settlement_id
       FROM driver_finance.settlement_lines sl
       LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
       JOIN mdata.loads l ON l.id = COALESCE(db.load_id, sl.load_id)
       WHERE l.operating_company_id = $1
         AND COALESCE(db.load_id, sl.load_id) IS NOT NULL`,
      [USMCA_OPCO_ID]
    );

    return {
      orphans: detectOrphans(loads),
      misattached: detectMisattachedLines(linesRes.rows, loadLinkMap),
    };
  } finally {
    await client.end();
  }
}

function readBaseline(p) {
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8")).count;
}

function ratchetOne(label, count, baselinePath, describe) {
  const baseline = readBaseline(baselinePath);
  if (baseline === null) {
    console.error(
      `${LABEL} FAIL — no baseline file at ${path.relative(ROOT, baselinePath)}. ` +
        `Create it with {"count": ${count}} (current live count: ${count}).`
    );
    return false;
  }
  if (count > baseline) {
    console.error(
      `${LABEL} FAIL — ${count} ${label} live, up from baseline ${baseline}. NEW occurrence(s):`
    );
    describe();
    return false;
  }
  if (count < baseline) {
    console.log(
      `${LABEL} — ${count} ${label} live (down from baseline ${baseline}). ` +
        `Lower ${path.relative(ROOT, baselinePath)}'s count to ${count} to lock in the improvement.`
    );
    return true;
  }
  console.log(`${LABEL} — ${count} ${label} live == baseline ${baseline}, none new`);
  return true;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LABEL} SKIP — no DATABASE_URL (this is a live-prod-only audit, read-only role required)`);
    return;
  }
  const { orphans, misattached } = await auditLive(databaseUrl);

  const orphanOk = ratchetOne(
    "orphaned load(s) (dispatched/active with no settlement link)",
    orphans.length,
    ORPHAN_BASELINE_PATH,
    () => {
      for (const o of orphans) console.error(`  ✗ load ${o.load_number} (${o.load_id}) status=${o.status}`);
    }
  );
  const misattachedOk = ratchetOne(
    "misattached settlement line(s) (load's own link points elsewhere)",
    misattached.length,
    MISATTACHED_BASELINE_PATH,
    () => {
      for (const m of misattached)
        console.error(`  ✗ settlement_lines.${m.line_id} — load ${m.resolved_load_id} sits on settlement ${m.settlement_id} instead of its own link`);
    }
  );

  if (!orphanOk || !misattachedOk) {
    process.exitCode = 1;
    return;
  }
  console.log(`${LABEL} PASS`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  // ORPHAN detection
  const loads = [
    { load_id: "L1", load_number: "1", status: "closed", presettlement_link_id: "S1" },
    { load_id: "L2", load_number: "2", status: "dispatched", presettlement_link_id: null }, // orphan
    { load_id: "L3", load_number: "3", status: "cancelled", presettlement_link_id: null }, // expected state, not orphan
  ];
  const orphans = detectOrphans(loads);
  assert.ok(orphans.length === 1 && orphans[0].load_id === "L2", "must flag exactly the non-cancelled load with no link, not the cancelled one");

  // MISATTACHED detection
  const loadLinkMap = new Map([["L1", "S1"], ["L4", "S4"]]);
  const lines = [
    { line_id: "line-a", resolved_load_id: "L1", settlement_id: "S1" }, // correct, own settlement
    { line_id: "line-b", resolved_load_id: "L4", settlement_id: "S99" }, // misattached — L4's own link is S4
    { line_id: "line-c", resolved_load_id: "L5", settlement_id: "S5" }, // L5 has no known link — cannot judge, not flagged
  ];
  const misattached = detectMisattachedLines(lines, loadLinkMap);
  assert.ok(misattached.length === 1 && misattached[0].line_id === "line-b", "must flag only the line sitting on a settlement different from the load's own link");

  // Regression check: exactly reproduces the real load-13508 shape.
  const l13508LoadLinkMap = new Map([["load-13508", "settlement-S-2026-0007"]]);
  const l13508Lines = [
    { line_id: "earnings", resolved_load_id: "load-13508", settlement_id: "settlement-S-2026-0007" },
    { line_id: "ded-10", resolved_load_id: "load-13508", settlement_id: "settlement-S-2026-0015" },
    { line_id: "ded-25", resolved_load_id: "load-13508", settlement_id: "settlement-S-2026-0015" },
  ];
  const l13508Misattached = detectMisattachedLines(l13508Lines, l13508LoadLinkMap);
  assert.ok(l13508Misattached.length === 2, "must reproduce the real load-13508 shape: exactly the 2 deduction lines on the foreign settlement flagged, earnings line on its own settlement not flagged");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await run();
}
