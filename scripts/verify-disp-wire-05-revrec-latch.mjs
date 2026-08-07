#!/usr/bin/env node
/**
 * GUARD — verify-disp-wire-05-revrec-latch (CLS-DISP-WIRE-05, Phase 1 hop 6)
 *
 * WHAT THIS PROTECTS
 * Revenue recognition is the single most dangerous thing in this codebase to get subtly wrong: it
 * decides WHEN the company has earned money. The two-event latch (ASC 606, owner-locked 2026-07-19)
 * is:
 *     Event 1 "earn" at delivery          -> DR Unbilled Revenue / CR Line-Haul Income
 *     Event 2 "bill" at POD               -> DR A/R              / CR Unbilled Revenue
 * Two events, never one combined POD+delivered gate, and Event 1 fires ONLY on captured delivery
 * evidence — the final active delivery stop's actual_departure_at — never on a status click.
 *
 * The status-only version is the failure this guards against: three backend paths can set
 * delivered_pending_docs by validating a status graph without ever reading mdata.load_stops, so
 * without the evidence gate a dispatcher's click alone would recognise revenue. That is a
 * misstatement an auditor would find, not a UI bug.
 *
 * The latch is currently INERT on prod — every load_stop has actual_departure_at NULL because the
 * driver capture path (WIRE-07) is not landed. Inert is the CORRECT state: it is refusing to earn
 * without evidence. This guard exists so that when WIRE-07 lands and evidence starts flowing, the
 * gate is still standing.
 *
 * METHOD: comments and string literals are stripped before asserting (these comments name the very
 * symbols under test); --selftest mutates the REAL source and requires every assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-disp-wire-05-revrec-latch";
const POSTER = "apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

/** Comments removed but STRING LITERALS kept — some contracts are expressed as string constants. */
function stripCommentsOnly(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function check(raw) {
  const code = stripCommentsAndStrings(raw);
  // Flag keys and gate names are string literals, so they must be matched on the string-preserving
  // form — stripping strings would make these two assertions unfalsifiable in the wrong direction.
  const withStrings = stripCommentsOnly(raw);
  const errors = [];

  // 1. THE gate: Event 1 must require captured departure evidence.
  if (!/if\s*\(\s*event\s*===\s*''\s*\)/.test(code) && !/event === /.test(code)) {
    errors.push(`${POSTER}: the earn/bill event branch is gone — the two-event latch is not distinguishable`);
  }
  // Assert the CALL, not the identifier: this file also DEFINES finalActiveDeliveryDepartureAt, so a
  // bare identifier match would still pass with the call site ripped out.
  if (!/await\s+finalActiveDeliveryDepartureAt\s*\(/.test(code)) {
    errors.push(
      `${POSTER}: finalActiveDeliveryDepartureAt is not called — Event 1 would earn on a status click ` +
        `alone, with no captured delivery evidence. This is the WIRE-05 regression.`
    );
  }
  if (!/if\s*\(\s*!departedAt\s*\)\s*return/.test(code)) {
    errors.push(
      `${POSTER}: missing departure evidence no longer short-circuits — the gate must REFUSE to post, ` +
        `not fall through and recognise revenue`
    );
  }

  // 2. Two distinct events, never collapsed into one posting shape.
  if (!/buildEarnEvent1Postings\s*\(/.test(code) || !/buildBillEvent2Postings\s*\(/.test(code)) {
    errors.push(
      `${POSTER}: the latch no longer builds BOTH Event 1 and Event 2 postings — a single combined ` +
        `POD+delivered gate is explicitly forbidden by the owner-locked two-event latch`
    );
  }

  // 3. Per-entity flag, never a global enable.
  if (!/REVENUE_RECOGNITION_POST_ENABLED/.test(withStrings)) {
    errors.push(`${POSTER}: the per-entity posting flag constant is gone — the latch cannot be gated per entity`);
  }

  // 4. Event 2 must clear against the SAME earned amount, not re-read the load rate.
  // Same reason as above — earnAmountCents is defined here too, so assert the awaited CALL.
  if (!/await\s+earnAmountCents\s*\(/.test(code)) {
    errors.push(
      `${POSTER}: Event 2 no longer clears the recorded earn amount — billing a different number than ` +
        `was earned would leave Unbilled Revenue permanently out of balance`
    );
  }
  if (!/earn_missing_for_bill/.test(withStrings)) {
    errors.push(`${POSTER}: Event 2 no longer refuses when no earn exists — it would credit an unbilled balance that was never recognised`);
  }

  // 5. Never post a zero or negative amount.
  if (!/amount\s*<=\s*0/.test(code)) {
    errors.push(`${POSTER}: the zero/negative amount refusal is gone`);
  }
  return errors;
}

function selftest() {
  const real = readFileSync(POSTER, "utf8");
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }

  const mutations = [
    ["evidence gate removed", (s) => s.replace(/const departedAt = await finalActiveDeliveryDepartureAt\(/, "const departedAt = await someOtherThing(")],
    ["gate no longer refuses", (s) => s.replace("if (!departedAt) return { gate: \"missing_delivery_evidence\" as const };", "// gate removed")],
    ["events collapsed", (s) => s.replace(/buildBillEvent2Postings\(/g, "buildEarnEvent1Postings(")],
    ["flag gate removed", (s) => s.split("REVENUE_RECOGNITION_POST_ENABLED").join("ALWAYS_ON")],
    ["bill re-reads load rate", (s) => s.replace(/const earnAmt = await earnAmountCents\(/, "const earnAmt = await somethingElse(")],
    ["zero-amount refusal removed", (s) => s.replace("if (amount <= 0)", "if (false)")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (broken === real) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(readFileSync(POSTER, "utf8"));
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s) in the revenue-recognition latch:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — Event 1 earns only on captured delivery evidence, Event 2 clears the recorded earn, ` +
    `both events stay distinct, and the latch is gated per entity.`
);
