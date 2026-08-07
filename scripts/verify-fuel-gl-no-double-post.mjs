#!/usr/bin/env node
/**
 * GUARD — FUEL-GL: the interlocks that make a fuel mis-post impossible must stay wired, and the
 * scope-matched tie-out lesson must stay documented so the refuted CLS-FUEL-DOUBLE-POST premise
 * cannot come back.
 *
 * WHAT THIS FILE USED TO BE, AND WHY THAT WAS WRONG. It had been reduced to a near no-op: it checked
 * that one service file still existed and printed PASS. The history it carried is genuinely valuable
 * and is preserved below, but a guard that cannot fail on the thing it is named for is a fake-green
 * surface — it occupies the slot where a real control belongs and makes the suite look stronger than
 * it is. The owner's instruction was explicit: repurpose it or delete it, do not leave the stub.
 *
 * THE REFUTED PREMISE (keep this — it is the method lesson). CLS-FUEL-DOUBLE-POST alleged $9,216.49 of
 * double-counted fuel across 18 "pairs". GUARD and an independent prod check both refuted it: the
 * overlap charges sit on a DIFFERENT payment instrument (Business Platinum / WF checking) than the
 * fuel-card poster's Relay fleet-card rows. Fuel-card swipes settle via an aggregate provider invoice,
 * not individual bank debits, so those are separate direct purchases. A transaction-level match found
 * ZERO duplicates: 0 of 67 at amount + date +/-3d, and only 1 coincidental $50.00 amount collision
 * under the loosest possible rule (amount only, any date, same entity).
 *   METHOD LESSON: never fuzzy-match amounts across DIFFERENT payment instruments and call the result
 *   a double-post. A duplicate is the same instrument, or a proven settlement link — nothing less.
 *   SCOPE LESSON (scope mismatch): GL fuel is ALL-SOURCES; the Relay subledger is CARD-ONLY. Comparing
 *   the two and calling the difference a double-post is what produced the false $9,216.49 claim. The
 *   honest identity is:  GL fuel == fuel-card spend + direct-card fuel + legitimate non-card fuel.
 *
 * WHAT IT NOW ENFORCES — the interlocks that actually shipped:
 *   A. rule selection RANKS by specificity so a leaf category beats its parent (scoreRuleMatch in
 *      plaid.service.ts, #4232). Without it the broad TRANSPORTATION rule outranked TOLL and 13 Laredo
 *      bridge tolls posted to Fuel Expense.
 *   B. undoing a categorization REVERSES the posted journal entry (banking.routes.ts, #4225) — a
 *      correction may never leave a stale GL line behind.
 *   C. the poster can RE-POST after a reversal (POSTING_ENGINE_SUPPORTS_REPOST + the "repost" purpose,
 *      #4246/#4250). Without it a reversal silently DELETED the expense instead of moving it.
 *   D. this file must remain capable of failing.
 *
 * (A)-(C) are asserted against the implementation that ACTUALLY MERGED. A parallel attempt at this
 * guard asserted `pickBestCategoryRule` in `plaid-category-match.ts` — a file that does not exist on
 * main; it belonged to a PR closed as a duplicate. A guard pointed at unmerged code is red forever and
 * teaches people to ignore guards.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:fuel-gl-no-double-post";

const PLAID = "apps/backend/src/integrations/plaid/plaid.service.ts";
const BANKING = "apps/backend/src/banking/banking.routes.ts";
const ENGINE = "apps/backend/src/accounting/posting-engine.service.ts";
const SELF = "scripts/verify-fuel-gl-no-double-post.mjs";

export function analyse(files) {
  const problems = [];

  const plaid = files[PLAID];
  if (plaid == null) {
    problems.push(`${PLAID} is missing — cannot verify leaf-beats-parent rule selection.`);
  } else {
    if (!/scoreRuleMatch/.test(plaid)) {
      problems.push(
        `${PLAID}: scoreRuleMatch is gone. Rule selection must RANK by specificity; without it the ` +
          `broad TRANSPORTATION rule outranks TOLL and bridge tolls post to Fuel Expense again.`
      );
    }
    if (!/isParentRule/.test(plaid)) {
      problems.push(
        `${PLAID}: the parent-rule discriminator is gone. Substring matching makes a parent pattern ` +
          `also "match" the leaf (TRANSPORTATION_TOLLS contains TRANSPORTATION); without it the parent ` +
          `earns leaf credit and the inversion survives inside the scorer itself.`
      );
    }
  }

  const banking = files[BANKING];
  if (banking == null) {
    problems.push(`${BANKING} is missing — cannot verify the reversal interlock.`);
  } else {
    if (!/reverseJournalEntryNoFlip/.test(banking)) {
      problems.push(
        `${BANKING}: undo-categorization no longer reverses the posted journal entry. A correction ` +
          `would leave the ledger holding the WRONG account with no signal.`
      );
    }
    if (!/POSTING_ENGINE_SUPPORTS_REPOST/.test(banking)) {
      problems.push(
        `${BANKING}: the repost-capability interlock is gone. Reversing without a usable re-post ` +
          `silently DELETES the expense instead of moving it.`
      );
    }
  }

  const engine = files[ENGINE];
  if (engine == null) {
    problems.push(`${ENGINE} is missing — cannot verify the repost capability.`);
  } else if (!/"repost"/.test(engine)) {
    problems.push(
      `${ENGINE}: PostingPurpose no longer carries "repost". The batch idempotency key ends in ` +
        `posting_purpose, so without it a corrected posting collides with the original initial_post ` +
        `batch and is silently returned instead of created.`
    );
  }

  // (D) this guard must not decay back into a stub.
  //
  // Examine only the OPERATIVE section — everything before `function selftest()`. The selftest below
  // deliberately contains the stub's own phrases as fixtures, and an earlier version of this check
  // matched its own test data and failed against the correct file. Third time this session that a
  // guard of mine read non-code as code; the rule is now explicit: assertions look at operative code,
  // never at comments, messages, or fixtures.
  const selfRaw = files[SELF];
  const self = selfRaw == null ? null : selfRaw.split("function selftest()")[0];
  if (self != null) {
    if (/Guard now exits 0/.test(self) || !/problems\.push/.test(self)) {
      problems.push(
        `${SELF} has been reduced to a no-op again. A guard that cannot fail is a fake-green surface.`
      );
    }
    if (!/SCOPE LESSON/.test(self)) {
      problems.push(
        `${SELF}: the scope lesson is gone. GL fuel is all-sources and the Relay subledger is ` +
          `card-only; comparing them and calling the difference a double-post is what produced the ` +
          `refuted $9,216.49 claim. Keep it documented so it cannot be re-reported.`
      );
    }
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [PLAID, BANKING, ENGINE, SELF]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };

  const good = {
    [PLAID]: "export function scoreRuleMatch(){} const isParentRule = true;",
    [BANKING]: "await reverseJournalEntryNoFlip(client,{}); if(!POSTING_ENGINE_SUPPORTS_REPOST){}",
    [ENGINE]: 'export type PostingPurpose = "initial_post" | "reversal" | "repost";',
    [SELF]: 'problems.push("x"); // SCOPE LESSON: all-sources vs card-only',
  };

  t("the merged implementation PASSES", analyse(good).length === 0);
  t("removing scoreRuleMatch AND the discriminator FAILS twice",
    analyse({ ...good, [PLAID]: "export function other(){}" }).length === 2);
  t("removing only the parent discriminator FAILS",
    analyse({ ...good, [PLAID]: "export function scoreRuleMatch(){}" }).length === 1);
  t("removing the reversal FAILS",
    analyse({ ...good, [BANKING]: "if(!POSTING_ENGINE_SUPPORTS_REPOST){}" }).length === 1);
  t("removing the repost interlock FAILS",
    analyse({ ...good, [BANKING]: "await reverseJournalEntryNoFlip(client,{});" }).length === 1);
  t("dropping the repost purpose FAILS",
    analyse({ ...good, [ENGINE]: 'export type PostingPurpose = "initial_post" | "reversal";' }).length === 1);
  t("reverting THIS guard to the exit-0 stub FAILS",
    analyse({ ...good, [SELF]: "// Guard now exits 0. SCOPE LESSON kept" }).length === 1);
  t("losing the scope lesson FAILS", analyse({ ...good, [SELF]: 'problems.push("x");' }).length === 1);
  t("a missing source file FAILS rather than passing vacuously",
    analyse({ ...good, [ENGINE]: null }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 9 cases (1 pass-shape, 8 fail-shapes incl. reverting this guard to the exit-0 stub and losing the scope lesson)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — leaf-beats-parent, undo-reverses, and repost-capable interlocks all wired`);
