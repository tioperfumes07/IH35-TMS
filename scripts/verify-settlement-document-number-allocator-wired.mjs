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
 * "duplicate-allocator" correction).
 *
 * CORRECTED AGAIN, ROUND 215.2 (2026-09-28): the "CLOSE path must call the allocator" assertion
 * below was itself superseded by a LATER, explicit owner ruling — R-186.1 (2026-09-25): "NEVER
 * auto-mint AlwaysTrack sequence into source_document_ref [at close]. display_id is our P-series
 * (open) / editable field. An AlwaysTrack number is written only when the owner types it on the
 * Creator or Pre-Settlement header." The owner named the exact defect this auto-mint caused —
 * "minted fake 5817/5818/5819" — and settlements-load-bookended.service.ts's own code was
 * correctly updated to retire both allocator calls at its two trip_closed_at UPDATE sites,
 * leaving only documenting comments behind. Confirmed still true today: `docs/MEMORY_BANK.md`
 * — "R-186.1 (no AT mint on Book Load open) unchanged — Creator Post is the authorized mint."
 *
 * This guard's job is narrower than its original title suggests, and INVERTED from its original
 * close-path assertion: (1) the canonical allocator+writer in settlement-source-document-ref.
 * service.ts must still exist, still advisory-lock, still audit — Creator Post and Edit Post
 * still call it there, just not from this file; (2) settlements-load-bookended.service.ts's own
 * trip-close paths must NEVER call the allocator (the R-186.1 ban must not silently regress back
 * in); (3) no OTHER file in apps/backend computes MAX(source_document_ref) outside the one
 * canonical service — the real, still-live risk this guard exists to catch (a second,
 * independently-locked allocation path racing the real one).
 *
 * Also fixes this guard's OWN prior blind spot: the "no rogue MAX(source_document_ref) reads"
 * scanner used a regex requiring the literal text `MAX(source_document_ref` — the pre-existing
 * service's own code reads `MAX((source_document_ref)::int)` (an extra wrapping paren), which
 * silently escaped detection. The scanner below tolerates that shape.
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

  // R-186.1 (owner, 2026-09-25): the trip-close path in this file must NEVER auto-mint a
  // source_document_ref. It minted fake AlwaysTrack numbers (5817/5818/5819) when it did. Assert
  // the ban holds -- no actual call to either allocator function anywhere in this file (comments
  // documenting the retirement are fine and expected; only a real `await ...(` call is a failure).
  const rogueAllocateCall = /await\s+allocateNextSettlementSourceDocumentRef\(/.test(callerSrc);
  const rogueSetCall = /await\s+setSettlementSourceDocumentRef\(/.test(callerSrc);
  if (rogueAllocateCall || rogueSetCall) {
    failures.push(
      `${CALLER_FILE}: calls the canonical allocator/writer from the trip-close path — R-186.1 (owner, 2026-09-25) permanently bans auto-minting source_document_ref at close; only Creator Post / Pre-Settlement header edits (the owner typing a real AlwaysTrack number) may call it`
    );
  }
  if (!/R-186\.1/.test(callerSrc)) {
    failures.push(`${CALLER_FILE}: the R-186.1 documenting comment is gone — a future edit could reintroduce the auto-mint with no record of why it's forbidden`);
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
      name: "canonical allocator's advisory lock removed",
      apply: (a, c) => [a.replace(/await client\.query\(`SELECT pg_advisory_xact_lock[^;]+;\n/, ""), c],
    },
    {
      name: "canonical writer's audit call removed",
      apply: (a, c) => [a.replace(/await appendCrudAudit\(/, "// appendCrudAudit("), c],
    },
    {
      name: "R-186.1 ban regressed -- a real allocator call reintroduced into the close path",
      apply: (a, c) => [
        a,
        c.replace(
          "// R-186.1 — never auto-mint AlwaysTrack sequence on close (see closeLoadBookendedSettlementForDriver).",
          '// R-186.1 — never auto-mint AlwaysTrack sequence on close (see closeLoadBookendedSettlementForDriver).\n  const rogueDocRef = await allocateNextSettlementSourceDocumentRef(client, { operatingCompanyId: opts.operatingCompanyId });\n  await setSettlementSourceDocumentRef(client, { settlementId: opts.settlementId, sourceDocumentRef: rogueDocRef, actorUserId: opts.actorUserId });'
        ),
      ],
    },
    {
      name: "R-186.1 documenting comment deleted entirely",
      apply: (a, c) => [
        a,
        c
          .replace("// R-186.1 — never auto-mint AlwaysTrack sequence on close (see closeLoadBookendedSettlementForDriver).\n", "")
          .replace(
            "// R-186.1 (owner 2026-09-25): NEVER auto-mint AlwaysTrack sequence into source_document_ref.\n  // display_id is our P-series (open) / editable field. An AlwaysTrack number is written only when\n  // the owner types it on the Creator or Pre-Settlement header (setSettlementSourceDocumentRef).\n  // Retiring the allocateNextSettlementSourceDocumentRef call that minted fake 5817/5818/5819.\n\n",
            ""
          ),
      ],
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
  console.log(`${LABEL}: OK -- canonical allocator+writer intact and audited; the trip-close path never auto-mints (R-186.1 holds); no rogue MAX(source_document_ref) reads elsewhere`);
}
