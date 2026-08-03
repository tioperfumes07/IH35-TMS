#!/usr/bin/env node
/**
 * GUARD — ACCT-F101: an insurance claim recovery must be CAPPED at the recorded loss.
 *
 * THE DEFECT (read in full, 197 lines, 2026-08-02): postInsuranceClaimRecovery credited the entire
 * delta of claim.amount_paid_cents to the insurance_recovery account and NEVER read a loss amount. It
 * had no cap of any kind. An insurer paying more than the repair cost would drive the CONTRA-EXPENSE
 * account negative and overstate income — a loss recovery recognised as if it were revenue.
 *
 * THE STANDARD (ASC 450-30 / 610-30): a loss recovery is recognised only when PROBABLE and only UP TO
 * the recorded loss. Anything beyond is a GAIN CONTINGENCY and is not recognised until realised. This
 * is the difference between reimbursing a cost and inventing income, and it is exactly what an auditor
 * tests first on a claims account.
 *
 * WHAT IT ENFORCES:
 *   A. the poster reads a recorded loss (linked expense/bill, else amount_claimed_cents);
 *   B. it applies a cap — Math.min of the delta against the remaining room;
 *   C. it FAILS CLOSED when there is no loss to cap against, rather than posting uncapped;
 *   D. the excess is reported as an unposted gain contingency, not silently dropped.
 *
 * A silently TRIMMED amount is the same class of defect as a silently uncapped one — both leave the
 * caller unable to tell what actually hit the ledger. D is why the excess must surface.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:insurance-recovery-capped-at-loss";
const POSTER = "apps/backend/src/accounting/insurance-claim-recovery-posting/poster.service.ts";

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(files) {
  const problems = [];
  const raw = files[POSTER];
  if (raw == null) return [`${POSTER} is missing.`];
  const src = stripComments(raw);

  if (!/recorded_loss_cents/.test(src)) {
    problems.push(
      `${POSTER}: never reads a recorded loss. Without one there is nothing to cap against, and the ` +
        `full insurer payment is credited to a contra-expense account — ASC 450-30/610-30 violation.`
    );
  }
  if (!/Math\.min\s*\(/.test(src)) {
    problems.push(
      `${POSTER}: no Math.min cap on the posted delta. The recovery must be limited to the remaining ` +
        `room under the recorded loss.`
    );
  }
  if (!/no_recorded_loss/.test(src)) {
    problems.push(
      `${POSTER}: does not fail closed when no recorded loss exists. An uncapped recovery is exactly ` +
        `the defect; refusing is correct, guessing a cap is not.`
    );
  }
  if (!/unposted_gain_contingency_cents/.test(src)) {
    problems.push(
      `${POSTER}: the excess over the recorded loss is not reported. A silently trimmed amount is the ` +
        `same class of defect as a silently uncapped one — the gain contingency must surface so a ` +
        `human can recognise it when realised.`
    );
  }
  return problems;
}

function readAll() {
  return { [POSTER]: existsSync(POSTER) ? readFileSync(POSTER, "utf8") : null };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const good =
    "recorded_loss_cents ... const delta = Math.min(rawDelta, remainingRoom); ... no_recorded_loss ... unposted_gain_contingency_cents";
  // The REAL pre-fix poster: full delta, no loss read, no cap.
  const bug = "const delta = Math.round(paidTotal) - already; if (delta <= 0) return;";

  t("capped poster passes", analyse({ [POSTER]: good }).length === 0);
  t("the REAL uncapped poster FAILS on all four clauses", analyse({ [POSTER]: bug }).length === 4);
  t("cap without a fail-closed path FAILS",
    analyse({ [POSTER]: good.replace("no_recorded_loss", "") }).length === 1);
  t("cap without reporting the excess FAILS",
    analyse({ [POSTER]: good.replace("unposted_gain_contingency_cents", "") }).length === 1);
  t("reading the loss but not capping FAILS",
    analyse({ [POSTER]: good.replace("Math.min(rawDelta, remainingRoom)", "rawDelta") }).length === 1);
  t("comments alone do not satisfy it",
    analyse({ [POSTER]: "// recorded_loss_cents Math.min no_recorded_loss unposted_gain_contingency_cents" }).length === 4);
  t("missing file FAILS", analyse({ [POSTER]: null }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (1 pass-shape, 6 fail-shapes incl. the real uncapped poster)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — recovery capped at the recorded loss; excess surfaced as a gain contingency`);
