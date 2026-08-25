#!/usr/bin/env node
/**
 * verify-layover-detector-fails-loud (GAP-28)
 *
 * THE DEFECT THIS PINS. The layover detector reported a healthy `tick complete { total: 0 }` while it
 * had never detected a single layover — and layover is DRIVER PAY. Three independent silent failures,
 * each alone fatal, all verified live on br-fancy-credit-akjnd07a 2026-07-27:
 *
 *   1. layover-detector-worker.ts selected `FROM org.companies WHERE active = true`. org.companies has
 *      NO `active` column (it is `is_active`) -> 42703, swallowed by `.catch(() => ({ rows: [] }))`
 *      -> ZERO companies scanned, every tick, forever.
 *   2. detection.service.ts required mdata.load_assignments, which DOES NOT EXIST on prod (retired;
 *      canonical is dispatch.load_assignment_history) -> `return 0`.
 *   3. its query selected l.uuid and l.delivered_at from mdata.loads — NEITHER is a column (PK is id;
 *      there is no delivered_at) -> 42703 if it had ever been reached.
 *
 * dispatch.driver_layovers has 0 rows, exactly as a never-executing detector produces.
 *
 * THE INVARIANT. A detector that cannot run must never be indistinguishable from one that ran and
 * found nothing. Three states must be separable in the logs:
 *   DID NOT RUN (no companies) · PARTIAL (some companies errored) · NO EVALUABLE DATA (ran, but the
 *   denominator was zero) · and only then a genuine "N layovers from M evaluable deliveries".
 *
 * This is the generalised lesson of 2026-07-26/27: the fuel-GL gap reached 1,531 unposted rows and the
 * phantom 42703s survived for the same reason — a zero that means "broken" looks exactly like a zero
 * that means "clean".
 *
 * Usage: node scripts/verify-layover-detector-fails-loud.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const SERVICE = "apps/backend/src/dispatch/layovers/detection.service.ts";
const WORKER = "apps/backend/src/jobs/layover-detector-worker.ts";
const BOOKING_WORKER = "apps/backend/src/jobs/booking-gap-aggregator-worker.ts";
const GEOFENCE_WORKER = "apps/backend/src/jobs/geofence-reconciliation-daily.ts";

/** Strip comments — a comment documenting the old defect must not re-trigger the guard. */
export function strip(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export const ASSERTIONS = [
  {
    id: "A1-NO-PHANTOM-ASSIGNMENTS-TABLE",
    file: "service",
    test: (s) => !/mdata\.load_assignments/.test(s),
    fail: "detection.service.ts still references mdata.load_assignments — that table does not exist on prod (canonical: dispatch.load_assignment_history)",
  },
  {
    id: "A2-NO-PHANTOM-LOAD-COLUMNS",
    file: "service",
    test: (s) => !/\bl\.uuid\b/.test(s) && !/\bl\.delivered_at\b/.test(s),
    fail: "detection.service.ts still selects l.uuid or l.delivered_at — neither is a column on mdata.loads (PK is id; no delivered_at)",
  },
  {
    id: "A3-CANONICAL-DRIVER-SOURCE",
    file: "service",
    test: (s) => /assigned_primary_driver_id/.test(s),
    fail: "detection.service.ts does not resolve the driver from mdata.loads.assigned_primary_driver_id (the populated, canonical field)",
  },
  {
    id: "A4-UNAVAILABLE-THROWS-NOT-ZERO",
    file: "service",
    test: (s) => /throw new LayoverDetectionUnavailableError/.test(s) && !/if \(!hasLoads \|\| !hasAssignments\) return 0;/.test(s),
    fail: "detection.service.ts returns 0 when it cannot run instead of throwing — 'cannot run' must never look like 'found none'",
  },
  {
    id: "A5-REPORTS-A-DENOMINATOR",
    file: "service",
    test: (s) => /resolvable_deliveries/.test(s),
    fail: "detection.service.ts returns a bare count with no denominator — 0 of 0 and 0 of 40 are different answers",
  },
  {
    id: "A6-WORKER-USES-REAL-COLUMN",
    file: "worker",
    test: (s) => /is_active\s*=\s*true/.test(s) && !/\bWHERE active\s*=\s*true/.test(s),
    fail: "layover-detector-worker.ts queries org.companies WHERE active = true — the column is is_active; this throws 42703",
  },
  {
    id: "A7-NO-SWALLOWING-CATCH",
    file: "worker",
    test: (s) => !/\.catch\(\(\)\s*=>\s*\(\{\s*rows:\s*\[\]/.test(s),
    fail: "layover-detector-worker.ts swallows a failed company query into an empty row set — that is how zero companies looked healthy",
  },
  {
    id: "A8-DISTINGUISHES-NO-DATA",
    file: "worker",
    test: (s) => /DID NOT RUN/.test(s) && /NO EVALUABLE DATA/.test(s),
    fail: "layover-detector-worker.ts does not distinguish 'did not run' / 'no evaluable data' from a genuine zero in its logs",
  },
  {
    id: "A9-BOOKING-CENSUS-FAILS-LOUD",
    file: "booking",
    test: (s) => /FROM org\.companies WHERE is_active = true/.test(s) && !/org\.companies[\s\S]{0,300}?\.catch\s*\(/.test(s),
    fail: "booking-gap-aggregator-worker.ts converts a failed active-company census into a healthy zero-company tick",
  },
  {
    id: "A10-GEOFENCE-CENSUS-FAILS-LOUD",
    file: "geofence",
    test: (s) => /FROM org\.companies WHERE is_active = true AND deactivated_at IS NULL/.test(s) && !/org\.companies[\s\S]{0,300}?\.catch\s*\(/.test(s),
    fail: "geofence-reconciliation-daily.ts converts a failed active-company census into a healthy zero-company run",
  },
];

function read(p) {
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${p} not found — if it moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return strip(readFileSync(abs, "utf8"));
}

export function evaluate(service, worker, booking, geofence) {
  const sources = { service, worker, booking, geofence };
  return ASSERTIONS.filter((a) => !a.test(sources[a.file]));
}

function run() {
  const failures = evaluate(read(SERVICE), read(WORKER), read(BOOKING_WORKER), read(GEOFENCE_WORKER));
  if (failures.length) {
    console.error(`[verify-layover-detector-fails-loud] FAILED — ${failures.length} of ${ASSERTIONS.length} assertions unmet:`);
    for (const f of failures) console.error(`  ✗ [${f.id}] ${f.fail}`);
    return false;
  }
  console.log(`[verify-layover-detector-fails-loud] OK — all ${ASSERTIONS.length} assertions met; a detector that cannot run can no longer report zero`);
  return true;
}

function selftest() {
  let ok = true;
  const service = read(SERVICE);
  const worker = read(WORKER);
  const booking = read(BOOKING_WORKER);
  const geofence = read(GEOFENCE_WORKER);

  if (evaluate(service, worker, booking, geofence).length) {
    console.error("SELFTEST FAIL: the real (fixed) sources are flagged — false positive");
    ok = false;
  } else {
    console.log("SELFTEST: corrected sources not flagged — OK");
  }

  // Every assertion must be able to FAIL on a real planted defect.
  const planted = [
    ["A1-NO-PHANTOM-ASSIGNMENTS-TABLE", service + "\nJOIN mdata.load_assignments la ON 1=1", worker, booking, geofence],
    ["A2-NO-PHANTOM-LOAD-COLUMNS", service + "\nSELECT l.uuid FROM x", worker, booking, geofence],
    ["A3-CANONICAL-DRIVER-SOURCE", service.replace(/assigned_primary_driver_id/g, "driver_uuid"), worker, booking, geofence],
    ["A4-UNAVAILABLE-THROWS-NOT-ZERO", service.replace(/throw new LayoverDetectionUnavailableError/g, "return 0; //"), worker, booking, geofence],
    ["A5-REPORTS-A-DENOMINATOR", service.replace(/resolvable_deliveries/g, "n"), worker, booking, geofence],
    ["A6-WORKER-USES-REAL-COLUMN", service, worker.replace(/is_active\s*=\s*true/g, "active = true"), booking, geofence],
    ["A7-NO-SWALLOWING-CATCH", service, worker + "\n.catch(() => ({ rows: [] }))", booking, geofence],
    ["A8-DISTINGUISHES-NO-DATA", service, worker.replace(/NO EVALUABLE DATA/g, "fine"), booking, geofence],
    ["A9-BOOKING-CENSUS-FAILS-LOUD", service, worker, booking.replace("      );\n\n    let count", "      ).catch(() => ({ rows: [] }));\n\n    let count"), geofence],
    ["A10-GEOFENCE-CENSUS-FAILS-LOUD", service, worker, booking, geofence.replace("    );\n\n    let total", "    ).catch(() => ({ rows: [] }));\n\n    let total")],
  ];
  for (const [id, s, w, b, g] of planted) {
    if (s === service && w === worker && b === booking && g === geofence) {
      console.error(`SELFTEST FAIL: mutation for ${id} was INERT — it proves nothing`);
      ok = false;
      continue;
    }
    if (!evaluate(s, w, b, g).some((f) => f.id === id)) {
      console.error(`SELFTEST FAIL: ${id} did NOT fire on its planted defect`);
      ok = false;
    } else {
      console.log(`SELFTEST: ${id} correctly fires on planted defect`);
    }
  }
  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
