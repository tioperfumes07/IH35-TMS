#!/usr/bin/env node
/**
 * P1 SETTLEMENT NUMBERING (Claude Lead, ROUND 18.3, Item A) — static-shape guard.
 *
 * CORRECTED 2026-09-11: this guard originally asserted a NEW, second allocator
 * (settlement-document-number-allocator.ts) was wired at tour close. That file has been
 * RETIRED — it duplicated the pre-existing, already-live, already-audited allocator
 * presettlement-link.service.ts uses at tour OPEN (allocateNextSettlementSourceDocumentRef /
 * setSettlementSourceDocumentRef, settlement-source-document-ref.service.ts), using a DIFFERENT
 * advisory-lock key that did not mutually exclude against it — a real double-allocation race
 * between an open-time and a close-time settlement, found live (see OUTBOX-CC-3.md,
 * "duplicate-allocator" correction). This guard now asserts the CLOSE path reuses the SAME
 * canonical functions, not a second implementation.
 *
 * Also fixes this guard's OWN prior blind spot: the "no rogue MAX(source_document_ref) reads"
 * scanner used a regex requiring the literal text `MAX(source_document_ref` — the pre-existing
 * service's own code reads `MAX((source_document_ref)::int)` (an extra wrapping paren), which
 * silently escaped detection. The scanner below tolerates that shape.
 *
 * This guard is source-shape only (no DB) — it asserts both trip-close call sites in
 * settlements-load-bookended.service.ts import and call allocateNextSettlementSourceDocumentRef +
 * setSettlementSourceDocumentRef immediately after their own trip_closed_at UPDATE, guarded by a
 * read that never overwrites an existing number, and that no OTHER file in apps/backend computes
 * MAX(source_document_ref) outside the one canonical service.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-settlement-document-number-allocator-wired";
const CANONICAL_FILE = "apps/backend/src/driver-finance/settlement-source-document-ref.service.ts";
const CALLER_FILE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const BACKEND_SRC = "apps/backend/src";
/** Matches `MAX(source_document_ref` and `MAX((source_document_ref)` (any wrapping parens/casts). */
const ROGUE_MAX_RE = /MAX\(\(?source_document_ref\)?/i;

function analyze(canonicalSrc, callerSrc) {
  const failures = [];

  if (!/pg_advisory_xact_lock/.test(canonicalSrc) || !/export async function allocateNextSettlementSourceDocumentRef/.test(canonicalSrc)) {
    failures.push(`${CANONICAL_FILE}: allocateNextSettlementSourceDocumentRef (with its advisory lock) is missing`);
  }
  if (!/export async function setSettlementSourceDocumentRef/.test(canonicalSrc)) {
    failures.push(`${CANONICAL_FILE}: setSettlementSourceDocumentRef is missing`);
  }
  if (!/\bawait appendCrudAudit\(/.test(canonicalSrc)) {
    failures.push(`${CANONICAL_FILE}: setSettlementSourceDocumentRef no longer audits the write`);
  }

  if (!/import \{\s*\n?\s*allocateNextSettlementSourceDocumentRef,\s*\n?\s*setSettlementSourceDocumentRef,?\s*\n?\s*\} from "\.\/settlement-source-document-ref\.service\.js";/.test(callerSrc)) {
    failures.push(`${CALLER_FILE}: missing the canonical allocator+writer import`);
  }
  const callCount = (callerSrc.match(/await allocateNextSettlementSourceDocumentRef\(/g) || []).length;
  if (callCount < 2) {
    failures.push(`${CALLER_FILE}: expected 2 allocator call sites (closeLoadBookendedSettlementForDriver + stampTripClosedForBookendedSettlement), found ${callCount}`);
  }
  const writeCallCount = (callerSrc.match(/await setSettlementSourceDocumentRef\(/g) || []).length;
  if (writeCallCount < 2) {
    failures.push(`${CALLER_FILE}: expected 2 setSettlementSourceDocumentRef call sites, found ${writeCallCount}`);
  }

  // Each call site must sit AFTER its own trip_closed_at UPDATE, guarded by a read that never
  // overwrites an existing number, within the same transaction window.
  const closeUpdateMatches = [...callerSrc.matchAll(/UPDATE driver_finance\.driver_settlements\s*\n\s*SET trip_closed_at = /g)];
  if (closeUpdateMatches.length < 2) {
    failures.push(`${CALLER_FILE}: expected 2 trip_closed_at UPDATE call sites, found ${closeUpdateMatches.length}`);
  } else {
    for (const m of closeUpdateMatches) {
      const afterUpdateWindow = callerSrc.slice(m.index, m.index + 1600);
      if (!/SELECT source_document_ref FROM driver_finance\.driver_settlements/.test(afterUpdateWindow)) {
        failures.push(`${CALLER_FILE}: trip_closed_at UPDATE at offset ${m.index} has no overwrite-guard read before allocating`);
      }
      if (!/await allocateNextSettlementSourceDocumentRef\(/.test(afterUpdateWindow) || !/await setSettlementSourceDocumentRef\(/.test(afterUpdateWindow)) {
        failures.push(
          `${CALLER_FILE}: trip_closed_at UPDATE at offset ${m.index} has no allocate+write call within the same transaction window`
        );
      }
    }
  }

  return failures;
}

/** No file other than the one canonical service may compute MAX(source_document_ref). */
function findRogueMaxReads(root) {
  const rogue = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === "__tests__") continue;
        walk(full);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts")) continue;
      const rel = path.relative(process.cwd(), full).split(path.sep).join("/");
      if (rel === CANONICAL_FILE) continue;
      const src = readFileSync(full, "utf8");
      if (ROGUE_MAX_RE.test(src)) {
        rogue.push(rel);
      }
    }
  };
  walk(root);
  return rogue;
}

function run() {
  const canonicalSrc = readFileSync(CANONICAL_FILE, "utf8");
  const callerSrc = readFileSync(CALLER_FILE, "utf8");
  const failures = analyze(canonicalSrc, callerSrc);
  const rogue = findRogueMaxReads(BACKEND_SRC);
  for (const f of rogue) {
    failures.push(`${f}: computes MAX(source_document_ref...) outside ${CANONICAL_FILE} -- a second, independently-locked allocation path can race the real one`);
  }
  return failures;
}

function selftest() {
  const canonicalSrc = readFileSync(CANONICAL_FILE, "utf8");
  const callerSrc = readFileSync(CALLER_FILE, "utf8");

  const good = analyze(canonicalSrc, callerSrc);
  if (good.length > 0) {
    console.error(`${LABEL} --selftest: FAIL on the real (good) files`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const rogueGood = findRogueMaxReads(BACKEND_SRC);
  if (rogueGood.length > 0) {
    console.error(`${LABEL} --selftest: FAIL -- rogue MAX(source_document_ref) scanner flags real files: ${rogueGood.join(", ")}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "import removed",
      apply: (a, c) =>
        [a, c.replace(/import \{\s*\n?\s*allocateNextSettlementSourceDocumentRef,\s*\n?\s*setSettlementSourceDocumentRef,?\s*\n?\s*\} from "\.\/settlement-source-document-ref\.service\.js";\n/, "")],
    },
    {
      name: "one call site's allocate+write deleted",
      apply: (a, c) => [
        a,
        c.replace(
          /  if \(!\(await client\.query<\{ source_document_ref: string \| null \}>\(\n\s*`SELECT source_document_ref FROM driver_finance\.driver_settlements WHERE id = \$1`,\n\s*\[settlementId\]\n\s*\)\)\.rows\[0\]\?\.source_document_ref\) \{[\s\S]*?\n  \}\n/,
          "\n"
        ),
      ],
    },
    {
      name: "canonical allocator's advisory lock removed",
      apply: (a, c) => [a.replace(/await client\.query\(`SELECT pg_advisory_xact_lock[^;]+;\n/, ""), c],
    },
    {
      name: "canonical writer's audit call removed",
      apply: (a, c) => [a.replace(/await appendCrudAudit\(/, "// appendCrudAudit("), c],
    },
    {
      name: "a rogue duplicate MAX(source_document_ref) reader planted elsewhere",
      apply: (a, c) => [a, c + '\n// planted: const rogue = "SELECT MAX((source_document_ref)::int) FROM driver_finance.driver_settlements";\n'],
      // this mutation targets the CALLER file itself as the "rogue" location for the selftest,
      // since findRogueMaxReads scans the real filesystem, not the in-memory mutated string --
      // verified separately below instead of via analyze().
    },
  ];

  let allCaught = true;
  for (const mut of mutations.slice(0, 4)) {
    const [mutatedCanonical, mutatedCaller] = mut.apply(canonicalSrc, callerSrc);
    if (mutatedCanonical === canonicalSrc && mutatedCaller === callerSrc) {
      console.error(`${LABEL} --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutatedCanonical, mutatedCaller);
    if (failures.length === 0) {
      console.error(`${LABEL} --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  // Rogue-scanner regex selftest (in-memory, mirrors the real scanner's regex against both shapes).
  const oldShapeCaught = ROGUE_MAX_RE.test("SELECT MAX(source_document_ref::int) FROM x");
  const newShapeCaught = ROGUE_MAX_RE.test("SELECT (GREATEST($2::int, COALESCE(MAX((source_document_ref)::int), 0)) + 1)::text AS next");
  if (!oldShapeCaught || !newShapeCaught) {
    console.error(`${LABEL} --selftest: NOT CAUGHT -- rogue-MAX regex misses a real shape (old=${oldShapeCaught}, new=${newShapeCaught})`);
    allCaught = false;
  } else {
    console.log("  caught: rogue-MAX regex matches both MAX(source_document_ref...) and MAX((source_document_ref)::int) shapes");
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: 5/5 planted regressions caught.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length > 0) {
    console.error(`${LABEL}: FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK -- both trip-close call sites reuse the ONE canonical allocator+writer, guarded against overwrite, no rogue MAX(source_document_ref) reads elsewhere`);
}
