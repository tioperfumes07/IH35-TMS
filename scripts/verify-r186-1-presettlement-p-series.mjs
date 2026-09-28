#!/usr/bin/env node
/**
 * verify-r186-1-presettlement-p-series.mjs — ROUND 155 (Claude Lead).
 *
 * LOCKS OWNER RULING R-186.1 (2026-09-25 06:35 PM CT) IN STATIC CODE.
 *
 * The ruling: an open pre-settlement carries OUR OWN opco-scoped P-series on display_id
 * (P-0001, P-0002 …). It must NEVER be stamped with AlwaysTrack's continuing document sequence.
 * Before the ruling, opening a tour called allocateNextSettlementSourceDocumentRef and minted FAKE
 * AlwaysTrack numbers — 5817, 5818, 5819 — that looked exactly like real signed-document numbers
 * sitting next to the real ones. A real AlwaysTrack number enters the system exactly one way: the
 * owner types it into the editable Creator / Pre-Settlement header, and it lands in
 * source_document_ref, never on display_id.
 *
 * WHY A GUARD AND NOT JUST THE TESTS. The product code was changed by the ruling; the test doubles
 * were not. They kept pattern-matching the RETIRED allocator SQL and handing back bare AlwaysTrack
 * numbers, so 17 tests across 4 files blew up with "Settlement number allocation failed: expected
 * P-NNNN" and the whole settlement-identity guard went red on main — blocking every seat's push
 * behind a ruling none of them had broken. Nothing in the repo asserted the ruling itself, so the
 * only thing holding it up was a suite that had silently drifted off it.
 *
 * A guard that greps for the retired SQL string would NOT catch this, and it is worth saying why:
 * allocateNextSettlementSourceDocumentRef is still live and still correct for its own job
 * (setSettlementSourceDocumentRef, when the owner types a real AlwaysTrack number). The literal did
 * not disappear from the repo — it moved out of ONE call site. So this guard asserts the call site,
 * not the string.
 *
 * WHAT IT ASSERTS:
 *   1. allocateSettlementDisplayId queries the P-series (substring(display_id from '^P-([0-9]+)$'))
 *      and validates its result against /^P-\d{4,}$/ before returning it.
 *   2. It does NOT call allocateNextSettlementSourceDocumentRef.
 *   3. presettlement-link.service.ts's create_new branch does not call it either — the path that
 *      minted 5817/5818/5819.
 *
 *   node scripts/verify-r186-1-presettlement-p-series.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-r186-1-presettlement-p-series";

const ALLOCATOR = "apps/backend/src/driver-finance/settlement-display-id.ts";
const PRESETTLEMENT = "apps/backend/src/dispatch/presettlement-link.service.ts";
const RETIRED_CALL = "allocateNextSettlementSourceDocumentRef";

export function auditAllocator(source) {
  const failures = [];
  if (source == null) return [`${ALLOCATOR}: file missing — R-186.1 has no allocator to lock`];
  if (!source.includes("substring(display_id from '^P-([0-9]+)$')")) {
    failures.push(`${ALLOCATOR}: must mint the opco-scoped P-series off display_id (R-186.1)`);
  }
  if (!/\/\^P-\\d\{4,\}\$\//.test(source)) {
    failures.push(`${ALLOCATOR}: must validate the allocated id against /^P-\\d{4,}$/ before returning it`);
  }
  if (stripComments(source).includes(RETIRED_CALL)) {
    failures.push(
      `${ALLOCATOR}: calls ${RETIRED_CALL} — R-186.1 retired that path for display_id; it minted fake ` +
        `AlwaysTrack numbers (5817/5818/5819). A real AlwaysTrack number is typed by the owner and ` +
        `lands in source_document_ref.`
    );
  }
  return failures;
}

export function auditPresettlement(source) {
  if (source == null) return [`${PRESETTLEMENT}: file missing`];
  if (!stripComments(source).includes(RETIRED_CALL)) return [];
  return [
    `${PRESETTLEMENT}: calls ${RETIRED_CALL} — opening a tour must NOT mint an AlwaysTrack document ` +
      `number. source_document_ref stays NULL until the owner types a real one (R-186.1).`,
  ];
}

/**
 * Strip // and block comments before looking for a CALL. Both files name
 * allocateNextSettlementSourceDocumentRef in a comment that explains why R-186.1 stopped calling
 * it — that prose is the ruling being documented at the call site, which is exactly what we want
 * kept. Matching on it would punish the code for explaining itself.
 */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const failures = [...auditAllocator(read(ALLOCATOR)), ...auditPresettlement(read(PRESETTLEMENT))];
  if (failures.length > 0) {
    console.error(`${LABEL} FAIL — owner ruling R-186.1 is not held by the code:\n`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(
      `\nA fake document number that looks like a real signed one, sitting next to the real ones, is ` +
        `not a cosmetic problem. Do not weaken this to make a suite green.`
    );
    process.exit(1);
  }
  console.log(`${LABEL} OK — pre-settlements mint the P-series; no AlwaysTrack number is invented`);
}
