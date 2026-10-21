#!/usr/bin/env node
/**
 * LEAD 443.204 (CC-2) — owner 2026-10-21 15:27 CT: "for the drivers we have right now, do not block loads ... for new
 * drivers starting today we must create with the entire file, for the current drivers, it cannot block, we do have the
 * files in person."
 *
 * Measured 10-21: Book Load 13687 refused 422 E_DRIVER_NOT_QUALIFIED medical_card_missing; none of the 7 USMCA drivers on
 * 13687–13695 has a medical card in the app (files on paper). Pinned here:
 *
 *  1. Migration 202616040700 adds mdata.drivers.dq_file_on_paper_since and stamps the drivers that exist in USMCA then.
 *  2. The ONE shared gate (assertDriverQualifiedForLoad) reads the stamp and splits the reasons: paperwork reasons
 *     (CDL / medical / H endorsement / HOS) are RECORDED for a stamped driver (dispatch.driver_dq_file_on_paper), never
 *     blocking; a recorded violation (inactive, drug & alcohol, Clearinghouse) is never waivable.
 *  3. Book Load's own HOS gate records, never blocks, a stamped driver.
 *  4. No application code ever writes the stamp — only the migration (a new driver can never be grandfathered).
 *  5. The office driver create refuses a new driver without the file (driver_dq_file_required).
 *
 * Static, <1s. --selftest plants each regression and proves it is caught.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-dq-gate-grandfather";
const MIG = "db/migrations/202616040700_driver_dq_file_on_paper.sql";
const GATE = "apps/backend/src/dispatch/driver-qualification.service.ts";
const BOOK = "apps/backend/src/dispatch/book-load.service.ts";
const CREATE = "apps/backend/src/mdata/drivers.routes.ts";
const FILES = [MIG, GATE, BOOK, CREATE];

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "__tests__") continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) out.push(p);
  }
  return out;
}

export function check(files, appSources) {
  const p = [];
  const mig = files[MIG] ?? "";
  const gate = files[GATE] ?? "";
  const book = files[BOOK] ?? "";
  const create = files[CREATE] ?? "";

  if (!/ADD COLUMN IF NOT EXISTS dq_file_on_paper_since timestamptz/.test(mig)) p.push(`${MIG}: does not add mdata.drivers.dq_file_on_paper_since`);
  if (!/SET dq_file_on_paper_since = now\(\)[\s\S]*WHERE d\.dq_file_on_paper_since IS NULL/.test(mig)) p.push(`${MIG}: does not stamp the drivers that exist at migration time`);

  const waivable = (gate.match(/DQ_PAPER_FILE_WAIVABLE[^=]*=\s*new Set<DriverQualificationReason>\(\[([\s\S]*?)\]\)/) ?? [])[1] ?? "";
  if (!waivable) p.push(`${GATE}: DQ_PAPER_FILE_WAIVABLE is missing`);
  for (const r of ["cdl_missing", "medical_card_missing", "hos_violation"]) if (waivable && !waivable.includes(`"${r}"`)) p.push(`${GATE}: a paper-file driver is still blocked on ${r}`);
  for (const r of ["drug_alcohol_positive", "drug_alcohol_refusal", "clearinghouse_prohibited", "driver_deactivated", "driver_status_inactive", "driver_archived"]) {
    if (waivable.includes(`"${r}"`)) p.push(`${GATE}: a recorded violation (${r}) is waived by a paper file`);
  }
  if (!/d\.dq_file_on_paper_since::text AS dq_file_on_paper_since/.test(gate)) p.push(`${GATE}: the gate does not read dq_file_on_paper_since`);
  if (!/splitPaperFileReasons\(reasons, dr\.dq_file_on_paper_since\)/.test(gate)) p.push(`${GATE}: the gate does not split reasons by the paper-file stamp`);
  if (!/if \(blocking\.length === 0\) return null;/.test(gate)) p.push(`${GATE}: the gate blocks on waived reasons`);
  if (!/reasons: blocking,/.test(gate)) p.push(`${GATE}: the block carries waived reasons`);
  if (!/"dispatch\.driver_dq_file_on_paper"/.test(gate) || !/await recordDqFileOnPaper\(client, \{/.test(gate)) p.push(`${GATE}: a waived reason is not recorded (never silent)`);

  if (!/if \(hos\?\.is_in_violation && hosPaperSince\) \{\s*await recordDqFileOnPaper\(/.test(book)) p.push(`${BOOK}: Book Load's HOS gate blocks a paper-file driver`);
  if (!/actorUserId: input\.requestingUserUuid,\s*loadNumber: input\.load_number\?\.trim\(\) \|\| input\.requested_load_number\?\.trim\(\) \|\| input\.live_load_number \|\| null,\s*via: "book_load",/.test(book)) p.push(`${BOOK}: the gate call does not carry the actor (paper-file record unattributed)`);

  if (!/const dqMissing = newDriverDqFileMissing\(b\);\s*if \(dqMissing\.length > 0\) return \{ error: "driver_dq_file_required"/.test(create)) p.push(`${CREATE}: driver create does not require the DQ file for a new driver`);
  for (const k of ["cdl_number", "cdl_expires_at", "dot_medical_expires_at"]) if (!new RegExp(`missing\\.push\\(\\{ code: "${k}"`).test(create)) p.push(`${CREATE}: driver create does not require ${k}`);

  for (const [file, src] of Object.entries(appSources ?? {})) {
    if (/dq_file_on_paper_since\s*=(?!=)|SET[^;`]*dq_file_on_paper_since|INSERT INTO mdata\.drivers[^;`]*dq_file_on_paper_since/i.test(src)) {
      p.push(`${file}: application code writes dq_file_on_paper_since (only migration 202616040700 may — a new driver is never grandfathered)`);
    }
  }
  return p;
}

function readAll() {
  const out = {};
  for (const f of FILES) {
    try { out[f] = fs.readFileSync(path.join(ROOT, f), "utf8"); } catch { out[f] = ""; }
  }
  return out;
}
function readApp() {
  const out = {};
  for (const f of walk(path.join(ROOT, "apps/backend/src"))) out[path.relative(ROOT, f)] = fs.readFileSync(f, "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const app = readApp();
  const base = check(real, app);
  if (base.length) {
    console.error(`${LABEL} --selftest: the real tree is not clean:\n  ${base.join("\n  ")}`);
    process.exit(1);
  }
  const plant = (file, from, to) => ({ ...real, [file]: real[file].replace(from, to) });
  const plants = [
    ["migration stamps nobody", plant(MIG, "SET dq_file_on_paper_since = now()", "SET dq_file_on_paper_since = NULL"), app],
    ["medical card blocks a paper-file driver", plant(GATE, '  "medical_card_missing",\n  "medical_card_expired",', '  "medical_card_expired",'), app],
    ["HOS blocks a paper-file driver", plant(GATE, '  "hos_violation",\n]);', "]);"), app],
    ["drug positive waived", plant(GATE, '  "hos_violation",\n]);', '  "hos_violation",\n  "drug_alcohol_positive",\n]);'), app],
    ["gate ignores the stamp", plant(GATE, "splitPaperFileReasons(reasons, dr.dq_file_on_paper_since)", "splitPaperFileReasons(reasons, null)"), app],
    ["gate blocks on all reasons", plant(GATE, "if (blocking.length === 0) return null;", "if (reasons.length === 0) return null;"), app],
    ["waiver silent", plant(GATE, '"dispatch.driver_dq_file_on_paper"', '"x"'), app],
    ["Book Load HOS blocks paper-file", plant(BOOK, "if (hos?.is_in_violation && hosPaperSince) {", "if (false) {"), app],
    ["create without the file", plant(CREATE, 'if (dqMissing.length > 0) return { error: "driver_dq_file_required"', 'if (false) return { error: "driver_dq_file_required"'), app],
    ["create without medical", plant(CREATE, 'missing.push({ code: "dot_medical_expires_at"', 'void ({ code: "dot_medical_expires_at"'), app],
    ["app grandfathers a new driver", real, { ...app, "apps/backend/src/mdata/x.ts": "await q(`UPDATE mdata.drivers SET dq_file_on_paper_since = now() WHERE id = $1`)" }],
  ];
  let ok = 0;
  for (const [name, files, appSrc] of plants) {
    const caught = check(files, appSrc).length > 0;
    const changed = Object.keys(files).some((k) => files[k] !== real[k]) || appSrc !== app;
    const pass = caught && changed;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}${changed ? "" : " (plant did not apply)"}`);
    if (pass) ok += 1;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}

const problems = check(readAll(), readApp());
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length}:`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — current drivers (DQ file on paper, owner 10-21) are recorded, never blocked; recorded violations still block; a new driver is created with the full file and never grandfathered`);
