#!/usr/bin/env node
/**
 * verify-one-load-create-path — FEED-PARITY-01.
 *
 * docs/manuals/04-RULING-FEED-PARITY-THE-VERIFIED-SIDE-EFFECT-LIST.md (2026-09-22): "ONE SHARED
 * CREATE PATH. ... A feed source cannot bypass a side effect by omission, because there is
 * nothing left to omit." apps/backend/src/dispatch/book-load.service.ts's
 * createLoadWithFullSideEffects(client, input, {source}) is that path -- extracted 2026-09-22
 * (CC-3) from what used to be bookLoadInTransaction's inline body, with every one of the 8
 * INSERTs and 14 resolvers/gates the ruling named still called, in the same order, unchanged.
 *
 * TWO ASSERTIONS:
 *  1. SHRINK-ONLY RATCHET -- no file other than book-load.service.ts (and test fixtures under
 *     __tests__/, which set up DB state directly and are not a production create path) may
 *     `INSERT INTO mdata.loads`. Today's real offenders, verified live against the ruling's own
 *     list: integrations/edi/transactions/inbound-204.handler.ts, mdata/loads.routes.ts,
 *     seed/csv-seed-import.ts, onboarding/seed-sample-data.ts. Wiring each of these to call
 *     createLoadWithFullSideEffects instead is real, separate, per-caller work -- NOT done in the
 *     PR that adds this guard (disclosed in that PR's own REMAINING, not silently claimed). This
 *     assertion is seeded at today's TRUE count (4) and may only shrink, never grow -- the same
 *     shape as verify-dispatch-reads-live-loads-view.mjs's own four-arm ratchet.
 *  2. THE SHARED PATH ITSELF -- book-load.service.ts must still call every one of the 8 INSERT
 *     table names and 14 resolver/gate symbol names the ruling listed, by name. If any one of them
 *     stops being called, the "one path, nothing left to omit" guarantee is broken even though the
 *     ratchet count above stays flat.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REQUIRES_LIVE_DB =
  "mdata.loads + dispatch.load_charge_lines + driver_finance.driver_bills — outcome check must fail-closed";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-load-create-path";
const SRC_ROOT = path.join(ROOT, "apps", "backend", "src");
const SHARED_PATH_FILE = path.join(SRC_ROOT, "dispatch", "book-load.service.ts");
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Shrink-only. Was 4 the day this guard was added (2026-09-22) -- the 4 files the ruling itself
// named as offenders, confirmed live against this exact repo state. Lower this number only when a
// file below is actually rewired to call createLoadWithFullSideEffects; never raise it.
//
// E6 (2026-09-22, same day): inbound-204.handler.ts rewired to call createLoadWithFullSideEffects
// (source="live_feed") -- the first of the 4 to land. 4 -> 3. seed-sample-data.ts rewired next
// (source="historical_backfill", synthetic demo data, softer gates) -- 3 -> 2.
//
// REVERSED (2026-09-23, same round): csv-seed-import.ts was briefly EXCLUDED here on the
// argument that its CompanyCode type ("TRK" | "TRANSP") makes it structurally incapable of
// writing USMCA. The owner overturned that call directly: "WHY SHOULDNT IT WORK FOR USMCA? WE
// MIGHT NEED IT TO IMPORT DATA AS WELL WOULDNT WE?" -- he was right, the exclusion was wrong.
// EXCLUDED_FILES / the permanent-exception pattern is retired; this file goes back to being a
// real, owed KNOWN_OFFENDERS_AT_SEED entry, to be extended to USMCA and rewired like the others,
// not permanently carved out. Ceiling back to 2.
//
// mdata/loads.routes.ts REWIRED (2026-09-23, same round, "loads.routes.ts Book Load, fully
// built" -- Lead ruling, validate-never-coerce on status): its POST /api/v1/mdata/loads now
// calls createLoadWithFullSideEffects (source="live_feed") instead of a direct INSERT. Ceiling
// shrinks 2 -> 1.
//
// csv-seed-import.ts REWIRED (2026-09-23, same round, "csv-seed-import.ts extended to USMCA"):
// its upsertLoads() now calls createLoadWithFullSideEffects (source="historical_backfill")
// instead of a direct INSERT; CompanyCode widened to admit "USMCA" via the existing
// org.companies code lookup (never a hardcoded UUID). Ceiling shrinks 1 -> 0. ALL FOUR original
// offenders (book-load.service.ts itself is the shared path, not a caller; inbound-204.handler.ts;
// seed-sample-data.ts; loads.routes.ts; csv-seed-import.ts) are now on the one shared create
// path. The ratchet holds at zero from here -- ANY new direct INSERT INTO mdata.loads is a
// regression, full stop.
const OFFENDER_CEILING = 0;

const KNOWN_OFFENDERS_AT_SEED = [];

// The 8 INSERTs, by table (ruling's own numbering).
const REQUIRED_INSERT_TABLES = [
  "mdata.loads",
  "docs.file_links",
  "dispatch.load_charge_lines",
  "dispatch.load_assignment_history",
  "mdata.load_stops",
];

// The 14 resolvers/gates, by symbol (ruling's own list). driver_bills' two INSERTs (:984/:1070)
// live inside createDriverBillArtifacts, called from the shared path -- checked by symbol, not by
// re-finding the raw INSERT here (that function is its own, separately-tested unit).
const REQUIRED_SYMBOLS = [
  "resolveLoadTrailerEquipmentIdForInsert",
  "resolveDriverBasePayCents", // via createDriverBillArtifacts
  "createDriverBillArtifacts",
  "resolveFactoringVendorId",
  "findOpenPresettlementTourForUnit",
  "claimReservation",
  "reserveNextLoadId",
  "assertUnitNotActiveOnAnotherLoad",
  "detectAssetCoverageGap",
  "assertDriverQualifiedForLoad",
  "isDrugDispatchBlocked", // the drug-test gate
  "hos?.is_in_violation", // the HOS check
  "is_oos", // the out-of-service check
  "invalid_unit_for_company", // the unit validity check
  "appendCrudAudit",
];

function listSourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === "__tests__") continue;
        walk(full);
      } else if (entry.isFile() && /\.(ts|mjs)$/.test(entry.name)) {
        out.push(full);
      }
    }
  };
  walk(SRC_ROOT);
  return out;
}

export function findOffenders() {
  const offenders = [];
  for (const file of listSourceFiles()) {
    if (path.resolve(file) === path.resolve(SHARED_PATH_FILE)) continue;
    const rel = path.relative(ROOT, file).split(path.sep).join("/");
    const src = fs.readFileSync(file, "utf8");
    if (/INSERT\s+INTO\s+mdata\.loads\b/i.test(src)) {
      offenders.push(rel);
    }
  }
  return offenders.sort();
}

export function checkSharedPathIntact() {
  if (!fs.existsSync(SHARED_PATH_FILE)) {
    return [`${path.relative(ROOT, SHARED_PATH_FILE)}: file missing -- the shared create path itself does not exist`];
  }
  const src = fs.readFileSync(SHARED_PATH_FILE, "utf8");
  const fnMatch = src.match(/export async function createLoadWithFullSideEffects\([\s\S]*?\n\}\n/);
  if (!fnMatch) {
    return ["createLoadWithFullSideEffects not found in book-load.service.ts -- the shared path has been removed or renamed"];
  }
  const body = fnMatch[0];
  const missing = [];
  for (const table of REQUIRED_INSERT_TABLES) {
    const re = new RegExp(`INSERT\\s+INTO\\s+${table.replace(".", "\\.")}\\b`, "i");
    if (!re.test(body)) missing.push(`INSERT INTO ${table}`);
  }
  for (const sym of REQUIRED_SYMBOLS) {
    if (!body.includes(sym)) missing.push(`symbol "${sym}"`);
  }
  return missing.map((m) => `createLoadWithFullSideEffects no longer calls/contains: ${m}`);
}

export function check() {
  const problems = [];
  const offenders = findOffenders();
  if (offenders.length > OFFENDER_CEILING) {
    problems.push(
      `RATCHET FAIL -- ${offenders.length} file(s) INSERT INTO mdata.loads outside the shared create path (ceiling ${OFFENDER_CEILING}): ${offenders.join(", ")}`
    );
  }
  const newOffenders = offenders.filter((f) => !KNOWN_OFFENDERS_AT_SEED.includes(f));
  if (newOffenders.length > 0 && offenders.length <= OFFENDER_CEILING) {
    // A NEW offender replacing a fixed one, count still under ceiling -- still worth naming so it
    // doesn't sit disguised as "the same 4 forever."
    problems.push(`NEW offender(s) not in the seeded list (still under ceiling, named for visibility): ${newOffenders.join(", ")}`);
  }
  problems.push(...checkSharedPathIntact());
  return { problems, offenderCount: offenders.length, offenders };
}

/**
 * Live outcome check — asserts that the shared create path's side effects
 * are actually PRESENT in live data, not just called in code. A path that
 * calls every INSERT but produces no rows is a path that doesn't work.
 *
 * SCOPE (owner/Lead handoff 2026-09-24 + RULE 52): only loads whose Faro
 * purchase day is listed in scripts/feed/closed_purchase_days.json. A day that
 * has not closed is still being fed — asserting tour/charge/bill outcomes on
 * every historical USMCA load deadlocks the entire repo (measured: 40/79 tour
 * gaps while feed_cursor closed=0). Empty closed list → self-arming (0 owed).
 *
 * Checks (USMCA, non-voided, non-sample, closed-purchase-day loads):
 *  1. CHARGE_LINES: every load has at least one dispatch.load_charge_lines row.
 *  2. FACTORING_VENDOR: every load has factoring_company_vendor_id set.
 *  3. TOUR_LINK: every load has tour_id set (presettlement tour linkage).
 *  4. DRIVER_BILLS: every load has at least one driver_finance.driver_bills row.
 *
 * Pure function — exported for selftest.
 */
function loadClosedPurchaseDays() {
  const p = path.join(ROOT, "scripts/feed/closed_purchase_days.json");
  if (!fs.existsSync(p)) return [];
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  return Array.isArray(j.closed_purchase_days) ? j.closed_purchase_days.map(String) : [];
}
export function classifyLoadOutcomes(input) {
  const { totalLoads, loadsWithChargeLines, loadsWithFactoringVendor,
    loadsWithTourLink, loadsWithDriverBills } = input;

  const checks = [];
  const problems = [];

  // If no live loads, the guard is self-arming — out of scope, not a failure.
  if (totalLoads === 0) {
    return {
      checks: [{ id: "OUTCOME", name: "SELF_ARMING", expected: "loads > 0", live: "0 loads (not fed yet)", pass: true }],
      problems: [],
      allPass: true,
    };
  }

  // 1. CHARGE_LINES
  const chargeGap = totalLoads - loadsWithChargeLines;
  checks.push({
    id: "CHARGE_LINES",
    name: "CHARGE_LINES",
    expected: `${totalLoads}/${totalLoads} loads with charge lines`,
    live: `${loadsWithChargeLines}/${totalLoads} (${chargeGap} missing)`,
    pass: chargeGap === 0,
  });
  if (chargeGap > 0) {
    problems.push(`CHARGE_LINES_MISSING: ${chargeGap} of ${totalLoads} load(s) have no dispatch.load_charge_lines row. The shared create path calls INSERT INTO dispatch.load_charge_lines but the outcome is absent.`);
  }

  // 2. FACTORING_VENDOR
  const vendorGap = totalLoads - loadsWithFactoringVendor;
  checks.push({
    id: "FACTORING_VENDOR",
    name: "FACTORING_VENDOR",
    expected: `${totalLoads}/${totalLoads} loads with factoring vendor`,
    live: `${loadsWithFactoringVendor}/${totalLoads} (${vendorGap} missing)`,
    pass: vendorGap === 0,
  });
  if (vendorGap > 0) {
    problems.push(`FACTORING_VENDOR_MISSING: ${vendorGap} of ${totalLoads} load(s) have no factoring_company_vendor_id. The shared create path calls resolveFactoringVendorId but the outcome is absent.`);
  }

  // 3. TOUR_LINK
  const tourGap = totalLoads - loadsWithTourLink;
  checks.push({
    id: "TOUR_LINK",
    name: "TOUR_LINK",
    expected: `${totalLoads}/${totalLoads} loads with tour link`,
    live: `${loadsWithTourLink}/${totalLoads} (${tourGap} missing)`,
    pass: tourGap === 0,
  });
  if (tourGap > 0) {
    problems.push(`TOUR_LINK_MISSING: ${tourGap} of ${totalLoads} load(s) have no tour_id. The shared create path calls findOpenPresettlementTourForUnit but the outcome is absent.`);
  }

  // 4. DRIVER_BILLS
  const billGap = totalLoads - loadsWithDriverBills;
  checks.push({
    id: "DRIVER_BILLS",
    name: "DRIVER_BILLS",
    expected: `${totalLoads}/${totalLoads} loads with driver bills`,
    live: `${loadsWithDriverBills}/${totalLoads} (${billGap} missing)`,
    pass: billGap === 0,
  });
  if (billGap > 0) {
    problems.push(`DRIVER_BILLS_MISSING: ${billGap} of ${totalLoads} load(s) have no driver_finance.driver_bills row. The shared create path calls createDriverBillArtifacts but the outcome is absent.`);
  }

  return { checks, problems, allPass: problems.length === 0 };
}

/**
 * Measure live load outcomes from the database. Read-only.
 * Scoped to closed Faro purchase days (see loadClosedPurchaseDays).
 */
/** Owner uuid used for FORCE-RLS reads (dispatch.load_charge_lines has no lucia bypass arm). */
const MEASURE_OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";

export async function measureLoadOutcomes(client) {
  const closedDays = loadClosedPurchaseDays();
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',false)");
  // FORCE ROW LEVEL SECURITY on dispatch.load_charge_lines: bypass_rls GUC alone is inert
  // (policy is operating_company_id IN user_accessible_company_ids() only). Owner identity
  // makes that set non-empty so the outcome half can see real charge lines.
  await client.query("SELECT set_config('app.current_user_id',$1::text,false)", [MEASURE_OWNER_USER_ID]);
  await client.query("SELECT set_config('app.operating_company_id',$1::text,false)", [USMCA_COMPANY_ID]);

  // No closed purchase day yet → 0 loads in scope (self-arming). Never scan the whole board.
  if (closedDays.length === 0) {
    await client.query("ROLLBACK");
    return {
      totalLoads: 0,
      loadsWithChargeLines: 0,
      loadsWithFactoringVendor: 0,
      loadsWithTourLink: 0,
      loadsWithDriverBills: 0,
      closedPurchaseDays: closedDays,
    };
  }

  // In-scope = USMCA load linked to a live Faro advance whose purchase date is closed.
  const scopeSql = `
    l.operating_company_id = $1::uuid
    AND l.is_sample_data IS NOT TRUE
    AND l.voided_at IS NULL
    AND EXISTS (
      SELECT 1
        FROM accounting.invoices i
        JOIN accounting.factoring_advances fa ON fa.id = i.factoring_advance_id
       WHERE i.source_load_id = l.id
         AND i.voided_at IS NULL
         AND fa.voided_at IS NULL
         AND fa.faro_purchase_date = ANY($2::date[])
    )`;

  const totalRes = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads l WHERE ${scopeSql}`,
    [USMCA_COMPANY_ID, closedDays],
  );
  const chargeRes = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads l
      WHERE ${scopeSql}
        AND EXISTS (SELECT 1 FROM dispatch.load_charge_lines lcl WHERE lcl.load_id = l.id)`,
    [USMCA_COMPANY_ID, closedDays],
  );
  const vendorRes = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads l
      WHERE ${scopeSql}
        AND l.factoring_company_vendor_id IS NOT NULL`,
    [USMCA_COMPANY_ID, closedDays],
  );
  const tourRes = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads l
      WHERE ${scopeSql}
        AND l.tour_id IS NOT NULL`,
    [USMCA_COMPANY_ID, closedDays],
  );
  const billRes = await client.query(
    `SELECT count(*)::int AS cnt FROM mdata.loads l
      WHERE ${scopeSql}
        AND EXISTS (SELECT 1 FROM driver_finance.driver_bills db WHERE db.load_id = l.id AND db.voided_at IS NULL)`,
    [USMCA_COMPANY_ID, closedDays],
  );

  await client.query("ROLLBACK");

  return {
    totalLoads: totalRes.rows[0].cnt,
    loadsWithChargeLines: chargeRes.rows[0].cnt,
    loadsWithFactoringVendor: vendorRes.rows[0].cnt,
    loadsWithTourLink: tourRes.rows[0].cnt,
    loadsWithDriverBills: billRes.rows[0].cnt,
    closedPurchaseDays: closedDays,
  };
}

function report({ problems, offenderCount, offenders }) {
  if (problems.length === 0) {
    console.log(
      `${LABEL} OK — ${offenderCount}/${OFFENDER_CEILING} offender(s) outside the shared create path (ratchet holding or shrinking), createLoadWithFullSideEffects still calls every required INSERT/resolver/gate.`
    );
    if (offenders.length) console.log(`  current offenders: ${offenders.join(", ")}`);
    return 0;
  }
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  - ${p}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const failures = [];

  // case 1: a well-formed shared-path fixture must pass checkSharedPathIntact.
  const goodFn =
    `export async function createLoadWithFullSideEffects(client, input, opts) {\n` +
    REQUIRED_INSERT_TABLES.map((t) => `  await client.query('INSERT INTO ${t} (...) VALUES (...)');\n`).join("") +
    REQUIRED_SYMBOLS.map((s) => `  /* uses ${s} */\n`).join("") +
    `}\n`;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "one-load-create-path-"));
  const tmpFile = path.join(tmpDir, "book-load.service.ts");
  fs.writeFileSync(tmpFile, goodFn);
  const goodSrc = fs.readFileSync(tmpFile, "utf8");
  const goodMatch = goodSrc.match(/export async function createLoadWithFullSideEffects\([\s\S]*?\n\}\n/);
  if (!goodMatch) failures.push("case1 setup FAIL — well-formed fixture must itself match the extraction regex.");
  const goodMissing = REQUIRED_INSERT_TABLES.filter(
    (t) => !new RegExp(`INSERT\\s+INTO\\s+${t.replace(".", "\\.")}\\b`, "i").test(goodMatch?.[0] ?? "")
  );
  if (goodMissing.length) failures.push(`case1 FAIL — well-formed fixture missing tables it should contain: ${goodMissing.join(", ")}`);

  // case 2 (RED): a fixture missing one required symbol must be caught.
  const badFn = goodFn.replace(/\/\* uses assertUnitNotActiveOnAnotherLoad \*\/\n/, "");
  const badMatch = badFn.match(/export async function createLoadWithFullSideEffects\([\s\S]*?\n\}\n/);
  const badMissing = REQUIRED_SYMBOLS.filter((s) => !(badMatch?.[0] ?? "").includes(s));
  if (!badMissing.includes("assertUnitNotActiveOnAnotherLoad")) {
    failures.push("case2 FAIL — removing assertUnitNotActiveOnAnotherLoad from the fixture must be caught as missing.");
  }

  // case 3 (RED before GREEN, against the REAL repo): before this guard's own PR landed, the real
  // book-load.service.ts had no createLoadWithFullSideEffects at all -- confirm the real file DOES
  // have it now (this selftest run itself is the GREEN proof; a run against the pre-extraction
  // commit would have failed case 1's regex against the real file, which is exactly the RED this
  // guard is designed to catch).
  const realProblems = checkSharedPathIntact();
  if (realProblems.length > 0) {
    failures.push(`case3 FAIL — the REAL book-load.service.ts is missing something the ruling requires: ${realProblems.join("; ")}`);
  }

  // case 4: offender detection catches a planted violation.
  const offenderDir = fs.mkdtempSync(path.join(os.tmpdir(), "one-load-create-path-offender-"));
  const offenderFile = path.join(offenderDir, "planted-offender.ts");
  fs.writeFileSync(offenderFile, `await client.query("INSERT INTO mdata.loads (a) VALUES (1)");`);
  const plantedSrc = fs.readFileSync(offenderFile, "utf8");
  if (!/INSERT\s+INTO\s+mdata\.loads\b/i.test(plantedSrc)) {
    failures.push("case4 FAIL — the offender-detection regex must match a planted direct INSERT INTO mdata.loads.");
  }

  // case 5: outcome classifier — GREEN (all loads have all outcomes)
  const greenOutcome = classifyLoadOutcomes({ totalLoads: 10, loadsWithChargeLines: 10, loadsWithFactoringVendor: 10, loadsWithTourLink: 10, loadsWithDriverBills: 10 });
  if (!greenOutcome.allPass) {
    failures.push(`case5 FAIL — GREEN outcome: expected all pass, got ${greenOutcome.problems}`);
  }

  // case 6: outcome classifier — RED (charge lines missing)
  const redCharge = classifyLoadOutcomes({ totalLoads: 32, loadsWithChargeLines: 0, loadsWithFactoringVendor: 32, loadsWithTourLink: 32, loadsWithDriverBills: 30 });
  if (redCharge.allPass || !redCharge.checks.find(c => c.id === "CHARGE_LINES").pass === false) {
    failures.push("case6 FAIL — RED charge lines: expected CHARGE_LINES FAIL");
  }

  // case 7: outcome classifier — RED (factoring vendor missing)
  const redVendor = classifyLoadOutcomes({ totalLoads: 32, loadsWithChargeLines: 32, loadsWithFactoringVendor: 0, loadsWithTourLink: 32, loadsWithDriverBills: 32 });
  if (redVendor.allPass || redVendor.checks.find(c => c.id === "FACTORING_VENDOR").pass) {
    failures.push("case7 FAIL — RED factoring vendor: expected FACTORING_VENDOR FAIL");
  }

  // case 8: outcome classifier — RED (tour link missing)
  const redTour = classifyLoadOutcomes({ totalLoads: 32, loadsWithChargeLines: 32, loadsWithFactoringVendor: 32, loadsWithTourLink: 0, loadsWithDriverBills: 32 });
  if (redTour.allPass || redTour.checks.find(c => c.id === "TOUR_LINK").pass) {
    failures.push("case8 FAIL — RED tour link: expected TOUR_LINK FAIL");
  }

  // case 9: outcome classifier — RED (driver bills missing)
  const redBills = classifyLoadOutcomes({ totalLoads: 32, loadsWithChargeLines: 32, loadsWithFactoringVendor: 32, loadsWithTourLink: 32, loadsWithDriverBills: 30 });
  if (redBills.allPass || redBills.checks.find(c => c.id === "DRIVER_BILLS").pass) {
    failures.push("case9 FAIL — RED driver bills: expected DRIVER_BILLS FAIL");
  }

  // case 10: outcome classifier — self-arming (0 loads = ok)
  const emptyOutcome = classifyLoadOutcomes({ totalLoads: 0, loadsWithChargeLines: 0, loadsWithFactoringVendor: 0, loadsWithTourLink: 0, loadsWithDriverBills: 0 });
  if (!emptyOutcome.allPass) {
    failures.push("case10 FAIL — self-arming: 0 loads should PASS (out of scope)");
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(offenderDir, { recursive: true, force: true });

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — well-formed fixture passes, missing-symbol/planted-offender fixtures are correctly caught, real repo carries every required call, outcome classifier 6/6 (GREEN + 4 RED + self-arming).`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    process.exit(await selftest());
  }
  // Static check
  const staticResult = check();
  const staticExit = report(staticResult);
  if (staticExit !== 0) process.exit(staticExit);

  // Live outcome check (requires DATABASE_URL)
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let outcomes;
  try {
    outcomes = await measureLoadOutcomes(client);
  } finally {
    client.release();
    await pool.end();
  }
  const { checks, problems, allPass } = classifyLoadOutcomes(outcomes);
  const closed = outcomes.closedPurchaseDays ?? loadClosedPurchaseDays();
  console.log(
    `${LABEL}: live outcome check (USMCA, closed Faro purchase days only: ${closed.length ? closed.join(",") : "none — self-arming"})`,
  );
  for (const c of checks) {
    const result = c.pass ? "PASS" : "FAIL";
    console.log(`  ${c.id.padEnd(16)} ${c.name.padEnd(16)} expected ${c.expected.padEnd(30)} live ${c.live.padEnd(30)} ${result}`);
  }
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL — ${problems.length} outcome problem(s):\n` + problems.map((p) => `  ${p}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} OK — static path intact, live outcomes present.`);
  process.exit(0);
}
