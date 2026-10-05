#!/usr/bin/env node
// E20 Part A (Lead spec, 2026-09-23): integrations.samsara_drivers is a many-profiles-to-one-
// target mapping (a driver or a vendor may legitimately own several Samsara profiles). This
// guard does NOT measure how many of the 758 USMCA profiles are mapped -- "UNMAPPED IS NOT A
// DEFECT. 663 profiles are supposed to stay unmapped -- shop tablets, yard trucks, drivers who
// left in June. The guard must NEVER fail on unmapped count." It checks exactly the 3 real
// failure conditions the spec names:
//   1. one samsara_driver_id mapped to TWO OR MORE driver/vendor targets within a company
//      (HARD, zero-tolerance -- structurally prevented by
//      samsara_drivers_operating_company_id_samsara_driver_id_key, the unique constraint on
//      (operating_company_id, samsara_driver_id); there can be at most one ROW per
//      samsara_driver_id per company, so this can only happen if that constraint itself is
//      somehow gone. Checked defensively, not because it is expected.)
//   2. a row with BOTH local_driver_id and local_vendor_id set (HARD, zero-tolerance --
//      prevented by the CHECK constraint ck_samsara_drivers_one_target, migration
//      202614280000. Checked defensively.)
//   3. a mapped profile (local_driver_id set) whose target mdata.drivers row is deactivated --
//      NOT structurally prevented by any constraint, and NOT zero today: measured live
//      2026-09-23, 78 of 95 mapped USMCA profiles point at a driver whose status is not
//      Active/Probation -- pre-existing mappings made before E20's own scope cut ("only
//      CURRENT drivers get mapped ... 20 driver rows are ACTIVE"). Same shrink-only-ratchet
//      shape as verify-fuel-relay-txn-vendor-unmatched.mjs: baselined debt, real growth fails,
//      real shrink is silent progress, hitting 0 requires retiring the baseline file by hand.
//
// NEVER AUTO-MAP (spec's own law) -- this guard reports, it does not resolve or write.
//
// FAILS CLOSED (never silently skips) when DATABASE_URL is not set -- ROUND 29.9-B owner
// ruling: "a live money guard that cannot connect is a FAIL, never a pass."
import fs from "node:fs";
import path from "node:path";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "live integrity check against integrations.samsara_drivers/mdata.drivers/mdata.vendors, fails closed via requireLiveDbOrExit, cannot be meaningfully exercised without a live Neon connection";

const LABEL = "verify-samsara-mapping-integrity";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const BASELINE_PATH = path.join(process.cwd(), "scripts/verify-samsara-mapping-integrity.baseline.json");

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) return null;
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

/**
 * Pure evaluation over already-fetched rows -- no I/O, fully unit-testable via --selftest.
 * Returns the two HARD structural problems (always zero-tolerance) separately from the
 * deactivated-driver count (ratcheted against a baseline).
 * @param {Array<{samsara_driver_id: string, local_driver_id: string|null, local_vendor_id: string|null, driver_deactivated: boolean}>} rows
 * @returns {{hardProblems: string[], deactivatedCount: number, deactivatedSamples: string[]}}
 */
export function checkMappingIntegrity(rows, cutoff = null) {
  const hardProblems = [];

  // Failure 1: one samsara_driver_id, two or more rows (this table is one-row-per-profile, so
  // this only happens if the profile ITSELF got duplicated -- a distinct concern from "many
  // profiles map to one driver", which is expected and fine).
  const bySamsaraId = new Map();
  for (const r of rows) {
    const list = bySamsaraId.get(r.samsara_driver_id) ?? [];
    list.push(r);
    bySamsaraId.set(r.samsara_driver_id, list);
  }
  for (const [samsaraId, group] of bySamsaraId) {
    if (group.length > 1) {
      hardProblems.push(
        `samsara_driver_id ${samsaraId} appears in ${group.length} rows within one company -- the unique constraint should make this impossible`
      );
    }
  }

  // Failure 2: both targets set on the same row.
  for (const r of rows) {
    if (r.local_driver_id && r.local_vendor_id) {
      hardProblems.push(
        `samsara_driver_id ${r.samsara_driver_id} has BOTH local_driver_id (${r.local_driver_id}) and local_vendor_id (${r.local_vendor_id}) set -- the CHECK constraint should make this impossible`
      );
    }
  }

  // Failure 3 (ratcheted, not hard): mapped to a deactivated driver.
  // 2026-10-05: the ceiling exists to catch "a NEW mapping was made to a driver who is not currently active". The
  // 05:15 auto-deactivation job retires drivers who ALREADY had a mapping (Concepcion Cordova 424a3bb9 et al., 10-05),
  // which raised the count with no mapping made at all. So, measured from timestamps:
  //   - a mapping ROW created after the cutoff AND after its driver's deactivated_at = a new mapping onto an inactive
  //     driver -> HARD (rows created before the cutoff, e.g. the 2026-09-05 bulk import, are the baselined debt);
  //   - a driver deactivated after the baseline cutoff, mapped before = retired by deactivation -> reported for a
  //     human re-map (NEVER AUTO-MAP), not counted against the ceiling;
  //   - everything else (inactive at the cutoff, or no deactivated_at) = the baselined debt -> ratcheted as before.
  const deactivated = rows.filter((r) => r.local_driver_id && r.driver_deactivated);
  const at = (v) => (v == null ? null : new Date(v).getTime());
  const cut = at(cutoff);
  const retired = [];
  const ratcheted = [];
  for (const r of deactivated) {
    const deact = at(r.deactivated_at);
    const made = at(r.mapping_created_at);
    if (deact != null && made != null && made > deact && (cut == null || made > cut)) {
      hardProblems.push(
        `samsara_driver_id ${r.samsara_driver_id} was mapped (row created ${new Date(made).toISOString()}) to driver ${r.local_driver_id} AFTER that driver was deactivated (${new Date(deact).toISOString()}) -- NEVER AUTO-MAP onto an inactive driver`
      );
    } else if (cut != null && deact != null && deact > cut) {
      retired.push(r);
    } else {
      ratcheted.push(r);
    }
  }

  return {
    hardProblems,
    deactivatedCount: ratcheted.length,
    deactivatedSamples: ratcheted.slice(0, 20).map((r) => `samsara_driver_id ${r.samsara_driver_id} -> driver ${r.local_driver_id} (deactivated)`),
    retiredByDeactivation: retired.map((r) => `samsara_driver_id ${r.samsara_driver_id} -> driver ${r.local_driver_id} (deactivated ${new Date(r.deactivated_at).toISOString()}, after the baseline; needs a human re-map)`),
  };
}

/** Pure ratchet decision for the deactivated-driver count, same 4-arm shape as the fuel-relay guard. */
export function evaluateDeactivatedRatchet(liveCount, baseline) {
  if (!baseline) {
    return {
      ok: false,
      message: `no baseline file (${path.basename(BASELINE_PATH)}). ${liveCount} deactivated-driver mapping(s) live. A reconciled baseline must exist before this check can pass on a nonzero count.`,
    };
  }
  if (liveCount === 0) {
    return {
      ok: false,
      message: `0 live deactivated-driver mappings (target reached), but a baseline entry for ${baseline.count} still exists -- remove ${path.basename(BASELINE_PATH)} (good news; confirm it, don't silently keep a stale ceiling on the books).`,
    };
  }
  if (liveCount > baseline.count) {
    return {
      ok: false,
      message: `${liveCount} mapping(s) point at a deactivated driver, up from the baseline ceiling of ${baseline.count} (established ${baseline.established}) -- a NEW mapping was made to a driver who is not currently active. NEVER AUTO-MAP; this needs a human to confirm the target.`,
    };
  }
  if (liveCount === baseline.count) {
    return {
      ok: true,
      message: `${liveCount} mapping(s) known, unresolved deactivated-driver debt (baseline ceiling ${baseline.count}, established ${baseline.established}; target is 0).`,
    };
  }
  return {
    ok: true,
    message: `${liveCount} mapping(s) remain (down from the ${baseline.count}-mapping baseline ceiling established ${baseline.established}) -- progress toward 0.`,
  };
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const res = await client.query(
      `
        SELECT sd.samsara_driver_id, sd.local_driver_id::text, sd.local_vendor_id::text,
               (d.status NOT IN ('Active', 'Probation')) AS driver_deactivated,
               d.deactivated_at, sd.created_at AS mapping_created_at
          FROM integrations.samsara_drivers sd
          LEFT JOIN mdata.drivers d ON d.id = sd.local_driver_id
         WHERE sd.operating_company_id = $1::uuid
      `,
      [USMCA_COMPANY_ID]
    );
    await client.query("COMMIT");

    const total = res.rows.length;
    const mapped = res.rows.filter((r) => r.local_driver_id || r.local_vendor_id).length;
    const baseline = loadBaseline();
    const { hardProblems, deactivatedCount, deactivatedSamples, retiredByDeactivation } = checkMappingIntegrity(
      res.rows,
      baseline?.measured_at ?? null
    );
    for (const r of retiredByDeactivation) console.log(`  · ${r}`);
    const ratchet = evaluateDeactivatedRatchet(deactivatedCount, baseline);

    if (hardProblems.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${hardProblems.length} HARD structural problem(s) (zero-tolerance) among ${total} profiles:`);
      for (const p of hardProblems.slice(0, 20)) console.error(`  ✗ ${p}`);
      process.exit(1);
    }
    if (!ratchet.ok) {
      console.error(`${LABEL}: LIVE FAIL — ${ratchet.message}`);
      for (const s of deactivatedSamples) console.error(`  ✗ ${s}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — ${total} USMCA Samsara profiles (${mapped} mapped, ${total - mapped} unmapped — never a defect), 0 hard structural problems, ${ratchet.message}`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

// SELFTEST — no DB, no network, exercises checkMappingIntegrity + evaluateDeactivatedRatchet's
// real decision logic against planted cases.
function selftest() {
  const clean = [
    { samsara_driver_id: "1", local_driver_id: "d1", local_vendor_id: null, driver_deactivated: false },
    { samsara_driver_id: "2", local_driver_id: "d1", local_vendor_id: null, driver_deactivated: false }, // many profiles -> one driver, fine
    { samsara_driver_id: "3", local_driver_id: null, local_vendor_id: null, driver_deactivated: false }, // unmapped, fine
    { samsara_driver_id: "4", local_driver_id: null, local_vendor_id: "v1", driver_deactivated: false },
  ];
  const structuralCases = [
    { name: "clean population", rows: clean, wantHard: 0, wantDeactivated: 0 },
    {
      name: "duplicate samsara_driver_id row",
      rows: [...clean, { samsara_driver_id: "1", local_driver_id: "d2", local_vendor_id: null, driver_deactivated: false }],
      wantHard: 1,
      wantDeactivated: 0,
    },
    {
      name: "both targets set",
      rows: [...clean, { samsara_driver_id: "5", local_driver_id: "d3", local_vendor_id: "v3", driver_deactivated: false }],
      wantHard: 1,
      wantDeactivated: 0,
    },
    {
      name: "mapped to deactivated driver",
      rows: [...clean, { samsara_driver_id: "6", local_driver_id: "d4", local_vendor_id: null, driver_deactivated: true }],
      wantHard: 0,
      wantDeactivated: 1,
    },
    {
      name: "unmapped-heavy population never flagged",
      rows: Array.from({ length: 50 }, (_, i) => ({
        samsara_driver_id: `u${i}`,
        local_driver_id: null,
        local_vendor_id: null,
        driver_deactivated: false,
      })),
      wantHard: 0,
      wantDeactivated: 0,
    },
  ];
  let caught = 0;
  let totalCases = structuralCases.length + 5;
  for (const c of structuralCases) {
    const verdict = checkMappingIntegrity(c.rows);
    if (verdict.hardProblems.length === c.wantHard && verdict.deactivatedCount === c.wantDeactivated) {
      caught++;
    } else {
      console.error(
        `${LABEL}: SELFTEST FAIL — case "${c.name}" expected hard=${c.wantHard}/deactivated=${c.wantDeactivated}, got hard=${verdict.hardProblems.length}/deactivated=${verdict.deactivatedCount}`
      );
    }
  }

  const ratchetCases = [ // STALE-LITERAL-OK: selftest fixtures with hardcoded baseline counts for ratchet logic testing
    { name: "no baseline", liveCount: 5, baseline: null, wantOk: false },
    { name: "growth", liveCount: 90, baseline: { count: 78, established: "2026-09-23" }, wantOk: false },
    { name: "target-hit-stale-baseline", liveCount: 0, baseline: { count: 78, established: "2026-09-23" }, wantOk: false },
    { name: "known debt (unchanged)", liveCount: 78, baseline: { count: 78, established: "2026-09-23" }, wantOk: true },
    { name: "improvement (shrink)", liveCount: 70, baseline: { count: 78, established: "2026-09-23" }, wantOk: true },
  ];
  for (const c of ratchetCases) {
    const verdict = evaluateDeactivatedRatchet(c.liveCount, c.baseline);
    if (verdict.ok === c.wantOk) {
      caught++;
    } else {
      console.error(`${LABEL}: SELFTEST FAIL — ratchet case "${c.name}" expected ok=${c.wantOk}, got ok=${verdict.ok} (${verdict.message})`);
    }
  }

  // 2026-10-05 timestamp arms: a mapping row made AFTER the deactivation is HARD; a driver deactivated after the
  // cutoff with an older mapping is retired-by-deactivation (not ratcheted); inactive at the cutoff stays ratcheted.
  const CUT = "2026-09-24T00:30:00Z";
  const m = (id, deact, made) => ({ samsara_driver_id: id, local_driver_id: "d" + id, local_vendor_id: null, driver_deactivated: true, deactivated_at: deact, mapping_created_at: made });
  const tsCases = [
    { name: "new mapping onto an inactive driver is HARD", rows: [m("1", "2026-09-10T00:00:00Z", "2026-10-01T00:00:00Z")], want: { hard: 1, count: 0, retired: 0 } },
    { name: "deactivated after the cutoff, mapped before -> retired, not ratcheted", rows: [m("2", "2026-10-05T05:15:00Z", "2026-09-05T00:00:00Z")], want: { hard: 0, count: 0, retired: 1 } },
    { name: "inactive at the cutoff -> ratcheted debt", rows: [m("3", "2026-09-10T00:00:00Z", "2026-09-05T00:00:00Z")], want: { hard: 0, count: 1, retired: 0 } },
    { name: "a pre-cutoff row onto an inactive driver is the baselined debt", rows: [m("5", "2026-07-30T00:00:00Z", "2026-09-05T00:00:00Z")], want: { hard: 0, count: 1, retired: 0 } },
    { name: "no deactivated_at -> ratcheted debt", rows: [m("4", null, "2026-09-05T00:00:00Z")], want: { hard: 0, count: 1, retired: 0 } },
  ];
  for (const c of tsCases) {
    const r = checkMappingIntegrity(c.rows, CUT);
    const got = { hard: r.hardProblems.length, count: r.deactivatedCount, retired: r.retiredByDeactivation.length };
    if (got.hard === c.want.hard && got.count === c.want.count && got.retired === c.want.retired) caught++;
    else console.error(`${LABEL}: SELFTEST FAIL — "${c.name}" expected ${JSON.stringify(c.want)}, got ${JSON.stringify(got)}`);
  }
  totalCases += tsCases.length;

  if (caught !== totalCases) {
    console.error(`${LABEL}: SELFTEST FAILED ${caught}/${totalCases} planted case(s) matched expected verdict.`);
    process.exit(1);
  }
  console.log(`${LABEL}: SELFTEST caught ${caught}/${totalCases} planted case(s) — real decision logic, no DB required.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
