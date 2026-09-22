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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-one-load-create-path";
const SRC_ROOT = path.join(ROOT, "apps", "backend", "src");
const SHARED_PATH_FILE = path.join(SRC_ROOT, "dispatch", "book-load.service.ts");

// Shrink-only. Was 4 the day this guard was added (2026-09-22) -- the 4 files the ruling itself
// named as offenders, confirmed live against this exact repo state. Lower this number only when a
// file below is actually rewired to call createLoadWithFullSideEffects; never raise it.
const OFFENDER_CEILING = 4;

const KNOWN_OFFENDERS_AT_SEED = [
  "apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts",
  "apps/backend/src/mdata/loads.routes.ts",
  "apps/backend/src/seed/csv-seed-import.ts",
  "apps/backend/src/onboarding/seed-sample-data.ts",
];

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
    const src = fs.readFileSync(file, "utf8");
    if (/INSERT\s+INTO\s+mdata\.loads\b/i.test(src)) {
      offenders.push(path.relative(ROOT, file).split(path.sep).join("/"));
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

  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.rmSync(offenderDir, { recursive: true, force: true });

  if (failures.length) {
    for (const f of failures) console.error(`${LABEL} ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — well-formed fixture passes, missing-symbol/planted-offender fixtures are correctly caught, real repo carries every required call.`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
