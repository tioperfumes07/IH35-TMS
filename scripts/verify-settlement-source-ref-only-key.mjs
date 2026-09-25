#!/usr/bin/env node
/**
 * D3-SOURCE-REF-ONLY-KEY — LAW (Lead, 2026-09-23, verbatim): "source_document_ref is the ONLY key
 * that means AlwaysTrack. Nothing is matched to a settlement by display_id, in any query, any
 * guard, any screen, until this closes." Root finding this law responds to:
 * docs/bus/CC3-89-ROW-SETTLEMENT-NUMBERING-AUDIT-2026-09-23.md's D3 update -- live-verified
 * driver_finance.driver_settlements.display_id and .source_document_ref have DIVERGED for at
 * least 15 rows (content-matched against 6 real settlement documents: S-2026-5814's own printed
 * driver+date range belongs to document 5811, not the 5818 it currently carries). display_id is
 * a historical/instant-mint sequence number; source_document_ref is the field this repo's own law
 * treats as the real AlwaysTrack identity (settlement-source-document-ref.service.ts's own header:
 * "the ONE real service function that writes it"). The two are NOT interchangeable and a query or
 * screen that assumes they are will silently attribute a settlement's numbers to the wrong load.
 *
 * WHAT THIS GUARD CHECKS (backend only -- the frontend-side twin,
 * verify-settlement-ref-beside-load.mjs, already asserts 0 screens render display_id as the
 * user-visible settlement number):
 *   1) No backend SQL string filters driver_finance.driver_settlements by
 *      `display_id = $N` / `display_id = '...'` -- a settlement must be looked up by id (its own
 *      PK) or by source_document_ref, never by the retired display counter.
 *   2) No backend code derives a document-ref-shaped value by stripping the "S-2026-" prefix off
 *      a display_id (or similarly-named) variable -- the two sequences are independent; deriving
 *      one from the other silently reintroduces the exact divergence D3 found.
 *
 * NOT CLAIMED: this does not (and cannot) fix the 15 already-diverged historical rows -- that is a
 * data-correction task, not a guard's job, and per the same "don't guess" law this session has
 * followed all evening, only rows verified against a real settlement document are safe to correct
 * (1 of 15 verified so far; the other 14 need the missing AlwaysTrack PDFs before they can be
 * corrected without guessing).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-source-ref-only-key";
const SRC = path.join(ROOT, "apps", "backend", "src");
const SELFTEST = process.argv.includes("--selftest");

// The one real writer of both fields is allowed to reference display_id (it MINTS it, per
// settlement-display-id.ts's own contract) -- it never uses display_id to LOOK UP a row.
// R-186.1 (owner 2026-09-25): P-series display_id IS the editable pre-settlement identity
// (not AlwaysTrack). Creator + PATCH display-id must look up open shells by display_id=P-NNNN;
// AlwaysTrack digits still go only to source_document_ref (never treated as interchangeable).
const EXEMPT = new Set([
  "apps/backend/src/driver-finance/settlement-display-id.ts",
  "apps/backend/src/driver-finance/settlement-creator.service.ts",
  "apps/backend/src/driver-finance/settlements.routes.ts",
]);

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, out);
    else if (entry.isFile() && entry.name.endsWith(".ts")) out.push(abs);
  }
  return out;
}

/**
 * @param {string} src file contents
 * @returns {string[]} human-readable reasons this file violates the law, or [] if clean.
 */
export function checkSource(src) {
  const problems = [];

  // 1) A WHERE-clause style match of driver_settlements by display_id. Requires "WHERE" within
  // 200 chars before the equality (a real filter predicate), not a bare "display_id = $N" --
  // which also matches a SET assignment in an UPDATE (a write, not a lookup, and possibly a
  // totally different table's own display_id column -- confirmed false-positive on
  // accounting/bills.service.ts:2475's `SET display_id = $3`, unrelated to driver_settlements).
  const lookupRe = /WHERE[\s\S]{0,200}?\bdisplay_id\s*=\s*(\$\d+|['"][^'"]*['"])/;
  if (lookupRe.test(src) && /driver_finance\.driver_settlements|driver_settlements\b/.test(src)) {
    problems.push(
      "filters/looks up driver_finance.driver_settlements by display_id= -- use source_document_ref or the row's own id"
    );
  }

  // 2) Deriving a ref-shaped value by stripping the "S-2026-" (or any "S-YYYY-") prefix off a
  // display_id-named variable -- the generative shape of the exact bug D3 found.
  const stripRe = /display_?[Ii]d\.(replace|slice|split)\([^)]*S-\d{4}-/;
  if (stripRe.test(src)) {
    problems.push(
      'derives a document-ref value by stripping an "S-YYYY-" prefix off display_id -- the two sequences are independent, never derive one from the other'
    );
  }

  return problems;
}

function selftest() {
  const bad1 = `
    const res = await client.query(
      "SELECT * FROM driver_finance.driver_settlements WHERE display_id = $1",
      [displayId]
    );
  `;
  const bad2 = `
    const ref = displayId.replace("S-2026-", "");
  `;
  const good = `
    const res = await client.query(
      "SELECT display_id, source_document_ref FROM driver_finance.driver_settlements WHERE source_document_ref = $1",
      [ref]
    );
  `;
  // MUTATION check: an UPDATE ... SET display_id = $N on an UNRELATED table (no driver_settlements
  // anywhere nearby) must NOT be flagged -- a write is not a lookup, confirmed false-positive on
  // accounting/bills.service.ts:2475 before this fix.
  const goodWrite = `
    await client.query("UPDATE accounting.bills SET display_id = $3::text WHERE id = $1", [id, v, next]);
  `;
  if (checkSource(bad1).length !== 1) throw new Error(`${LABEL} selftest: display_id lookup not caught`);
  if (checkSource(bad2).length !== 1) throw new Error(`${LABEL} selftest: prefix-strip derivation not caught`);
  if (checkSource(good).length !== 0) throw new Error(`${LABEL} selftest: compliant source flagged`);
  if (checkSource(goodWrite).length !== 0) throw new Error(`${LABEL} selftest: unrelated SET display_id write flagged`);
  console.log(`${LABEL}: SELFTEST PASS`);
}

if (SELFTEST) {
  selftest();
  process.exit(0);
}

const files = walk(SRC, []);
const failures = [];
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  if (EXEMPT.has(rel)) continue;
  const src = fs.readFileSync(abs, "utf8");
  const problems = checkSource(src);
  for (const p of problems) failures.push(`${rel}: ${p}`);
}

if (failures.length) {
  console.error(`${LABEL}: FAILED — ${failures.length} violation(s) of "source_document_ref is the ONLY key that means AlwaysTrack":`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — 0 backend files match/derive an AlwaysTrack settlement by display_id (${files.length} files scanned)`);
