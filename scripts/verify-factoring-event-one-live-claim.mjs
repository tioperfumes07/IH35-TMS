#!/usr/bin/env node
// verify-factoring-event-one-live-claim.mjs — R-159.2 (Claude-Lead ruling, 2026-09-25 06:20 PM CT/23:20Z).
//
// accounting.factoring_lifecycle_posting_keys used to make a claim permanent: once (advance, type,
// event_key) was claimed, no caller could ever claim it again, even after the claimed JE was
// reversed (reverse-not-flip never releases the claim). That made a corrected re-post of the SAME
// event impossible for any caller, on any credential — an engine defect, confirmed live (AUTH-035,
// FAC-2026-00001): reverse succeeded, re-post refused with gate=already_posted, atomically rolled
// back.
//
// Fixed at the root: claimFactoringLifecyclePostingKey (lifecycle-repair.ts) now allows a NEW claim
// under a revision key ("<event_key>#rev<n>") when the prior claim's JE has been reversed, recording
// reversal_of = the prior claim's own id. The original claim is never edited or deleted.
//
// This guard is the live proof that the revision mechanism stays correct going forward:
//   1. At most ONE live (unreversed) claim exists per (advance, source_transaction_type, base event) —
//      "base event" = the event_key with any trailing "#revN" stripped. A base event with two or
//      more live claims is a double-post, not a revision.
//   2. Every revision claim (event_key matching "<base>#revN") names its reversal_of (the prior
//      claim it supersedes) — a revision with no reversal_of is not traceable back to why it was
//      allowed to exist.
//   3. Every reversal_of actually points to a REVERSED claim — a revision's own justification (the
//      thing it superseded) must genuinely be dead, not live.
//
// `node scripts/verify-factoring-event-one-live-claim.mjs --selftest` runs the pure grouping logic
// against a planted-red fixture (a genuine double-live-claim) and a clean fixture (one original +
// one correct revision).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-factoring-event-one-live-claim";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

const SQL = `
  SELECT
    k.id::text,
    k.factoring_advance_id::text,
    k.source_transaction_type,
    k.event_key,
    k.reversal_of::text,
    (je.reversed_by_je_id IS NOT NULL) AS reversed
  FROM accounting.factoring_lifecycle_posting_keys k
  JOIN accounting.journal_entries je ON je.id = k.journal_entry_id
  WHERE k.operating_company_id = $1::uuid`;

/** Strip a trailing "#revN" suffix to recover the base event this claim belongs to. */
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
export function baseEventKey(eventKey) {
  return eventKey.replace(/#rev\d+$/, "");
}

/**
 * Pure — no DB. Returns an array of violation strings (empty = clean). Exported for --selftest.
 * @param {Array<{id: string, factoring_advance_id: string, source_transaction_type: string, event_key: string, reversal_of: string|null, reversed: boolean}>} rows
 */
export function findClaimViolations(rows) {
  const violations = [];
  const byId = new Map(rows.map((r) => [r.id, r]));

  // 1. At most one live claim per (advance, type, base event).
  const groups = new Map();
  for (const r of rows) {
    const key = JSON.stringify([r.factoring_advance_id, r.source_transaction_type, baseEventKey(r.event_key)]); // R-193: was NUL-separated
    const bucket = groups.get(key) ?? [];
    bucket.push(r);
    groups.set(key, bucket);
  }
  for (const [key, bucket] of groups.entries()) {
    const live = bucket.filter((r) => !r.reversed);
    if (live.length > 1) {
      const [advance, type, base] = JSON.parse(key);
      violations.push(
        `${advance} / ${type} / ${base}: ${live.length} LIVE claims (${live.map((r) => r.id).join(", ")}) — expected at most 1`
      );
    }
  }

  // 2 & 3. Every revision claim names a reversal_of that itself points to a reversed claim.
  for (const r of rows) {
    const isRevision = /#rev\d+$/.test(r.event_key);
    if (!isRevision) continue;
    if (!r.reversal_of) {
      violations.push(`${r.id} (${r.event_key}): revision claim with no reversal_of`);
      continue;
    }
    const prior = byId.get(r.reversal_of);
    if (!prior) {
      violations.push(`${r.id} (${r.event_key}): reversal_of ${r.reversal_of} does not resolve to a claim in this result set`);
    } else if (!prior.reversed) {
      violations.push(`${r.id} (${r.event_key}): reversal_of ${r.reversal_of} is NOT reversed — this revision's own justification is live`);
    }
  }

  return violations;
}

function selftest() {
  const clean = [
    { id: "k1", factoring_advance_id: "a1", source_transaction_type: "factoring_advance", event_key: "funding", reversal_of: null, reversed: true },
    { id: "k1r1", factoring_advance_id: "a1", source_transaction_type: "factoring_advance", event_key: "funding#rev1", reversal_of: "k1", reversed: false },
    { id: "k2", factoring_advance_id: "a2", source_transaction_type: "factoring_advance", event_key: "funding", reversal_of: null, reversed: false },
  ];
  const cleanViolations = findClaimViolations(clean);
  if (cleanViolations.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — clean fixture reported ${cleanViolations.length} violation(s), expected 0: ${JSON.stringify(cleanViolations)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest clean fixture — 0 violations (expected 0). PASS`);

  // Planted red 1: two LIVE claims on the same base event (a genuine double-post).
  const plantedDouble = [
    ...clean,
    { id: "k3", factoring_advance_id: "a3", source_transaction_type: "factoring_advance", event_key: "funding", reversal_of: null, reversed: false },
    { id: "k3b", factoring_advance_id: "a3", source_transaction_type: "factoring_advance", event_key: "funding#rev1", reversal_of: "k3", reversed: false },
  ];
  const doubleViolations = findClaimViolations(plantedDouble);
  if (!doubleViolations.some((v) => v.includes("a3") && v.includes("2 LIVE claims"))) {
    console.error(`${LABEL}: SELFTEST FAIL — planted double-live-claim fixture not flagged (got ${JSON.stringify(doubleViolations)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest planted-red (double live claim) — flagged correctly. red→green PASS`);

  // Planted red 2: a revision claim with no reversal_of.
  const plantedNoLink = [
    ...clean,
    { id: "k4", factoring_advance_id: "a4", source_transaction_type: "factoring_advance", event_key: "funding", reversal_of: null, reversed: true },
    { id: "k4r1", factoring_advance_id: "a4", source_transaction_type: "factoring_advance", event_key: "funding#rev1", reversal_of: null, reversed: false },
  ];
  const noLinkViolations = findClaimViolations(plantedNoLink);
  if (!noLinkViolations.some((v) => v.includes("k4r1") && v.includes("no reversal_of"))) {
    console.error(`${LABEL}: SELFTEST FAIL — planted no-reversal_of fixture not flagged (got ${JSON.stringify(noLinkViolations)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest planted-red (revision with no reversal_of) — flagged correctly. red→green PASS`);

  // Planted red 3: a revision claim whose reversal_of points to a still-LIVE prior claim.
  const plantedLiveReversalOf = [
    ...clean,
    { id: "k5", factoring_advance_id: "a5", source_transaction_type: "factoring_advance", event_key: "funding", reversal_of: null, reversed: false },
    { id: "k5r1", factoring_advance_id: "a5", source_transaction_type: "factoring_advance", event_key: "funding#rev1", reversal_of: "k5", reversed: false },
  ];
  const liveReversalOfViolations = findClaimViolations(plantedLiveReversalOf);
  const flaggedNotReversed = liveReversalOfViolations.some((v) => v.includes("k5r1") && v.includes("NOT reversed"));
  const flaggedTwoLive = liveReversalOfViolations.some((v) => v.includes("a5") && v.includes("2 LIVE claims"));
  if (!flaggedNotReversed && !flaggedTwoLive) {
    console.error(`${LABEL}: SELFTEST FAIL — planted live-reversal_of fixture not flagged (got ${JSON.stringify(liveReversalOfViolations)})`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest planted-red (revision's reversal_of still live) — flagged correctly. red→green PASS`);
}

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const rows = (await client.query(SQL, [USMCA_COMPANY_ID])).rows;
    await client.query("COMMIT");

    const violations = findClaimViolations(rows);
    if (violations.length === 0) {
      console.log(`${LABEL}: LIVE PASS — ${rows.length} live USMCA factoring lifecycle posting-key claim(s) checked, 0 violations.`);
      return;
    }

    console.error(`${LABEL}: ${violations.length} violation(s):`);
    for (const v of violations.slice(0, 40)) {
      console.error(`  ✗ ${v}`);
    }
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  await live();
}
