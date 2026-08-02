#!/usr/bin/env node
/**
 * GUARD — ACCT-F93 vendor-bill Section-A category validation.
 *
 * THE DEFECT (live, 2026-08-02, /accounting/bills/vendor): picking an expense category showed the
 * value in the field, but saving always failed with "Each Category (Section A) line needs an expense
 * category" — so NO vendor bill with a category line could be saved at all, blocking A/P bills.
 *
 * It was reported as "the combobox does not commit". It does: CostBreakdownBox binds the choice to
 * `expense_category_uuid`, which is why the IDENTICAL picker works on a Work Order. The real cause was
 * a field mismatch — VendorBillForm validated `!line.account_id`, while
 * buildVendorBillLinePayloads DECLARES account_id on the payload type and ASSIGNS IT NOWHERE. The
 * predicate was therefore unconditionally true for every Section-A line.
 *
 * WHY expense_category_uuid IS THE CORRECT FIELD: in bill mode the options come from the
 * catalogs.expense_categories CATALOG, so the selected id is a category uuid, not a GL account id.
 * The poster resolves the account through expense_category_account_map. vendorBillLines.ts states the
 * rule outright — "never invent a GL account" — so populating account_id client-side would be the
 * wrong fix and would recreate the same-entity FK break its sibling comment warns about.
 *
 * WHAT IT ENFORCES: the Section-A validator tests the field the grid actually writes
 * (expense_category_uuid), and does NOT test account_id unless the builder starts assigning it.
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:bill-category-validator-field";
const FORM = "apps/frontend/src/components/accounting/VendorBillForm.tsx";
const BUILDER = "apps/frontend/src/components/accounting/vendorBillLines.ts";

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** `section === "A" && !line.account_id` — the predicate that could never pass. */
const VALIDATES_ACCOUNT_ID = /section\s*===\s*["']A["'][\s\S]{0,120}?!\s*[A-Za-z0-9_.]*\baccount_id\b/;
const VALIDATES_CATEGORY = /section\s*===\s*["']A["'][\s\S]{0,160}?\bexpense_category_uuid\b/;
/** Does the builder ever ASSIGN account_id (not merely declare it on the type)? */
const BUILDER_ASSIGNS_ACCOUNT_ID = /account_id\s*:\s*[A-Za-z0-9_("'`]/;

export function analyse(files) {
  const problems = [];
  const formRaw = files[FORM];
  const builderRaw = files[BUILDER];
  if (formRaw == null) problems.push(`${FORM} is missing.`);
  if (builderRaw == null) problems.push(`${BUILDER} is missing.`);
  if (formRaw == null || builderRaw == null) return problems;

  const form = stripComments(formRaw);
  const builder = stripComments(builderRaw);
  const builderAssigns = BUILDER_ASSIGNS_ACCOUNT_ID.test(builder);

  if (!VALIDATES_CATEGORY.test(form)) {
    problems.push(
      `${FORM}: the Section-A validator does not test expense_category_uuid — the field the grid ` +
        `actually commits. Validating anything else silently blocks or silently allows every bill.`
    );
  }
  if (VALIDATES_ACCOUNT_ID.test(form) && !builderAssigns) {
    problems.push(
      `${FORM}: the Section-A validator tests account_id, but ${BUILDER} never ASSIGNS account_id ` +
        `(it is declared on the payload type and written nowhere). That predicate is unconditionally ` +
        `true, so no vendor bill with a category line can ever be saved — the live 2026-08-02 defect.`
    );
  }
  return problems;
}

function readAll() {
  const out = {};
  for (const f of [FORM, BUILDER]) out[f] = existsSync(f) ? readFileSync(f, "utf8") : null;
  return out;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const builderNoAssign = "export type P = { account_id?: string; }; out.push({ section: 'A', expense_category_uuid: id });";
  const builderAssigns = "out.push({ section: 'A', account_id: acct, expense_category_uuid: id });";
  const formGood = `linePayloads.some((line) => line.section === "A" && !String(line.expense_category_uuid ?? "").trim())`;
  const formBug = `linePayloads.some((line) => line.section === "A" && !line.account_id)`;

  t("validating the committed field passes", analyse({ [FORM]: formGood, [BUILDER]: builderNoAssign }).length === 0);
  // The REAL live defect.
  t("account_id predicate with a builder that never assigns it FAILS",
    analyse({ [FORM]: formBug, [BUILDER]: builderNoAssign }).length === 2);
  // If a future change DOES populate account_id, testing it is legitimate — only the category test is still required.
  t("account_id predicate is tolerated once the builder assigns it",
    analyse({ [FORM]: formBug, [BUILDER]: builderAssigns }).length === 1);
  t("a comment mentioning account_id does not trip it",
    analyse({ [FORM]: `// was !line.account_id before\n${formGood}`, [BUILDER]: builderNoAssign }).length === 0);
  t("missing file FAILS", analyse({ [FORM]: null, [BUILDER]: builderNoAssign }).length >= 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 5 cases (2 pass-shapes incl. comment-immunity, 3 fail/tolerance shapes)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Section-A validator tests the field the grid commits`);
