#!/usr/bin/env node
// ROUND 20.1 MEASURED DEFECT A (Claude Lead, 2026-09-12 21:41Z): 7 open pre-settlements (driver_finance.
// driver_settlements.status='open'), each with exactly one linked load (mdata.loads.presettlement_link_id
// = the settlement id). The PRECEDING legs of the SAME unit/driver round trip were orphaned —
// presettlement_link_id IS NULL despite having a driver AND a trip_type, reaching dispatch. Root cause
// (fixed in the same PR, apps/backend/src/dispatch/update-load.service.ts): Edit Load never re-entered
// the presettlement linker when trip_type (or the driver) was filled in after booking — the only
// assignment/edit write path that didn't, unlike quick-assign/planner/dispatch-refinements/quicksave.
// Backfilled by migration 202614120000 (9 named loads, hand-verified, NOT a generic same-unit sweep).
//
// This guard: for every OPEN pre-settlement, resolve its unit+driver from its own linked load, then
// flag any OTHER load on that same unit+driver that has reached dispatch (status != 'cancelled') and
// carries no link at all. RATCHET, not a hard 0-gate — same convention as the sibling
// verify-load-settlement-linkage.mjs (its own ORPHAN class), for the same reason: a live investigation
// while building this fix found unit T170's OWN historical tour (61f298ed, settlement S-2026-0013,
// source_document_ref=5779, CANCELLED, trip_closed_at NULL) spans THREE additional loads
// (13527/13561/13567) from separate real trip cycles between 2026-09-05 and 2026-09-11 that the
// Lead's live measurement did not name — a related but separate historical-attribution question, out
// of scope for this item. A hard 0-gate here would either falsely re-flag that known, tracked, not-
// yet-ruled-on gap as a NEW regression forever, or force silently sweeping it into this backfill
// without a ruling — both wrong. The baseline records it explicitly; a truly NEW orphan (this bug
// recurring) still fails the build.
//
// LIVE-DATA CHECK: requires DATABASE_URL pointed at a read-only prod role (same convention as
// verify-load-settlement-linkage.mjs). SKIPs (not fails) without one.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tour-leg-linkage";
const USMCA_OPCO_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE_PATH = path.join(ROOT, "scripts/.tour-leg-linkage-baseline.json");

/**
 * Pure: given the 7 open tours' (unit_id, driver_id) pairs and the full USMCA load list, which
 * non-cancelled, unit/driver-matching loads carry no presettlement_link_id at all?
 * @param {{unit_id: string, driver_id: string}[]} openTours
 * @param {{load_id: string, load_number: string, status: string, assigned_unit_id: string|null, assigned_primary_driver_id: string|null, presettlement_link_id: string|null}[]} loads
 */
export function detectOrphanedTourLegs(openTours, loads) {
  const pairs = new Set(openTours.map((t) => `${t.unit_id}::${t.driver_id}`));
  return loads.filter(
    (l) =>
      l.status !== "cancelled" &&
      l.presettlement_link_id === null &&
      l.assigned_unit_id &&
      l.assigned_primary_driver_id &&
      pairs.has(`${l.assigned_unit_id}::${l.assigned_primary_driver_id}`)
  );
}

async function auditLive(databaseUrl) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    const openToursRes = await client.query(
      `SELECT l.assigned_unit_id AS unit_id, l.assigned_primary_driver_id AS driver_id
         FROM driver_finance.driver_settlements ds
         JOIN mdata.loads l ON l.presettlement_link_id = ds.id
        WHERE ds.operating_company_id = $1 AND ds.status = 'open'`,
      [USMCA_OPCO_ID]
    );

    const loadsRes = await client.query(
      `SELECT id AS load_id, load_number, status, assigned_unit_id, assigned_primary_driver_id, presettlement_link_id
         FROM mdata.loads
        WHERE operating_company_id = $1 AND soft_deleted_at IS NULL`,
      [USMCA_OPCO_ID]
    );

    return { orphans: detectOrphanedTourLegs(openToursRes.rows, loadsRes.rows) };
  } finally {
    await client.end();
  }
}

function readBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")).count;
}

async function run() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.log(`${LABEL} SKIP — no DATABASE_URL (this is a live-prod-only audit, read-only role required)`);
    return;
  }
  const { orphans } = await auditLive(databaseUrl);
  const baseline = readBaseline();
  if (baseline === null) {
    console.error(`${LABEL} FAIL — no baseline file at ${path.relative(ROOT, BASELINE_PATH)}. Create it with {"count": ${orphans.length}} (current live count).`);
    process.exitCode = 1;
    return;
  }
  if (orphans.length > baseline) {
    console.error(`${LABEL} FAIL — ${orphans.length} orphaned tour leg(s) live, up from baseline ${baseline}. NEW occurrence(s):`);
    for (const o of orphans) console.error(`  ✗ load ${o.load_number} (${o.load_id}) status=${o.status} unit=${o.assigned_unit_id} driver=${o.assigned_primary_driver_id}`);
    process.exitCode = 1;
    return;
  }
  if (orphans.length < baseline) {
    console.log(`${LABEL} — ${orphans.length} orphaned tour leg(s) live (down from baseline ${baseline}). Lower the baseline count to ${orphans.length} to lock in the improvement.`);
    return;
  }
  console.log(`${LABEL} PASS — ${orphans.length} orphaned tour leg(s) live == baseline ${baseline}, none new`);
}

function selftest() {
  const assert = { ok: (c, m) => { if (!c) throw new Error(m); } };

  const openTours = [{ unit_id: "U1", driver_id: "D1" }];
  const loads = [
    { load_id: "L1", load_number: "1", status: "in_transit", assigned_unit_id: "U1", assigned_primary_driver_id: "D1", presettlement_link_id: "S1" }, // the open tour's own linked load
    { load_id: "L2", load_number: "2", status: "closed", assigned_unit_id: "U1", assigned_primary_driver_id: "D1", presettlement_link_id: null }, // orphan: same unit/driver, no link
    { load_id: "L3", load_number: "3", status: "cancelled", assigned_unit_id: "U1", assigned_primary_driver_id: "D1", presettlement_link_id: null }, // cancelled — excluded
    { load_id: "L4", load_number: "4", status: "closed", assigned_unit_id: "U2", assigned_primary_driver_id: "D2", presettlement_link_id: null }, // different unit/driver — not this tour's leg
    { load_id: "L5", load_number: "5", status: "closed", assigned_unit_id: "U1", assigned_primary_driver_id: "D1", presettlement_link_id: "S_OLD" }, // already linked to its OWN old settlement — not an orphan
  ];
  const orphans = detectOrphanedTourLegs(openTours, loads);
  assert.ok(orphans.length === 1 && orphans[0].load_id === "L2", `expected exactly L2 as the orphan, got: ${JSON.stringify(orphans)}`);

  // No open tours at all -> nothing can match, regardless of loads.
  assert.ok(detectOrphanedTourLegs([], loads).length === 0, "no open tours means no orphans can be attributed");

  // A load missing unit or driver must never match (can't be "this tour's leg" without both).
  const noUnit = [{ load_id: "L6", load_number: "6", status: "closed", assigned_unit_id: null, assigned_primary_driver_id: "D1", presettlement_link_id: null }];
  assert.ok(detectOrphanedTourLegs(openTours, noUnit).length === 0, "a load with no assigned_unit_id must never be flagged");

  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else run();
