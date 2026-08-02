#!/usr/bin/env node
/**
 * GUARD — C1: the Work Order pre-save cost-line rule must count the lines that are SUBMITTED.
 *
 * THE DEFECT (live, USMCA 2026-08-02): a $1.00 Section-A category line produced Subtotal A $1.00 and a
 * correct WO Total of $1.08, yet the pre-save check "At least one cost line item" stayed RED and the
 * POST never fired — so the Repair WO could not be created even after the vendor fix (#4048).
 *
 * CAUSE: the rule watched the form field `line_items`, which is initialised to [] and populated ONLY
 * in EDIT mode. The Section A/B editor writes to a SEPARATE `lines` state
 * (<TwoSectionLineEditor onChange={setLines} />). In CREATE mode line_items is therefore always empty
 * and the rule is always red, no matter what the operator enters.
 *
 * This is the same class as ACCT-F93, where the vendor-bill validator tested `account_id` — a field
 * the payload builder never assigned. A validator that reads different state than the submit path is
 * not a validator; it is a coin flip that happens to always land the same way.
 *
 * WHAT IT ENFORCES: the cost-line rule references the derived submit arrays (sectionALines /
 * sectionBLines) and does NOT watch `line_items`.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:wo-cost-line-validator";
const MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const RULE = "At least one cost line item";

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(files) {
  const problems = [];
  const raw = files[MODAL];
  if (raw == null) return [`${MODAL} is missing — cannot verify the cost-line rule.`];
  const src = stripComments(raw);

  const idx = src.indexOf(RULE);
  if (idx === -1) {
    problems.push(
      `${MODAL}: the "${RULE}" rule is gone. It is the gate that stops an empty work order from being ` +
        `submitted — removing it is not a fix for it being wrong.`
    );
    return problems;
  }
  // The rule object: from the label to the end of its `ok:` expression.
  const window = src.slice(idx, idx + 400);

  if (/line_items/.test(window)) {
    problems.push(
      `${MODAL}: the "${RULE}" rule still reads \`line_items\`. That form field is populated only in ` +
        `EDIT mode; the Section A/B editor writes to the separate \`lines\` state, so in CREATE mode ` +
        `the rule is permanently red and the POST can never fire.`
    );
  }
  if (!/sectionALines/.test(window) || !/sectionBLines/.test(window)) {
    problems.push(
      `${MODAL}: the "${RULE}" rule does not count sectionALines + sectionBLines — the exact arrays ` +
        `sent in the create payload. The validator and the request must agree on what a cost line is.`
    );
  }
  return problems;
}

function readAll() {
  return { [MODAL]: existsSync(MODAL) ? readFileSync(MODAL, "utf8") : null };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const good = `{ label: "${RULE}", ok: sectionALines.length + sectionBLines.length > 0 },`;
  const bug = `{ label: "${RULE}", ok: (form.watch("line_items") ?? []).length > 0 },`;

  t("counting the submitted arrays passes", analyse({ [MODAL]: good }).length === 0);
  t("the REAL pre-fix line_items rule FAILS", analyse({ [MODAL]: bug }).length === 2);
  t("deleting the rule entirely FAILS", analyse({ [MODAL]: "no such rule here" }).length === 1);
  t("a comment mentioning line_items does not trip it",
    analyse({ [MODAL]: `// used to watch line_items\n${good}` }).length === 0);
  t("missing file FAILS", analyse({ [MODAL]: null }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 5 cases (2 pass-shapes incl. comment-immunity, 3 fail-shapes)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the cost-line rule counts the lines actually submitted`);
