#!/usr/bin/env node
/**
 * ACCT-F5980 — voiding a factoring advance (route only allows it from status IN
 * ('submitted','advanced'), i.e. before any reserve-release/customer-payment/recourse JE could exist)
 * used to flip accounting.factoring_advances.status='voided' and never touch the posted funding
 * liability JE. The source record read "voided" while the GL still carried a live, un-reversed
 * liability forever — a real financial-correctness gap, not a documentation one.
 *
 * Fix reuses the SHARED reverse-not-flip machinery (reverseJournalEntryNoFlip, the same helper the
 * standalone JE-void action already uses — Option 1 / NetSuite-QBO model: post an equal/opposite
 * reversing JE, bidirectional header linkage, original NEVER flipped/deleted). No new GL math.
 *
 * This guard asserts:
 * 1. poster.service.ts exports reverseFactoringAdvanceEvent, and it calls reverseJournalEntryNoFlip
 *    (reuses the shared poster) after looking the funding JE up via findLifecyclePostingKeyJe with the
 *    exact (source_transaction_type: "factoring_advance", event_key: "funding") key the funding poster
 *    itself claims — not a fresh/guessed lookup.
 * 2. factoring-advances.routes.ts's void handler actually calls reverseFactoringAdvanceEvent, and does
 *    so BEFORE its own `UPDATE accounting.factoring_advances SET status = 'voided'` (same lock-order
 *    discipline ACCT-F5651 already established for the advance-posting call — the reversal opens its
 *    own connection and must finish before this connection's own status UPDATE takes the row lock).
 */
import fs from "node:fs";

const LABEL = "verify-factoring-void-reverses-funding-je";
const F = {
  poster: "apps/backend/src/accounting/factoring-posting/poster.service.ts",
  routes: "apps/backend/src/accounting/factoring-advances.routes.ts",
};
const checks = [
  ["poster", /export async function reverseFactoringAdvanceEvent/, "poster.service.ts exports reverseFactoringAdvanceEvent"],
  [
    "poster",
    /findLifecyclePostingKeyJe\(client, \{[\s\S]{0,200}source_transaction_type: "factoring_advance",[\s\S]{0,60}event_key: "funding"/,
    "looks up the funding JE via the same lifecycle posting key the funding poster itself claims",
  ],
  [
    "poster",
    /await reverseJournalEntryNoFlip\(client, \{[\s\S]{0,200}journalEntryId,/,
    "reverses the found JE via the SHARED reverseJournalEntryNoFlip helper (reuse, not new GL math)",
  ],
  ["routes", /reverseFactoringAdvanceEvent,?\s*\n?\s*} from "\.\/factoring-posting\/poster\.service\.js"/, "routes.ts imports reverseFactoringAdvanceEvent"],
  [
    "routes",
    /const reversal = await reverseFactoringAdvanceEvent\(\{[\s\S]{0,400}\}\);\s*\n\s*\n?\s*await client\.query\(`UPDATE accounting\.factoring_advances SET status = 'voided'/,
    "void handler calls the reversal BEFORE its own status UPDATE (lock-order safe, same pattern as ACCT-F5651)",
  ],
];
const live = Object.fromEntries(Object.entries(F).map(([k, file]) => [k, fs.readFileSync(file, "utf8")]));
const audit = (src) => checks.filter(([k, re]) => !re.test(src[k])).map(([, , msg]) => msg);
const failures = audit(live);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
if (process.argv.includes("--selftest")) {
  for (const [k, re, msg] of checks) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const planted = live[k].replace(new RegExp(re.source, flags), "/* planted ACCT-F5980 defect */");
    if (planted === live[k] || !audit({ ...live, [k]: planted }).includes(msg)) {
      console.error(`${LABEL} SELFTEST FAIL — plant escaped: ${msg}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} regressions rejected`);
  process.exit(0);
}
console.log(`${LABEL} PASS — factoring advance void reverses (never silently drops) its posted funding liability JE`);
