#!/usr/bin/env node
/** @matrix-built {"modules":["safety","factoring"],"cols":["liability"],"leafRe":"^(internal_fines\\.create|safety\\.modal\\.fine_convert_confirm|home\\.reserve_tracker|submit\\.queue|batches\\.create|batches\\.detail|reserves\\.dashboard|accounting\\.submit)$","task":"LINK-F5187-LIABILITY-COLUMN-HONESTY-CLUSTER-A-FALSE-REQUIRED"} */
/**
 * LINK-F5187 — liability Required-column honesty audit, cluster A false-required batch
 * (settlements/safety/factoring, CC-1's own core money lane). This guard pins the 8 leaves
 * that were flagged liability Required but are pre-persistence surfaces or categorical
 * rollups with no single owning liability record:
 *
 *   safety:internal_fines.create -- the +Create Fine form; no fine row exists yet.
 *   safety:safety.modal.fine_convert_confirm -- FineConvertConfirmModal.tsx literally reads
 *     "This will create a driver liability for $X" (future tense); the liability does not
 *     exist until the user confirms. The already-created liability links from
 *     safety.drawer.fine_detail / safety.parity.fine_detail, both left Required, untouched.
 *   factoring:home.reserve_tracker / reserves.dashboard -- reserve-balance rollup views
 *     (aggregate across many reserve movements). CORRECTS a pre-existing WRONG claim in this
 *     same file (honesty_audit.liability_surfaces_built_2026_08_12) that these were
 *     "LIABILITY-SURFACES-BUILT" citing getReserveBalances as proof -- verified live
 *     2026-08-15: neither file contains any EntityLink kind="liability" (only kind="factor").
 *   factoring:submit.queue / batches.create / accounting.submit -- pre-persistence
 *     preview/create surfaces (WAVE-C-liability-* comments confirm: computed
 *     Net-Fee-Advance "preview of the reserve/liability", no persisted liability row exists
 *     at create/submit time).
 *   factoring:batches.detail -- same computed Net-Fee-Advance derivation as a header summary,
 *     not a link to a single liability row (the real per-movement ledger lives in
 *     reserve_tracker/reserves.dashboard, both rollups, both dropped above).
 *
 * Pure Required-flag corrections -- no source-code regression to guard (nothing was built),
 * so this guard only pins the required.json state, same shape as the cluster-3/false-required
 * batch guards from the earlier gl_je sweep (PRs #6936, #6938).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liability-required-honest-cluster-a-false-required";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  safety: "docs/specs/scoreboard/modules/safety.required.json",
  factoring: "docs/specs/scoreboard/modules/factoring.required.json",
};

const DROPPED = [
  ["safety", "internal_fines.create"],
  ["safety", "safety.modal.fine_convert_confirm"],
  ["factoring", "home.reserve_tracker"],
  ["factoring", "submit.queue"],
  ["factoring", "batches.create"],
  ["factoring", "batches.detail"],
  ["factoring", "reserves.dashboard"],
  ["factoring", "accounting.submit"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}

export function assertClusterAFalseRequired(docs) {
  const problems = [];
  for (const [mod, id] of DROPPED) {
    const doc = docs[mod];
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("liability")) problems.push(`${mod}:${id} must not require liability`);
  }
  return problems;
}

function selftest() {
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertClusterAFalseRequired(docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "liability"])];
    if (assertClusterAFalseRequired(mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add liability to ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertClusterAFalseRequired(liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
