#!/usr/bin/env node
// DISPATCH-LOAD-PATCH-COMMODITY-COLUMN-MISSING-500 / ACCT-F9508 — guard
//
// HISTORY: mdata.loads never had commodity/cargo_weight_lbs/reefer_setpoint_temp_f columns until
// migration 202613220000. update-load.service.ts's SCALAR_COLUMNS previously mapped all 3 fields
// directly to those nonexistent columns, and loads.routes.ts's updateDispatchLoadBodySchema +
// editLoadMapping.ts's Edit-wizard round-trip fed values into that write path — so any PATCH
// /api/v1/dispatch/loads/:id touching them 42703'd, poisoning every OTHER dirty field bundled in
// the same request. The 2026-08-27 fix removed all 3 fields from the write path end to end.
//
// SUPERSEDED (ACCT-F9508, migration 202613220000): commodity + cargo_weight_lbs are now REAL
// mdata.loads columns (this was the sibling CREATE-side finding,
// DISPATCH-LOAD-COMMODITY-CREATE-SILENT-NOOP — the columns were owner-approved back on 2026-06-22
// but the migration claiming they "already existed" was false; the migration now actually adding
// them closes both findings at once). commodity + cargo_weight_lbs are RESTORED to the write path.
// reefer_setpoint_temp_f is PERMANENTLY EXCLUDED — that name was never a real column under either
// finding; the real reefer setpoint column is reefer_temp_f (render-v6 §B, migration
// 202606231400), already fully wired end-to-end and untouched by either finding.
//
// This guard now locks the POST-FIX invariant: commodity/cargo_weight_lbs ARE present and
// correctly wired (write path + read path), and reefer_setpoint_temp_f is NEVER reintroduced
// anywhere.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/dispatch/loads.routes.ts";
const SERVICE_FILE = "apps/backend/src/dispatch/update-load.service.ts";
const MAPPING_FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts";
const BOOK_LOAD_FILE = "apps/backend/src/dispatch/book-load.service.ts";

// Code-shape patterns only — NOT bare substring matches, which would also trip on the explanatory
// prose comments in these same files that legitimately document "reefer_setpoint_temp_f was never
// a real column" for historical context. Only a live code reference (a schema field, a type decl,
// a SCALAR_COLUMNS/SCALAR_FIELDS entry, a form-key lookup) counts as a regression.
const FOREVER_BANNED_PATTERNS = [
  { file: "routes", re: /^\s*reefer_setpoint(_temp_f)?:\s*z\./m },
  { file: "service", re: /^\s*reefer_setpoint(_temp_f)?:\s*(number|string)/m },
  { file: "service", re: /^\s*reefer_setpoint(_temp_f)?:\s*"reefer_setpoint(_temp_f)?",\s*$/m },
  { file: "mapping", re: /\["reefer_setpoint(_temp_f)?"/ },
  { file: "mapping", re: /load\.reefer_setpoint(_temp_f)?\b/ },
  { file: "mapping", re: /v\.reefer_setpoint(_temp_f)?\b/ },
];

export function check(routesText, serviceText, mappingText, bookLoadText) {
  const failures = [];
  const byFile = { routes: [routesText, ROUTES_FILE], service: [serviceText, SERVICE_FILE], mapping: [mappingText, MAPPING_FILE] };

  // 1) reefer_setpoint_temp_f / reefer_setpoint must NEVER reappear as a live code reference
  // anywhere in the write path — that name was never a real column under either finding.
  for (const { file, re } of FOREVER_BANNED_PATTERNS) {
    const [text, label] = byFile[file];
    if (re.test(text)) failures.push(`${label} reintroduces banned phantom field pattern ${re}`);
  }

  // 2) commodity + cargo_weight_lbs MUST be present and correctly wired post-fix (migration
  // 202613220000 added the real columns — regressing back to "removed" is itself a regression).
  const patchIdx = routesText.indexOf("const updateDispatchLoadBodySchema = z.object({");
  // Self-sizing: find the schema object's own closing `});` at column 0 rather than a fixed
  // character count — a fixed window silently stops "seeing" fields near the end of a growing
  // schema block once enough comments/fields are added earlier in it (the exact GR1-MONEY-GUARDS
  // stale-slice class, ACCT-F5576/ACCT-F5703; this guard hit the same trap when
  // LOADS-MILEAGE-INTEGER-TRUNCATION added a few comment lines ahead of commodity/cargo_weight_lbs).
  const patchEnd = patchIdx >= 0 ? routesText.indexOf("\n});", patchIdx) : -1;
  const patchBlock = patchIdx >= 0 ? routesText.slice(patchIdx, patchEnd >= 0 ? patchEnd : undefined) : "";
  if (!/^\s*commodity:\s*z\./m.test(patchBlock)) {
    failures.push(`${ROUTES_FILE} updateDispatchLoadBodySchema no longer accepts "commodity" (regression — the column is real, migration 202613220000)`);
  }
  if (!/^\s*cargo_weight_lbs:\s*z\./m.test(patchBlock)) {
    failures.push(`${ROUTES_FILE} updateDispatchLoadBodySchema no longer accepts "cargo_weight_lbs" (regression — the column is real, migration 202613220000)`);
  }

  if (!/^\s*commodity:\s*string \| null;/m.test(serviceText)) {
    failures.push(`${SERVICE_FILE} UpdateDispatchLoadFields no longer declares "commodity"`);
  }
  if (!/^\s*cargo_weight_lbs:\s*number \| null;/m.test(serviceText)) {
    failures.push(`${SERVICE_FILE} UpdateDispatchLoadFields no longer declares "cargo_weight_lbs"`);
  }
  if (!/^\s*commodity:\s*"commodity",\s*$/m.test(serviceText)) {
    failures.push(`${SERVICE_FILE} SCALAR_COLUMNS no longer maps "commodity" to its real column`);
  }
  if (!/^\s*cargo_weight_lbs:\s*"cargo_weight_lbs",\s*$/m.test(serviceText)) {
    failures.push(`${SERVICE_FILE} SCALAR_COLUMNS no longer maps "cargo_weight_lbs" to its real column`);
  }

  if (!mappingText.includes('["commodity", "commodity"')) {
    failures.push(`${MAPPING_FILE} no longer round-trips "commodity" in the Edit-wizard SCALAR_FIELDS`);
  }
  if (!mappingText.includes('["weight_lbs", "cargo_weight_lbs"')) {
    failures.push(`${MAPPING_FILE} no longer round-trips "weight_lbs"→"cargo_weight_lbs" in the Edit-wizard SCALAR_FIELDS`);
  }
  if (!mappingText.includes("commodity: str(load.commodity)")) {
    failures.push(`${MAPPING_FILE} no longer prefills "commodity" from the load detail`);
  }

  // 3) The CREATE path (book-load.service.ts) must actually persist commodity/weight_lbs — the
  // sibling silent-no-op this migration also fixes.
  if (!/commodity, cargo_weight_lbs\s*\)/.test(bookLoadText)) {
    failures.push(`${BOOK_LOAD_FILE} INSERT column list no longer includes commodity, cargo_weight_lbs`);
  }
  if (!bookLoadText.includes("input.commodity?.trim() || null")) {
    failures.push(`${BOOK_LOAD_FILE} no longer reads input.commodity into the INSERT`);
  }
  if (!bookLoadText.includes("input.weight_lbs ?? null")) {
    failures.push(`${BOOK_LOAD_FILE} no longer reads input.weight_lbs into the INSERT`);
  }

  return failures;
}

function readAll() {
  return {
    routesText: fs.readFileSync(path.join(root, ROUTES_FILE), "utf8"),
    serviceText: fs.readFileSync(path.join(root, SERVICE_FILE), "utf8"),
    mappingText: fs.readFileSync(path.join(root, MAPPING_FILE), "utf8"),
    bookLoadText: fs.readFileSync(path.join(root, BOOK_LOAD_FILE), "utf8"),
  };
}

function run() {
  const { routesText, serviceText, mappingText, bookLoadText } = readAll();
  const failures = check(routesText, serviceText, mappingText, bookLoadText);
  if (failures.length > 0) {
    console.error("FAIL: dispatch-load-patch-commodity-column-missing-500");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: commodity/cargo_weight_lbs correctly wired end-to-end (create + edit + read); reefer_setpoint_temp_f permanently excluded (never a real column)"
  );
}

function selftest() {
  const { routesText, serviceText, mappingText, bookLoadText } = readAll();

  // Baseline must be clean.
  const baseline = check(routesText, serviceText, mappingText, bookLoadText);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: reintroduce the banned phantom field as a LIVE code reference (a SCALAR_FIELDS
  // entry), not merely mentioning its name in prose — the guard must ignore the latter (this same
  // file's own history comments say "reefer_setpoint_temp_f" legitimately) and catch the former.
  const offenderA = mappingText.replace(
    '["reefer_mode", "reefer_mode"',
    '["reefer_setpoint_temp_f", "reefer_setpoint_temp_f"'
  );
  if (offenderA === mappingText) {
    console.error("FAIL(selftest): offender mutation did not change editLoadMapping.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresA = check(routesText, serviceText, offenderA, bookLoadText);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (reefer_setpoint_temp_f reintroduced as live code) was NOT caught");
    process.exit(1);
  }
  // Also confirm the guard does NOT false-positive on this file's own legitimate prose mentions.
  const proseOnly = check(routesText, serviceText, mappingText, bookLoadText);
  if (proseOnly.length !== 0) {
    console.error("FAIL(selftest): guard false-positives on legitimate prose comments mentioning reefer_setpoint_temp_f:", proseOnly);
    process.exit(1);
  }

  // Mutation 2: regress commodity out of the PATCH schema again.
  const offenderB = routesText.replace(
    /^\s*commodity:\s*z\.string\(\)\.trim\(\)\.max\(120\)\.nullable\(\)\.optional\(\),\n/m,
    ""
  );
  if (offenderB === routesText) {
    console.error("FAIL(selftest): offender mutation did not change loads.routes.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresB = check(offenderB, serviceText, mappingText, bookLoadText);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (commodity removed from PATCH schema again) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: regress the CREATE-side INSERT back to silently dropping commodity/weight_lbs.
  const offenderC = bookLoadText.replace("input.commodity?.trim() || null,\n        input.weight_lbs ?? null,\n", "");
  if (offenderC === bookLoadText) {
    console.error("FAIL(selftest): offender mutation did not change book-load.service.ts — pattern out of sync");
    process.exit(1);
  }
  const failuresC = check(routesText, serviceText, mappingText, offenderC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (CREATE silent-no-op reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
