#!/usr/bin/env node
/**
 * verify-tracker-bymodule-sequence.mjs (DOC-20)
 * Locks the two Program-Tracker fixes so they cannot regress:
 *   By-Module: the per-block `module` must be derived from allowed_files PATHS / an explicit `module` field
 *   (word-boundary), NEVER from prose and NEVER defaulting to crossModule[0] (which tagged ~1006 blocks
 *   "dispatch"); unknown → "uncategorized".
 *   Sequence: the authored-phase → recon lookup must bridge via the manifest `block_ready_key` (authored ids
 *   and recon ids are disjoint namespaces) so merged work shows in its phase.
 *   Caption: the false "upper bounds / cross-audit duplication" caption must be gone.
 * Static (reads source only). Self-test: node scripts/verify-tracker-bymodule-sequence.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-tracker-bymodule-sequence";
const SVC = "apps/backend/src/program/program-tracker.service.ts";
const PAGE = "apps/frontend/src/pages/program/ProgramTrackerPage.tsx";

export function checkSvc(svc) {
  const errs = [];
  if (!/function\s+deriveModule\s*\(/.test(svc)) errs.push("deriveModule() must exist (path-based module derivation)");
  // row.module must use deriveModule, not crossModule[0]
  if (/module:\s*crossModule\[0\]/.test(svc)) errs.push("row.module must NOT use crossModule[0] (prose match → false dispatch)");
  if (!/module:\s*deriveModule\(/.test(svc)) errs.push("row.module must be derived via deriveModule(allowedFiles, moduleField)");
  // deriveModule must default to uncategorized, never a hard module
  if (!/return\s+"uncategorized"/.test(svc)) errs.push("deriveModule must fall back to \"uncategorized\", never a default module");
  // Sequence must bridge via block_ready_key
  if (!/block_ready_key\s*\?\?\s*b\.id/.test(svc) && !/block_ready_key\s*\?\?\s*blk\.id/.test(svc)) {
    errs.push("Sequence/phase lookups must bridge authored↔recon ids via block_ready_key");
  }
  return errs;
}

export function checkPage(page) {
  const errs = [];
  if (/Upper bounds|cross-audit duplication/i.test(page)) errs.push("the false 'upper bounds / cross-audit duplication' caption must be removed");
  return errs;
}

function selftest() {
  const goodSvc = 'function deriveModule(a,m){return "uncategorized";}\n module: deriveModule(entry?.allowedFiles ?? "", null),\n reconByNorm.get(normId(blk.block_ready_key ?? blk.id))';
  const badSvc = 'module: crossModule[0] ?? "x",';
  if (checkSvc(goodSvc).length) { console.error(`${LABEL} --selftest FAILED: good svc should pass`, checkSvc(goodSvc)); process.exit(1); }
  if (checkSvc(badSvc).length === 0) { console.error(`${LABEL} --selftest FAILED: crossModule[0] module must be caught`); process.exit(1); }
  if (checkPage("Upper bounds — residual cross-audit duplication").length === 0) { console.error(`${LABEL} --selftest FAILED: false caption must be caught`); process.exit(1); }
  if (checkPage("Each block counted once, by module").length) { console.error(`${LABEL} --selftest FAILED: clean caption should pass`); process.exit(1); }
  console.log(`${LABEL} --selftest — OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const errs = [...checkSvc(fs.readFileSync(path.join(ROOT, SVC), "utf8")), ...checkPage(fs.readFileSync(path.join(ROOT, PAGE), "utf8"))];
  if (errs.length) { console.error(`${LABEL} — FAILED`); for (const e of errs) console.error(`- ${e}`); process.exit(1); }
  console.log(`${LABEL} — OK (module from paths not prose; sequence bridged via block_ready_key; false caption gone)`);
}
