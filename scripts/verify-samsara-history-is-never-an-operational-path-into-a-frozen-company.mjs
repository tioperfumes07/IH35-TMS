#!/usr/bin/env node
/**
 * verify-samsara-history-is-never-an-operational-path-into-a-frozen-company — ROUND 380.3, CC-1.
 *
 * Ruling: Samsara telematics history is KEPT (it is what a truck and a driver actually did), but "nothing operational
 * or financial on USMCA may resolve a driver, unit or trailer THROUGH it." Measured 2026-10-03: 352 USMCA-scoped
 * telematics.vehicle_driver_assignments rows name 23 drivers of a frozen company (1 still open) and 1 names a unit
 * USMCA does not use; the shared attribution helper resolved 33 USMCA fuel fills to a frozen-company driver.
 *
 * STATIC — every non-test file under apps/backend/src that reads telematics.vehicle_driver_assignments is CLASSIFIED:
 *   OPERATIONAL — resolves a driver / unit for something USMCA does (attribution, fuel, settlement, tour close, fraud,
 *                 defaults, scoring). RULE 1: EVERY query there carries a company pin — assignmentInCompanySql(…), or an
 *                 inline join pinning the driver (d.operating_company_id = …) or the unit (owner / leased company = …).
 *   HISTORY     — shows or ingests the record as history (profiles, hubs, aggregates, the Samsara projectors). Allowed.
 *   RULE 2: a reader that is not classified fails — a new path must say which it is.
 * LIVE (direct, read-only, USMCA only):
 *   RULE 3 — 0 USMCA loads, fuel transactions or journal postings carry a driver belonging to another company.
 *   Reported, not failed: the count of USMCA history rows naming another company's driver (retained by ruling).
 * --selftest exercises every rule.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-samsara-history-is-never-an-operational-path-into-a-frozen-company";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
export const REQUIRES_LIVE_DB = "the operational rows are a live fact — fails closed without a database";

const B = "apps/backend/src/";
export const OPERATIONAL = new Set([
  "maintenance/driver-attribution.ts",
  "maintenance/damage-event-attribution.service.ts",
  "maintenance/integrity-findings-attribution.service.ts",
  "integrations/fuel/fraud-detector/rules.service.ts",
  "dispatch/driver-pwa/tour-close.service.ts",
  "dispatch/trip-pairing-board.service.ts",
  "safety/driver-scoring/scoring.service.ts",
  "mdata/unit-default-driver.routes.ts",
  "mdata/driver-default-truck.routes.ts",
  "driver/pwa-live.routes.ts",
].map((f) => B + f));
/** Queries inside an OPERATIONAL-classified file that are the pairing WRITER's own bookkeeping (it must see every row
 *  to open / close it) — exempt by function name, everything else in the file is checked. */
export const WRITER_FILES = new Map([
  [B + "telematics/vehicle-driver-lookup.service.ts", { resolverFunctions: ["getDriverForVehicleAtTime"] }],
]);
export const HISTORY = new Map([
  ["integrations/samsara/vehicle-driver-pairing/pairing.service.ts", "Samsara pairing projector (writes the history)"],
  ["integrations/samsara/samsara-stats-probe.service.ts", "Samsara diagnostics"],
  ["integrations/samsara/hos-driver-map-preview.service.ts", "HOS driver-map preview (display)"],
  ["integrations/samsara/active-hos-driver-roster.service.ts", "HOS roster from the feed (display)"],
  ["integrations/samsara/active-driver-set/recompute.service.ts", "active-driver set from the feed"],
  ["integrations/samsara/messaging/driver-message-inbound.service.ts", "inbound driver message routing"],
  ["integrations/samsara/samsara-positions.service.ts", "positions ingest"],
  ["cron/samsara-positions-cron.ts", "positions ingest cron"],
  ["telematics/vehicle-driver-pairing.routes.ts", "pairing history screen"],
  ["telematics/stop-events.reads.ts", "stop-event history"],
  ["telematics/hos-tracker.service.ts", "HOS tracker display"],
  ["telematics/fleet-location-hos.service.ts", "fleet map display"],
  ["telematics/driver-day-summary.routes.ts", "driver day summary display"],
  ["mdata/unit-aggregate.service.ts", "unit profile history"],
  ["mdata/driver-aggregate.service.ts", "driver profile history"],
  ["mdata/driver-inactivity-preview.service.ts", "inactivity preview for the company's own drivers"],
  ["mdata/driver-active-30d.service.ts", "30-day activity for the company's own drivers (DCA-pinned)"],
  ["mdata/canonical/driver-overview.service.ts", "driver overview history"],
  ["mdata/canonical/driver-hub.service.ts", "driver hub history"],
  ["mdata/canonical/driver-profile.service.ts", "driver profile history"],
  ["driver-profile/driver-profile-tabs.service.ts", "driver profile tabs history"],
  ["master-data/drivers/operations-depth/maintenance-assignments.service.ts", "driver operations-depth history"],
  ["assignments/quicksave.routes.ts", "operator writes a pairing (writer, not a resolver)"],
  ["drivers/drivers-bulk.routes.ts", "bulk driver admin (writer, not a resolver)"],
  ["jobs/vehicle-driver-pairing-worker.ts", "pairing worker (writer)"],
].map(([f, why]) => [B + f, why]));

const PIN_RE = [
  /assignmentInCompanySql\s*\(/,
  /\bd\.operating_company_id\s*=\s*(?:\$\d|[a-z_]+\.operating_company_id)/,
  /(?:owner_company_id|currently_leased_to_company_id)[^\n]{0,80}(?:\$\d|[a-z_]+\.operating_company_id)/,
];
const READ_RE = /(?:FROM|JOIN)\s+telematics\.vehicle_driver_assignments\b/g;

/** The SQL around one read: back to the template's opening backtick, forward to its closing one (bounded). */
function querySpan(src, idx) {
  const start = Math.max(src.lastIndexOf("`", idx), idx - 1500);
  const endTick = src.indexOf("`", idx);
  return src.slice(start, endTick === -1 ? idx + 1500 : Math.min(endTick, idx + 2500));
}
function enclosingFunction(src, idx) {
  const re = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  let name = null, m;
  while ((m = re.exec(src)) && m.index < idx) name = m[1];
  return name;
}

export function fileProblems(rel, src) {
  const reads = [...src.matchAll(READ_RE)].map((m) => m.index);
  if (!reads.length) return [];
  if (HISTORY.has(rel)) return [];
  const writer = WRITER_FILES.get(rel);
  if (!OPERATIONAL.has(rel) && !writer) return [`RULE 2 ${rel} reads telematics.vehicle_driver_assignments but is not classified OPERATIONAL or HISTORY`];
  const out = [];
  for (const idx of reads) {
    if (writer && !writer.resolverFunctions.includes(enclosingFunction(src, idx))) continue;
    const span = querySpan(src, idx);
    if (/^\s*\*|^\s*\/\//m.test(src.slice(src.lastIndexOf("\n", idx) + 1, idx))) continue; // a comment line
    if (!PIN_RE.some((re) => re.test(span))) {
      out.push(`RULE 1 ${rel}:${src.slice(0, idx).split("\n").length} resolves through telematics.vehicle_driver_assignments with no company pin — add assignmentInCompanySql(alias)`);
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "__tests__") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name)) acc.push(p);
  }
  return acc;
}

export function run() {
  const out = [];
  for (const abs of walk(join(ROOT, "apps/backend/src"))) {
    const rel = relative(ROOT, abs);
    const src = readFileSync(abs, "utf8");
    if (!src.includes("telematics.vehicle_driver_assignments")) continue;
    out.push(...fileProblems(rel, src));
  }
  return out;
}

export function liveProblems(m) {
  const out = [];
  if (m.loads > 0) out.push(`RULE 3 ${m.loads} USMCA load(s) assign a driver of another company`);
  if (m.fuel > 0) out.push(`RULE 3 ${m.fuel} USMCA fuel transaction(s) carry a driver of another company`);
  if (m.postings > 0) out.push(`RULE 3 ${m.postings} USMCA posting(s) name a driver of another company`);
  return out;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const op = B + "maintenance/driver-attribution.ts";
    const cases = [
      ["a pinned operational read passes", fileProblems(op, "const q = `SELECT 1 FROM telematics.vehicle_driver_assignments a WHERE ${assignmentInCompanySql(\"a\")}`;").length === 0],
      ["an unpinned operational read fails", fileProblems(op, "const q = `SELECT a.driver_id FROM telematics.vehicle_driver_assignments a WHERE a.operating_company_id = $1`;").some((x) => x.startsWith("RULE 1"))],
      ["an inline driver pin passes", fileProblems(op, "const q = `SELECT 1 FROM telematics.vehicle_driver_assignments a JOIN mdata.drivers d ON d.id = a.driver_id AND d.operating_company_id = a.operating_company_id`;").length === 0],
      ["a history reader passes unpinned", fileProblems(B + "mdata/driver-aggregate.service.ts", "`SELECT 1 FROM telematics.vehicle_driver_assignments a`").length === 0],
      ["an unclassified reader fails", fileProblems(B + "new/thing.ts", "`SELECT 1 FROM telematics.vehicle_driver_assignments a`").some((x) => x.startsWith("RULE 2"))],
      ["the writer's own bookkeeping is exempt, its resolver is not", (() => {
        const w = B + "telematics/vehicle-driver-lookup.service.ts";
        const ok = fileProblems(w, "async function getOpenAssignment() { return `SELECT 1 FROM telematics.vehicle_driver_assignments WHERE ended_at IS NULL`; }").length === 0;
        const bad = fileProblems(w, "export async function getDriverForVehicleAtTime() { return `SELECT driver_id FROM telematics.vehicle_driver_assignments WHERE unit_id = $2`; }").length === 1;
        return ok && bad;
      })()],
      ["live clean passes", liveProblems({ loads: 0, fuel: 0, postings: 0 }).length === 0],
      ["a load on a frozen driver fails", liveProblems({ loads: 1, fuel: 0, postings: 0 }).some((x) => x.startsWith("RULE 3"))],
    ];
    // real-file mutant: strip the pin from the shared helper → caught
    const real = readFileSync(join(ROOT, op), "utf8");
    const stripped = real.replace(/\$\{assignmentInCompanySql\("a"\)\}/g, "TRUE");
    cases.push(["stripping the pin from the real helper is caught", stripped !== real && fileProblems(op, stripped).some((x) => x.startsWith("RULE 1"))]);
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const one = async (sql) => Number((await client.query(sql, [USMCA])).rows[0].n);
    const m = {
      history: await one(`SELECT count(*)::int n FROM telematics.vehicle_driver_assignments v JOIN mdata.drivers d ON d.id = v.driver_id WHERE v.operating_company_id = $1::uuid AND d.operating_company_id <> v.operating_company_id`),
      loads: await one(`SELECT count(*)::int n FROM mdata.loads l JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id WHERE l.operating_company_id = $1::uuid AND d.operating_company_id <> l.operating_company_id`),
      fuel: await one(`SELECT count(*)::int n FROM fuel.fuel_transactions f JOIN mdata.drivers d ON d.id = f.driver_id WHERE f.operating_company_id = $1::uuid AND d.operating_company_id <> f.operating_company_id`),
      postings: await one(`SELECT count(*)::int n FROM accounting.journal_entry_postings p JOIN mdata.drivers d ON d.id = p.entity_uuid WHERE p.operating_company_id = $1::uuid AND p.entity_type = 'driver' AND d.operating_company_id <> p.operating_company_id`),
    };
    await client.query("ROLLBACK");
    problems.push(...liveProblems(m));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — every operational reader is company-pinned; USMCA loads / fuel / postings on another company's driver: 0 / 0 / 0; ${m.history} USMCA telematics history row(s) naming another company's driver retained by ruling (380.3).`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
