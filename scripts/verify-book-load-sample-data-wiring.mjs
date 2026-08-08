#!/usr/bin/env node
/**
 * FAIL-D6 — `mdata.loads.is_sample_data` must be settable from Book Load.
 *
 * The column has existed since migration 0403 (`NOT NULL DEFAULT false`) but NO create surface ever
 * populated it, so every TMS-native load was written `false` whether it was a real load or a demo
 * fixture — and nothing downstream could tell them apart. Cascade proved the UI had no path at all.
 *
 * This asserts the WHOLE CHAIN, because any single missing link turns the checkbox into a lie that
 * silently writes `false` — which is the exact failure mode being fixed:
 *   form field -> default -> SUBMIT payload -> FE request type -> backend zod schema -> lockstep INSERT
 *
 * Owner ruling §9.8 keeps `is_sample_data` BANNED as a delete-selector and calls it untrustworthy as a
 * general selector *because it has been wrong on real rows*. Setting it correctly at creation is what
 * makes it trustworthy; nothing here selects rows for destruction.
 *
 *   node scripts/verify-book-load-sample-data-wiring.mjs
 *   node scripts/verify-book-load-sample-data-wiring.mjs --selftest
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-book-load-sample-data-wiring";

const MODAL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";
const API = "apps/frontend/src/api/dispatch.ts";
const ROUTES = "apps/backend/src/dispatch/loads.routes.ts";
const SERVICE = "apps/backend/src/dispatch/book-load.service.ts";
// FAIL-B4 — the EDIT path is a separate four-link chain from the CREATE path, and it was entirely unwired
// while create was green. Guarding create alone let "sample" silently reset to false on every edit.
const EDIT_MAP = "apps/frontend/src/pages/dispatch/components/book-load-v4/editLoadMapping.ts";
const UPDATE_SVC = "apps/backend/src/dispatch/update-load.service.ts";

function assert(files) {
  const problems = [];
  const modal = files[MODAL] ?? "";
  const api = files[API] ?? "";
  const routes = files[ROUTES] ?? "";
  const service = files[SERVICE] ?? "";

  if (!/is_sample_data:\s*boolean;/.test(modal)) problems.push(`${MODAL}: form type must declare is_sample_data`);
  if (!/is_sample_data:\s*false,/.test(modal)) problems.push(`${MODAL}: defaultValues must seed is_sample_data:false`);
  // The submit payload is the link that makes the checkbox real rather than decorative.
  if (!/is_sample_data:\s*values\.is_sample_data/.test(modal)) {
    problems.push(`${MODAL}: submit payload must send is_sample_data (without this the checkbox writes nothing)`);
  }
  if (!/data-testid="book-load-is-sample-data"/.test(modal)) problems.push(`${MODAL}: the checkbox control is missing`);
  if (!/is_sample_data\?:\s*boolean;/.test(api)) problems.push(`${API}: request type must carry is_sample_data`);
  if (!/is_sample_data:\s*z\.boolean\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: create schema must accept is_sample_data (zod strips unknown keys)`);
  }

  // ---- FAIL-B4: the EDIT chain (prefill -> dirty-gated patch -> update schema -> column map)
  const editMap = files[EDIT_MAP] ?? "";
  const updateSvc = files[UPDATE_SVC] ?? "";
  if (!/is_sample_data:\s*Boolean\(/.test(editMap)) {
    problems.push(`${EDIT_MAP}: edit PREFILL must hydrate is_sample_data (else the box shows unchecked on a sample load)`);
  }
  if (!/\["is_sample_data",\s*"is_sample_data"/.test(editMap)) {
    problems.push(`${EDIT_MAP}: SCALAR_FIELDS must include is_sample_data (the patch body is dirtyFields-gated, so without it a toggle is never sent)`);
  }
  if (!/is_sample_data:\s*z\.boolean\(\)\.optional\(\)[\s\S]*is_sample_data:\s*z\.boolean\(\)\.optional\(\)/.test(routes)) {
    problems.push(`${ROUTES}: BOTH the create and update schemas must accept is_sample_data (zod strips unknown keys)`);
  }
  if (!/is_sample_data:\s*"is_sample_data"/.test(updateSvc)) {
    problems.push(`${UPDATE_SVC}: SCALAR_COLUMNS must map is_sample_data or the edit never writes the column`);
  }

  const start = service.indexOf("INSERT INTO mdata.loads");
  const end = service.indexOf("RETURNING *", start);
  if (start < 0 || end < 0) {
    problems.push(`${SERVICE}: could not locate the INSERT INTO mdata.loads block`);
    return problems;
  }
  const insert = service.slice(start, end);
  const colsText = insert.split("VALUES")[0] ?? "";
  const slotsText = insert.split("VALUES")[1] ?? "";
  if (!/is_sample_data/.test(colsText)) problems.push(`${SERVICE}: INSERT column list must include is_sample_data`);
  if (!/input\.is_sample_data \?\? false/.test(service)) problems.push(`${SERVICE}: INSERT values must pass input.is_sample_data`);

  // Lockstep: a column added without its placeholder silently misaligns EVERY later column.
  const cols = colsText.slice(colsText.indexOf("(") + 1, colsText.lastIndexOf(")")).split(",").map((c) => c.trim()).filter(Boolean);
  const slots = slotsText.slice(slotsText.indexOf("(") + 1, slotsText.lastIndexOf(")")).split(",").map((v) => v.trim()).filter(Boolean);
  if (cols.length !== slots.length) {
    problems.push(`${SERVICE}: INSERT is MISALIGNED — ${cols.length} columns vs ${slots.length} value slots`);
  }
  return problems;
}

const files = Object.fromEntries([MODAL, API, ROUTES, SERVICE, EDIT_MAP, UPDATE_SVC].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (SELFTEST) {
  const checks = [
    ["submit payload dropped", { ...files, [MODAL]: files[MODAL].replace(/is_sample_data:\s*values\.is_sample_data,/, "") }],
    ["schema key dropped", { ...files, [ROUTES]: files[ROUTES].replace(/is_sample_data:\s*z\.boolean\(\)\.optional\(\),/, "") }],
    ["INSERT column dropped", { ...files, [SERVICE]: files[SERVICE].replace(/,\s*is_sample_data\n/, "\n") }],
    ["edit prefill dropped", { ...files, [EDIT_MAP]: files[EDIT_MAP].replace(/is_sample_data:\s*Boolean\([^\n]*\n/, "") }],
    ["edit patch field dropped", { ...files, [EDIT_MAP]: files[EDIT_MAP].replace(/\["is_sample_data",[^\n]*\n/, "") }],
    ["update column map dropped", { ...files, [UPDATE_SVC]: files[UPDATE_SVC].replace(/\n\s*is_sample_data:\s*"is_sample_data",/, "") }],
  ];
  for (const [name, planted] of checks) {
    if (!assert(planted).length) {
      console.error(`${LABEL} SELFTEST FAIL — planted "${name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted breaks caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — Book Load form -> submit -> request type -> zod schema -> lockstep INSERT all carry is_sample_data`);
process.exit(0);
