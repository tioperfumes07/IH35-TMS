#!/usr/bin/env node
/**
 * P1 SETTLEMENT NUMBERING (Claude Lead, ROUND 18.3, Item A) — static-shape guard.
 *
 * The AlwaysTrack document number (driver_finance.driver_settlements.source_document_ref) must be
 * allocated by allocateSettlementDocumentNumberIfMissing (settlement-document-number-allocator.ts,
 * under a per-company pg_advisory_xact_lock) INSIDE the same transaction that stamps trip_closed_at
 * — not as a best-effort call after the transaction closes, and not via a bare unlocked
 * MAX(source_document_ref)+1 read anywhere else in the codebase (a bare read-then-write races
 * exactly the way G9-H2's own settlement-open dedup once did, and would silently reopen the class
 * of duplicate-number bug that produced the live S-2026-0011 / S-2026-5782 collision this migration
 * exists to close off — see OUTBOX-CC-3.md).
 *
 * This guard is source-shape only (no DB) — it asserts both trip-close call sites in
 * settlements-load-bookended.service.ts import and call the allocator immediately after their own
 * trip_closed_at UPDATE, and that no OTHER file in apps/backend computes
 * MAX(source_document_ref::int) outside the allocator module itself.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-settlement-document-number-allocator-wired";
const ALLOCATOR_FILE = "apps/backend/src/driver-finance/settlement-document-number-allocator.ts";
const CALLER_FILE = "apps/backend/src/driver-finance/settlements-load-bookended.service.ts";
const BACKEND_SRC = "apps/backend/src";

function analyze(allocatorSrc, callerSrc) {
  const failures = [];

  if (!/await client\.query\("SELECT pg_advisory_xact_lock\(hashtext\(\$1::text\)\)"/.test(allocatorSrc)) {
    failures.push(`${ALLOCATOR_FILE}: advisory lock call is missing or reshaped`);
  }
  if (!/SELECT COALESCE\(MAX\(source_document_ref::int\), 0\) \+ 1 AS next/.test(allocatorSrc)) {
    failures.push(`${ALLOCATOR_FILE}: MAX(source_document_ref::int) + 1 read is missing or reshaped`);
  }
  if (!/if \(rows\[0\]\?\.source_document_ref\) return null;/.test(allocatorSrc)) {
    failures.push(`${ALLOCATOR_FILE}: allocateSettlementDocumentNumberIfMissing no longer guards against overwriting an existing number`);
  }

  if (!/import \{ allocateSettlementDocumentNumberIfMissing \} from ".\/settlement-document-number-allocator.js";/.test(callerSrc)) {
    failures.push(`${CALLER_FILE}: missing the allocator import`);
  }
  const callCount = (callerSrc.match(/await allocateSettlementDocumentNumberIfMissing\(/g) || []).length;
  if (callCount < 2) {
    failures.push(`${CALLER_FILE}: expected 2 allocator call sites (closeLoadBookendedSettlementForDriver + stampTripClosedForBookendedSettlement), found ${callCount}`);
  }

  // Each call site must sit AFTER its own trip_closed_at UPDATE and BEFORE the next line that
  // appends settlement lines/earnings — i.e. inside the same function, immediately following the
  // close stamp, not detached into a separate later call.
  const closeUpdateMatches = [...callerSrc.matchAll(/UPDATE driver_finance\.driver_settlements\s*\n\s*SET trip_closed_at = /g)];
  if (closeUpdateMatches.length < 2) {
    failures.push(`${CALLER_FILE}: expected 2 trip_closed_at UPDATE call sites, found ${closeUpdateMatches.length}`);
  } else {
    for (const m of closeUpdateMatches) {
      const afterUpdateWindow = callerSrc.slice(m.index, m.index + 1400);
      if (!/await allocateSettlementDocumentNumberIfMissing\(/.test(afterUpdateWindow)) {
        failures.push(
          `${CALLER_FILE}: trip_closed_at UPDATE at offset ${m.index} has no allocateSettlementDocumentNumberIfMissing call within the same transaction window`
        );
      }
    }
  }

  return failures;
}

/** No OTHER backend file may compute a bare MAX(source_document_ref) read outside the allocator. */
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
      if (rel === ALLOCATOR_FILE) continue;
      const src = readFileSync(full, "utf8");
      if (/MAX\(source_document_ref/i.test(src)) {
        rogue.push(rel);
      }
    }
  };
  walk(root);
  return rogue;
}

function run() {
  const allocatorSrc = readFileSync(ALLOCATOR_FILE, "utf8");
  const callerSrc = readFileSync(CALLER_FILE, "utf8");
  const failures = analyze(allocatorSrc, callerSrc);
  const rogue = findRogueMaxReads(BACKEND_SRC);
  for (const f of rogue) {
    failures.push(`${f}: computes MAX(source_document_ref...) outside the allocator module -- a second, unlocked allocation path can race the real one`);
  }
  return failures;
}

function selftest() {
  const allocatorSrc = readFileSync(ALLOCATOR_FILE, "utf8");
  const callerSrc = readFileSync(CALLER_FILE, "utf8");

  const good = analyze(allocatorSrc, callerSrc);
  if (good.length > 0) {
    console.error(`${LABEL} --selftest: FAIL on the real (good) files`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const mutations = [
    {
      name: "advisory lock removed",
      apply: (a, c) => [a.replace(/await client\.query\("SELECT pg_advisory_xact_lock[^;]+;\n/, ""), c],
    },
    {
      name: "overwrite-guard removed (would clobber a hand-entered number)",
      apply: (a, c) => [a.replace("if (rows[0]?.source_document_ref) return null;\n  ", ""), c],
    },
    {
      name: "one call site's allocator call deleted",
      apply: (a, c) => [
        a,
        c.replace(
          /  \/\/ P1 SETTLEMENT NUMBERING \(Claude Lead, ROUND 18\.3, Item A\) — the AlwaysTrack document\n  \/\/ number is allocated HERE.*?\n  await allocateSettlementDocumentNumberIfMissing\(client, settlementId, opts\.operatingCompanyId\);\n\n/s,
          ""
        ),
      ],
    },
    {
      name: "import removed",
      apply: (a, c) => [a, c.replace('import { allocateSettlementDocumentNumberIfMissing } from "./settlement-document-number-allocator.js";\n', "")],
    },
  ];

  let allCaught = true;
  for (const mut of mutations) {
    const [mutatedAllocator, mutatedCaller] = mut.apply(allocatorSrc, callerSrc);
    if (mutatedAllocator === allocatorSrc && mutatedCaller === callerSrc) {
      console.error(`${LABEL} --selftest: mutation had no effect -- ${mut.name}`);
      allCaught = false;
      continue;
    }
    const failures = analyze(mutatedAllocator, mutatedCaller);
    if (failures.length === 0) {
      console.error(`${LABEL} --selftest: NOT CAUGHT -- ${mut.name}`);
      allCaught = false;
    } else {
      console.log(`  caught: ${mut.name}`);
    }
  }

  if (!allCaught) process.exit(1);
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught.`);
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
  console.log(`${LABEL}: OK -- allocator wired into both trip-close call sites, no rogue MAX(source_document_ref) reads elsewhere`);
}
