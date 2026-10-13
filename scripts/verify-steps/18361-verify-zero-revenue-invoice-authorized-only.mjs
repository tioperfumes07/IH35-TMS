/**
 * ROUND 443.1 — verify-step 18361 (CC-1, mod4 ≡ 1)
 *
 * Guards four invariants for owner-authorized $0 invoices:
 *  S1: from-load.ts still throws load_has_no_rate when flag absent + rate 0
 *  S2: zero branch only reachable when authorizedZeroRevenue === true
 *  S3: zero line uses quantity 1, unit_amount_cents 0 (not quantity 0)
 *  S4: factor-submit paths (invoices-bulk + factoring-advances) refuse total_cents = 0
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(new URL(".", import.meta.url).pathname, "../..");

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

export function staticProblems(srcs) {
  const fromLoad = srcs.fromLoad;
  const sendSvc = srcs.sendSvc;
  const bulkRoutes = srcs.bulkRoutes;
  const factoringRoutes = srcs.factoringRoutes;
  const p = [];

  // S1: flag absent → load_has_no_rate still fires on rate <= 0
  if (!/else if \(!Number\.isFinite\(rateCents\) \|\| rateCents <= 0\)/.test(fromLoad) &&
      !/} else if \(!Number\.isFinite/.test(fromLoad)) {
    p.push("S1: from-load.ts does not preserve load_has_no_rate throw on the else branch (flag absent path)");
  }

  // S2: zero branch only entered when authorizedZeroRevenue is truthy
  if (!/if \(input\.authorizedZeroRevenue\)/.test(fromLoad)) {
    p.push("S2: from-load.ts zero branch is not gated on input.authorizedZeroRevenue");
  }

  // S3: zero line uses quantity=1, unit_amount_cents=0 — the existing INSERT uses ($7,$7) where $7=lineTotal;
  //     for a $0 authorized invoice lineTotal === 0, so quantity=1, unit=0, total=0 is correct.
  //     Guard that the INSERT still reads VALUES...,1,$7,$7,... (quantity 1, not 0)
  if (!/VALUES\s*\(\$1,\$2,\$3,'linehaul',\$4,\$5,\$6,1,\$7,\$7/.test(fromLoad)) {
    p.push("S3: from-load.ts linehaul INSERT does not use quantity=1 (VALUES...,1,$7,$7) — zero line must use qty 1, unit 0");
  }

  // S4a: bulk mark_factored refuses total_cents = 0 with zero_revenue_invoice_not_factorable
  if (!/zero_revenue_invoice_not_factorable/.test(bulkRoutes)) {
    p.push("S4a: invoices-bulk.routes.ts mark_factored does not refuse zero_revenue_invoice_not_factorable");
  }

  // S4b: manual factoring-advances submit refuses total_cents = 0 with zero_revenue_invoice_not_factorable
  if (!/zero_revenue_invoice_not_factorable/.test(factoringRoutes)) {
    p.push("S4b: factoring-advances.routes.ts submit does not refuse zero_revenue_invoice_not_factorable");
  }

  // S5: sendDraftInvoice returns zero_revenue_no_posting for $0 invoices (not a GL failure)
  if (!/zero_revenue_no_posting/.test(sendSvc)) {
    p.push("S5: invoice-send.service.ts does not return reason=zero_revenue_no_posting for total_cents=0");
  }

  return p;
}

function runStaticChecks() {
  const srcs = {
    fromLoad: read("apps/backend/src/accounting/from-load.ts"),
    sendSvc: read("apps/backend/src/accounting/invoice-send.service.ts"),
    bulkRoutes: read("apps/backend/src/accounting/invoices-bulk.routes.ts"),
    factoringRoutes: read("apps/backend/src/accounting/factoring-advances.routes.ts"),
  };
  return staticProblems(srcs);
}

function runSelftest() {
  const failures = [];

  // Each selftest mutates ONE source so the rule fires, then verifies the error label appears.
  const goodSrcs = {
    fromLoad: `
      if (input.authorizedZeroRevenue) { throw zero_revenue_flag_on_rated_load }
      } else if (!Number.isFinite(rateCents) || rateCents <= 0) { throw load_has_no_rate }
      VALUES ($1,$2,$3,'linehaul',$4,$5,$6,1,$7,$7,0)
    `,
    sendSvc: `return { ok: true, reason: "zero_revenue_no_posting" };`,
    bulkRoutes: `return { ok: false, code: "zero_revenue_invoice_not_factorable", message: "..." }`,
    factoringRoutes: `return { code: 409, error: "zero_revenue_invoice_not_factorable" }`,
  };

  // S1 — remove else branch
  {
    const mutated = { ...goodSrcs, fromLoad: goodSrcs.fromLoad.replace(/} else if \(!Number\.isFinite.*?throw load_has_no_rate \}/, "") };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S1"))) failures.push("S1 selftest: removing else branch did not trigger S1");
  }

  // S2 — remove authorizedZeroRevenue gate
  {
    const mutated = { ...goodSrcs, fromLoad: goodSrcs.fromLoad.replace("input.authorizedZeroRevenue", "someOtherFlag") };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S2"))) failures.push("S2 selftest: removing authorizedZeroRevenue gate did not trigger S2");
  }

  // S3 — change quantity to 0 in INSERT
  {
    const mutated = { ...goodSrcs, fromLoad: goodSrcs.fromLoad.replace("1,$7,$7,0", "0,$7,$7,0") };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S3"))) failures.push("S3 selftest: changing quantity to 0 did not trigger S3");
  }

  // S4a — remove bulk refusal
  {
    const mutated = { ...goodSrcs, bulkRoutes: goodSrcs.bulkRoutes.replace("zero_revenue_invoice_not_factorable", "something_else") };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S4a"))) failures.push("S4a selftest: removing bulk refusal did not trigger S4a");
  }

  // S4b — remove manual submit refusal
  {
    const mutated = { ...goodSrcs, factoringRoutes: goodSrcs.factoringRoutes.replace("zero_revenue_invoice_not_factorable", "something_else") };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S4b"))) failures.push("S4b selftest: removing factoring-advances refusal did not trigger S4b");
  }

  // S5 — remove send reason
  {
    const mutated = { ...goodSrcs, sendSvc: `return { ok: true };` };
    const probs = staticProblems(mutated);
    if (!probs.some((x) => x.startsWith("S5"))) failures.push("S5 selftest: removing zero_revenue_no_posting did not trigger S5");
  }

  return failures;
}

const isSelftest = process.argv.includes("--selftest");

if (isSelftest) {
  const failures = runSelftest();
  if (failures.length > 0) {
    console.error("SELFTEST FAILED:");
    for (const f of failures) console.error(" ", f);
    process.exit(1);
  }
  console.log("SELFTEST PASS — 6/6 rules proven able to fail");
  process.exit(0);
}

const problems = runStaticChecks();
if (problems.length > 0) {
  console.error(`FINDING 18361: zero-revenue invoice guard violations (${problems.length}):`);
  for (const p of problems) console.error(" ", p);
  process.exit(1);
}
console.log("PASS 18361: zero-revenue invoice authorized-only guard");
