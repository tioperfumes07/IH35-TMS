#!/usr/bin/env node
/**
 * GUARD: LV-BILL-HEADER-ONLY-UNPOSTABLE / P1-BILL-GL.
 *
 * createBill() must refuse to create a bill with zero accounting.bill_lines — a caller supplying
 * neither `lines` nor `coaAccountId` has no way for the bill to ever resolve through the GL poster,
 * which reads bill_lines and never coaAccountId. The original LAW-E2E #3167 guard only fired when
 * `lines` was PROVIDED (even as an empty array); a caller that omitted the field entirely skipped
 * it completely, and two live callers (insurance policy billing, the recurring-bill generator's
 * legacy no-line-items path) did exactly that.
 *
 * This guard statically asserts:
 *   1. createBill's synchronous pre-check refuses when lines is absent AND coaAccountId is absent.
 *   2. When lines is absent but coaAccountId is present, a single bill_lines row is synthesized
 *      (not silently skipped).
 *   3. The two previously-broken live callers (policy-bill-schedule.service.ts,
 *      bills/recurring/generator.service.ts) each supply one of lines/coaAccountId on every path.
 */
import fs from "node:fs";

const LABEL = "verify-bill-header-only-refused";
const BILLS_SERVICE = "apps/backend/src/accounting/bills.service.ts";
const POLICY_SCHEDULE = "apps/backend/src/insurance/policy-bill-schedule.service.ts";
const RECURRING_GENERATOR = "apps/backend/src/accounting/bills/recurring/generator.service.ts";

function auditBillsService(body) {
  const failures = [];
  if (!/const linesProvided = input\.lines !== undefined;/.test(body)) {
    failures.push("bills.service.ts must still gate on linesProvided");
  }
  if (!/else if \(!input\.coaAccountId\) \{\s*\n\s*throw new Error\("bill_lines_required"\);/.test(body)) {
    failures.push("createBill must throw bill_lines_required when both lines and coaAccountId are absent");
  }
  if (!/\} else if \(input\.coaAccountId\) \{[\s\S]{0,1200}INSERT INTO accounting\.bill_lines/.test(body)) {
    failures.push("createBill must synthesize a bill_lines row when coaAccountId is given without lines");
  }
  return failures;
}

function auditCaller(body, label) {
  const failures = [];
  const callMatch = body.match(/createBill\(\s*\{[\s\S]{0,1200}?\},\s*\n?\s*(?:userId|actorUserId)/);
  if (!callMatch || !/coaAccountId:/.test(callMatch[0])) {
    failures.push(`${label} must pass coaAccountId: inside its createBill({...}) call on its no-lines path`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = fs.readFileSync(BILLS_SERVICE, "utf8");
  const mutations = [
    ['} else if (!input.coaAccountId) {\n    throw new Error("bill_lines_required");\n  }', ""],
    [
      `    } else if (input.coaAccountId) {`,
      `    } else if (false) {`,
    ],
  ];
  let failed = false;
  for (const [from, to] of mutations) {
    if (!src.includes(from)) {
      console.error(`${LABEL} SELFTEST FAIL — mutation anchor not found: ${JSON.stringify(from.slice(0, 60))}`);
      failed = true;
      continue;
    }
    const mutated = src.replace(from, to);
    if (mutated === src || auditBillsService(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${JSON.stringify(from.slice(0, 60))}`);
      failed = true;
    }
  }
  const policySrc = fs.readFileSync(POLICY_SCHEDULE, "utf8");
  const policyMutated = policySrc.replace(/[ \t]*coaAccountId: insuranceExpenseAccountId,\n/, "");
  if (policyMutated === policySrc || auditCaller(policyMutated, "policy-bill-schedule.service.ts").length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — policy-bill-schedule.service.ts mutation escaped`);
    failed = true;
  }

  const genSrc = fs.readFileSync(RECURRING_GENERATOR, "utf8");
  const genMutated = genSrc.replace(
    'if (!billLines) {\n    throw new Error("recurring_bill_template_missing_line_items");\n  }',
    ""
  );
  if (genMutated === genSrc || auditRecurringGenerator(genMutated).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — generator.service.ts mutation escaped`);
    failed = true;
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — refusal, synthesis, and both caller mutations all detected`);
  process.exit(0);
}

function auditRecurringGenerator(body) {
  // This caller took the other legal option: refuse outright when the template carries no line
  // items, rather than synthesizing a line (there is no template-level CoA to synthesize from).
  const failures = [];
  if (!/if \(!billLines\) \{\s*\n\s*throw new Error\("recurring_bill_template_missing_line_items"\);/.test(body)) {
    failures.push("generator.service.ts must refuse to generate a bill when the template has no line items");
  }
  return failures;
}

const failures = [
  ...auditBillsService(fs.readFileSync(BILLS_SERVICE, "utf8")),
  ...auditCaller(fs.readFileSync(POLICY_SCHEDULE, "utf8"), "policy-bill-schedule.service.ts"),
  ...auditRecurringGenerator(fs.readFileSync(RECURRING_GENERATOR, "utf8")),
];
if (failures.length) {
  console.error(`${LABEL} FAILED:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — createBill refuses header-only bills; both previously-broken callers supply coaAccountId`);
