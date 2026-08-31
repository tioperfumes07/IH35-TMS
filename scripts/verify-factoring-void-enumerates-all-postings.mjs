#!/usr/bin/env node
/**
 * FAC-VOID-ENUM-2150 — static-shape guard.
 *
 * reverseFactoringAdvanceEventImpl (poster.service.ts) must reverse EVERY still-live linked posting
 * key for an advance (funding, customer-payment installments, interest accruals, recourse returns --
 * whatever exists), not just a single hardcoded "funding" event_key. The pre-fix version looked up
 * only { source_transaction_type: "factoring_advance", event_key: "funding" } via
 * findLifecyclePostingKeyJe (singular) and reversed that one JE alone. Proven live: a
 * factoring_customer_payment JE can post while an advance is still 'submitted'/'advanced' (nothing in
 * this schema forbids it), and the void route still accepts a void from that same status set
 * afterwards -- leaving that payment leg's Dr 2150 (Factoring Advance) permanently un-reversed while
 * the advance itself reads 'voided'. Money that should net to zero on a voided advance's liability
 * account stays open forever.
 *
 * This guard is source-shape only (verify:static has no DB). The live invariant it protects --
 * "a voided advance's linked postings on GL 2150 net to zero" -- was proven and repaired once via
 * scripts/run-fix-fac-void-enum-2150-repair-once.mts (FAC-2026-00001, one-time historical repair);
 * this guard's job is to keep the CODE PATH from regressing back to the single-leg lookup that caused
 * it, for every future void.
 */
import { readFileSync } from "node:fs";

const POSTER_FILE = "apps/backend/src/accounting/factoring-posting/poster.service.ts";
const REPAIR_FILE = "apps/backend/src/accounting/factoring-posting/lifecycle-repair.ts";

function analyze(posterSrc, repairSrc) {
  const failures = [];

  // The plural enumerator must exist in lifecycle-repair.ts and must NOT filter by a single event_key
  // (a re-introduced single-event_key filter would defeat the whole point).
  const finderIdx = repairSrc.indexOf("export async function findAllLifecyclePostingKeyJes");
  if (finderIdx === -1) {
    failures.push(`${REPAIR_FILE}: findAllLifecyclePostingKeyJes is missing`);
  } else {
    const nextExport = repairSrc.indexOf("\nexport ", finderIdx + 1);
    const block = repairSrc.slice(finderIdx, nextExport === -1 ? undefined : nextExport);
    if (/event_key\s*=\s*\$4/.test(block) || /opts\.event_key/.test(block)) {
      failures.push(`${REPAIR_FILE}: findAllLifecyclePostingKeyJes must not filter by a single event_key -- that reintroduces the enumeration gap`);
    }
    if (!/factoring_lifecycle_posting_keys/.test(block)) {
      failures.push(`${REPAIR_FILE}: findAllLifecyclePostingKeyJes must query factoring_lifecycle_posting_keys`);
    }
  }

  // reverseFactoringAdvanceEventImpl must call the PLURAL finder, iterate every leg, and reverse each
  // one -- not the old single hardcoded event_key: "funding" lookup.
  const implIdx = posterSrc.indexOf("async function reverseFactoringAdvanceEventImpl");
  if (implIdx === -1) {
    failures.push(`${POSTER_FILE}: reverseFactoringAdvanceEventImpl is missing`);
  } else {
    const nextFn = posterSrc.indexOf("\nasync function ", implIdx + 1);
    const nextExportFn = posterSrc.indexOf("\nexport async function ", implIdx + 1);
    const boundaries = [nextFn, nextExportFn].filter((n) => n !== -1);
    const end = boundaries.length > 0 ? Math.min(...boundaries) : undefined;
    const block = posterSrc.slice(implIdx, end);

    if (!/findAllLifecyclePostingKeyJes/.test(block)) {
      failures.push(`${POSTER_FILE}: reverseFactoringAdvanceEventImpl must call findAllLifecyclePostingKeyJes (enumerate every linked leg), not a single hardcoded lookup`);
    }
    if (/event_key:\s*"funding"/.test(block)) {
      failures.push(`${POSTER_FILE}: reverseFactoringAdvanceEventImpl must not hardcode event_key: "funding" -- that is exactly the regression this guard exists to catch`);
    }
    if (!/for\s*\(\s*const\s+leg\s+of\s+liveLegs\s*\)/.test(block)) {
      failures.push(`${POSTER_FILE}: reverseFactoringAdvanceEventImpl must loop over every live leg and reverse each one, not reverse a single JE`);
    }
    if (!/reverseJournalEntryNoFlip/.test(block)) {
      failures.push(`${POSTER_FILE}: reverseFactoringAdvanceEventImpl must call reverseJournalEntryNoFlip inside the per-leg loop`);
    }
  }

  return failures;
}

function selftest() {
  const posterSrc = readFileSync(POSTER_FILE, "utf8");
  const repairSrc = readFileSync(REPAIR_FILE, "utf8");

  const clean = analyze(posterSrc, repairSrc);
  if (clean.length > 0) {
    console.error("--selftest FAIL: unmutated source already fails:\n" + clean.join("\n"));
    process.exit(1);
  }

  // Mutation 1: revert to the old single hardcoded funding-only lookup shape.
  const mutated1 = posterSrc.replace(
    /const liveLegs = await findAllLifecyclePostingKeyJes\(client, \{[\s\S]*?\}\);/,
    `const journalEntryId = await findLifecyclePostingKeyJe(client, {\n      operating_company_id: input.operating_company_id,\n      factoring_advance_id: input.factoring_advance_id,\n      source_transaction_type: "factoring_advance",\n      event_key: "funding",\n    });`
  );
  if (mutated1 === posterSrc) {
    console.error("--selftest FAIL: mutation 1 (single hardcoded lookup) did not change the source -- pattern mismatch");
    process.exit(1);
  }
  const afterMutation1 = analyze(mutated1, repairSrc);
  if (afterMutation1.length === 0) {
    console.error("--selftest FAIL: mutation 1 (reverted to single hardcoded funding lookup) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: reintroduce a single-event_key filter into the plural finder.
  const mutated2 = repairSrc.replace(
    /export async function findAllLifecyclePostingKeyJes\(/,
    `export async function findAllLifecyclePostingKeyJes(_unused_marker_for_selftest_only`
  );
  // Simpler, deterministic mutation: inject an event_key filter reference into the finder body.
  const finderIdx = repairSrc.indexOf("export async function findAllLifecyclePostingKeyJes");
  const nextExportIdx = repairSrc.indexOf("\nexport ", finderIdx + 1);
  const before = repairSrc.slice(0, finderIdx);
  const block = repairSrc.slice(finderIdx, nextExportIdx === -1 ? undefined : nextExportIdx);
  const after = nextExportIdx === -1 ? "" : repairSrc.slice(nextExportIdx);
  const mutatedBlock = block.replace(
    "AND je.status = 'posted'",
    "AND je.status = 'posted'\n         AND plk.event_key = $4"
  );
  const mutated2b = before + mutatedBlock + after;
  if (mutated2b === repairSrc) {
    console.error("--selftest FAIL: mutation 2 (single event_key filter) did not change the source -- pattern mismatch");
    process.exit(1);
  }
  const afterMutation2 = analyze(posterSrc, mutated2b);
  if (afterMutation2.length === 0) {
    console.error("--selftest FAIL: mutation 2 (reintroduced single-event_key filter in the plural finder) was NOT caught");
    process.exit(1);
  }

  console.log("--selftest OK: both mutations (single hardcoded lookup; single-event_key filter reintroduced) were caught");
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const posterSrc = readFileSync(POSTER_FILE, "utf8");
const repairSrc = readFileSync(REPAIR_FILE, "utf8");
const failures = analyze(posterSrc, repairSrc);
if (failures.length > 0) {
  console.error("verify-factoring-void-enumerates-all-postings FAILED:\n" + failures.map((f) => `  - ${f}`).join("\n"));
  process.exit(1);
}
console.log("verify-factoring-void-enumerates-all-postings: OK — reverseFactoringAdvanceEventImpl enumerates and reverses every linked lifecycle posting key, not a single hardcoded funding leg");
