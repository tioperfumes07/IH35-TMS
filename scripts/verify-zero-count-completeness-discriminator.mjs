#!/usr/bin/env node
/**
 * GUARD — TOOL-F05: a "0" is only a verdict when the COMPLETENESS DISCRIMINATOR is the stated method.
 *
 * THE METHOD DEFECT (2026-08-03): findings on this system were published using
 * `SET app.bypass_rls='lucia'` plus a positive control on a DIFFERENT table (`mdata.vendors`). That
 * cannot prove absence. The bypass is INERT on AND-gated policies — a `company_scope` USING clause with
 * no `is_lucia_bypass()` branch returns 0 regardless of contents, silently — so proving the bypass
 * worked on `mdata.vendors` proves nothing about the table actually being read. Five `catalogs.*`
 * policies are known to have exactly that shape, and the catalogs they guard were reported "empty"
 * while genuinely holding 9, 9, 3, 21 and 18 rows.
 *
 * A wrong "0" is the most expensive error class here: it manufactures a defect that does not exist
 * (wasting a build), or it certifies an absence that is really a masked read (hiding one). Both were
 * observed.
 *
 * WHAT THIS ENFORCES — a documentation ratchet, deliberately narrow and honest about its limits. It
 * cannot inspect how a human ran a query. What it CAN do is keep the CORRECT method installed as the
 * written standard, so the unsound one cannot quietly return:
 *   1. Rule 10 must state the four discriminator conditions.
 *   2. The audit file must not re-install "bypass + positive control on another table" as its method.
 *
 * That is the whole claim. It is not proof that any given count was read correctly.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:zero-count-completeness-discriminator";
const RULE = ".cursor/rules/10-verification-and-neon-rls.mdc";
const AUDIT = "docs/audit/AUDIT-COVERAGE-LIVE.md";

/** The four conditions that make a 0 a verdict. Each must be present in the rule. */
const REQUIRED_IN_RULE = [
  { key: "n_live_tup equality", re: /visible\s*==\s*n_live_tup/i },
  { key: "n_tup_del / n_tup_ins discrimination", re: /n_tup_del/i },
  { key: "current_user asserted in the same statement", re: /current_user[\s\S]{0,120}same statement/i },
  // Tolerate markdown emphasis anywhere between the words — the first version required the ** to sit
  // in one exact position and failed its own fixture while passing the real file.
  { key: "positive control on the SAME table", re: /positive control[\s\S]{0,120}?same[\s\S]{0,12}?table/i },
  { key: "the bypass is inert on AND-gated policies", re: /INERT on AND-gated/i },
];

/** The unsound method must not be the audit file's STATED standard. */
const WEAK_METHOD_AS_STANDARD =
  /Every count below was read[\s\S]{0,200}?bypass_rls='lucia'[\s\S]{0,200}?positive control/i;

export function analyse(files) {
  const problems = [];

  const rule = files[RULE];
  if (rule == null) {
    problems.push(`${RULE} is missing — the canonical 0-count method has no home.`);
  } else {
    for (const { key, re } of REQUIRED_IN_RULE) {
      if (!re.test(rule)) {
        problems.push(
          `${RULE}: the completeness discriminator no longer states "${key}". A 0 read without it is ` +
            `not evidence of absence — the bypass is inert on AND-gated policies and returns 0 silently.`
        );
      }
    }
  }

  const audit = files[AUDIT];
  if (audit == null) {
    problems.push(`${AUDIT} is missing.`);
  } else if (WEAK_METHOD_AS_STANDARD.test(audit)) {
    problems.push(
      `${AUDIT}: re-installs "bypass + positive control" as the read standard. That method cannot prove ` +
        `absence (inert on AND-gated policies). State the completeness discriminator on the SAME table.`
    );
  }

  return problems;
}

function readAll() {
  const out = {};
  for (const f of [RULE, AUDIT]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (label, cond) => { if (!cond) failures.push(label); };

  const goodRule =
    "visible == n_live_tup ... n_tup_del = 0 ... current_user is asserted in the same statement ... " +
    "the positive control is on the **SAME** table ... INERT on AND-gated policies";
  const goodAudit = "a 0 is a verdict ONLY when the completeness discriminator holds on the SAME table.";
  // THE REAL PRE-FIX WORDING.
  const weakAudit =
    "Every count below was read on Neon prod branch X with `app.bypass_rls='lucia'` and a positive control " +
    "(`mdata.vendors = 2,827`) proving the zeros are real.";

  t("correct rule + correct audit passes", analyse({ [RULE]: goodRule, [AUDIT]: goodAudit }).length === 0);
  t("the real pre-fix audit wording FAILS", analyse({ [RULE]: goodRule, [AUDIT]: weakAudit }).length === 1);
  t("dropping n_live_tup from the rule FAILS",
    analyse({ [RULE]: goodRule.replace("visible == n_live_tup", ""), [AUDIT]: goodAudit }).length === 1);
  t("dropping the current_user clause FAILS",
    analyse({ [RULE]: goodRule.replace("current_user is asserted in the same statement", ""), [AUDIT]: goodAudit }).length === 1);
  t("dropping the SAME-table control FAILS",
    analyse({ [RULE]: goodRule.replace("the positive control is on the **SAME** table", ""), [AUDIT]: goodAudit }).length === 1);
  t("dropping the inert-bypass warning FAILS",
    analyse({ [RULE]: goodRule.replace("INERT on AND-gated policies", ""), [AUDIT]: goodAudit }).length === 1);
  t("a missing rule file FAILS", analyse({ [RULE]: null, [AUDIT]: goodAudit }).length >= 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (1 pass-shape, 6 fail-shapes incl. the real pre-fix audit wording)`);
  process.exit(0);
}

const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the completeness discriminator is the stated 0-count standard`);
