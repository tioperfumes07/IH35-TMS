#!/usr/bin/env node
/**
 * LEAD 443.257-B (measured live 10-22 7:11 PM CT): the Book Load driver picker listed 11 drivers; five Active,
 * non-sample USMCA drivers (Concepcion Cordova Dominguez, Genaro Guerrero Chavez, Vicente Santos Contreras,
 * Pedro Abraham Lopez Collado, Rafael Rogelio Rivero Reynoso) were missing, so the Truck Line preset of
 * Concepcion rendered her raw id. Root cause: the shared driver picker asked GET /mdata/drivers?status=Active,
 * which is MOVEMENT-derived (Rule 49, drove in the last 15 days), not the driver's recorded status.
 *
 * Static guard over the ONE driver picker source (entityPickerRegistry.ts, kind "driver"):
 *   R1  the picker never sends `status` to listDrivers (that is the movement-derived roster question);
 *   R2  it filters on the RECORDED status (Active, + Probation for money pickers);
 *   R3  it reads the whole roster in one call (limit ≥ the roster; no silent 200 truncation per status);
 *   R4  labels go through formatPersonName (proper case — never ALL CAPS, never an id as a name);
 *   R5  (443.257-A item 3) Book Load ranks the list: usual driver of the truck, free drivers, then "On load ####".
 *   R6  (443.266-A) entityLabel person-cases PEOPLE only (driver / user): "JUAN PEREZ" → "Juan Perez", while an
 *       organization (customer / vendor / broker …) renders as entered — "ACME" stays "ACME".
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/components/parity/entityPickerRegistry.ts";

function driverListBody(src) {
  const start = src.indexOf("  driver: {");
  if (start < 0) return "";
  const end = src.indexOf("\n  trailer: {", start);
  return src.slice(start, end < 0 ? undefined : end);
}

export function audit(src) {
  const body = driverListBody(src);
  if (!body) return ["driver picker entry not found"];
  const f = [];
  const call = body.match(/listDrivers\(\{[\s\S]*?\}\)/g) ?? [];
  if (call.length === 0) f.push("R1: the driver picker no longer reads listDrivers");
  if (call.some((c) => /\bstatus\b/.test(c))) f.push("R1: the picker sends `status` — GET /mdata/drivers?status=Active is movement-derived and drops idle Active drivers");
  if (!/statuses\.includes\(String\(\(d as \{ status\?: string \| null \}\)\.status/.test(body)) f.push("R2: the picker does not filter on the recorded driver status");
  if (!call.some((c) => /limit:\s*1000/.test(c))) f.push("R3: the picker does not read the whole roster in one call");
  if (!/label: entityLabel\(formatPersonName\(/.test(body)) f.push("R4: driver labels are not proper-cased through formatPersonName");
  return f;
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const LABEL_FILE = "apps/frontend/src/lib/entity-label.ts";
const labelSrc = fs.readFileSync(path.join(ROOT, LABEL_FILE), "utf8");
/** R6 — evaluates the PERSON_NOUNS set literally: only driver / user may be person-cased. */
export function casingFailures(l) {
  const m = l.match(/const PERSON_NOUNS = new Set\(\[([^\]]*)\]\)/);
  if (!m) return ["R6: entity-label.ts has no PERSON_NOUNS set (people-only casing)"];
  const nouns = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).sort();
  const f = [];
  if (!nouns.includes("driver") || !nouns.includes("user")) f.push(`R6: driver / user names are not proper-cased ("JUAN PEREZ" must become "Juan Perez")`);
  const orgs = nouns.filter((n) => !["driver", "user"].includes(n));
  if (orgs.length) f.push(`R6: organization names are person-cased ("ACME" would become "Acme"): ${orgs.join(", ")}`);
  if (!/if \(PERSON_NOUNS\.has\(String\(noun\)\.trim\(\)\.toLowerCase\(\)\)\) \{\s*return formatPersonName\(s\);/.test(l)) f.push("R6: entityLabel does not gate formatPersonName on PERSON_NOUNS");
  return f;
}
const EQUIP = "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx";
const equip = fs.readFileSync(path.join(ROOT, EQUIP), "utf8");
export function rankingFailures(e) {
  return /decorateOptions=\{decorateDriverOptions\}/.test(e) && /rankDriverOptions\(options, driverRankingContext\)/.test(e)
    ? [] : ["R5: Book Load does not rank the driver list (usual / free / on load)"];
}

if (process.argv.includes("--selftest")) {
  const base = audit(src).length;
  const plant = (from, to) => (src.includes(from) ? audit(src.replace(from, to)).length > base : null);
  const cases = [
    ["status=Active sent to the movement roster FAILS", plant("          limit: 1000,", "          status: \"Active\",\n          limit: 1000,")],
    ["no recorded-status filter FAILS", plant("if (!statuses.includes(String((d as { status?: string | null }).status", "if (false && (String((d as { status?: string | null }).status")],
    ["a 200-row page FAILS", plant("          limit: 1000,", "          limit: 200,")],
    ["raw ALL-CAPS labels FAIL", plant("label: entityLabel(formatPersonName(", "label: entityLabel((")],
    ["an unranked Book Load driver list FAILS", rankingFailures(equip.replace("decorateOptions={decorateDriverOptions}", "")).length > 0],
    ["org acronym person-cased (ACME → Acme) FAILS", casingFailures(labelSrc.replace('new Set(["driver", "user"])', 'new Set(["driver", "user", "customer"])')).length > 0],
    ["driver ALL CAPS left as-is (JUAN PEREZ) FAILS", casingFailures(labelSrc.replace('new Set(["driver", "user"])', 'new Set(["user"])')).length > 0],
  ];
  let bad = 0;
  for (const [n, ok] of cases) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}${ok === null ? " (plant anchor missing)" : ""}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? "verify-book-load-driver-picker-lists-every-active-driver --selftest FAIL" : `verify-book-load-driver-picker-lists-every-active-driver --selftest PASS (${cases.length}/${cases.length})`);
  process.exit(bad ? 1 : 0);
}

const failures = [...audit(src), ...rankingFailures(equip), ...casingFailures(labelSrc)];
if (failures.length) {
  console.error(`verify-book-load-driver-picker-lists-every-active-driver: FAIL — ${failures.length}`);
  for (const x of failures) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log("verify-book-load-driver-picker-lists-every-active-driver: OK — every recorded Active driver is selectable, proper case, people-only casing (R1–R6)");
