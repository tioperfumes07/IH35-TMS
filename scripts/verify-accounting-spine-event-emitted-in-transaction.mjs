#!/usr/bin/env node
/**
 * ACCOUNTING-SPINE-EVENT-FIRE-AND-FORGET-SILENT-DROP
 *
 * The board's original filing: 13 call sites across invoices.routes.ts, bills.routes.ts,
 * bills.service.ts, payments.routes.ts, customer-payments.routes.ts and expenses.routes.ts called
 * `emitAccountingSpineEvent` AFTER the write's own transaction had already committed, in a SEPARATE
 * `withCompanyScope(...)` transaction, with a bare `.catch((err) => req.log.warn(...))`. A real emit
 * failure there was silently swallowed: the bill/invoice/payment/expense row exists, the accounting
 * spine's audit trail of it does not, and nothing ever surfaces the gap.
 *
 * The fix moves every one of those 13 calls to be `await`ed INSIDE the same transaction as the write
 * it documents, immediately before that transaction's success return — the pattern already used by
 * settlement-posting.service.ts / lease-posting.service.ts / amortization-posting.service.ts. With the
 * call inside the transaction, an emit failure now rolls back the whole write instead of vanishing.
 *
 * This guard locks two things per file:
 * (1) no `emitAccountingSpineEvent(client, {` call site is missing its `await` (the site itself
 *     regressing back to fire-and-forget), and
 * (2) the `spine_emit_*_failed` log-message family — used ONLY by the old catch-and-warn
 *     antipattern — never reappears (its return would mean a new/reverted post-commit block).
 * It also locks the call COUNT per file so a "regression" can't hide as a silent deletion of the
 * audit trail entirely.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Expected live call-site count per file, post-fix. bills.routes.ts is intentionally 0 — all 4 of
// its former sites now live inside bills.service.ts's own transactions instead.
const TARGETS = [
  { file: "apps/backend/src/accounting/invoices.routes.ts", expectedCount: 4 },
  { file: "apps/backend/src/accounting/bills.routes.ts", expectedCount: 0 },
  { file: "apps/backend/src/accounting/bills.service.ts", expectedCount: 4 },
  { file: "apps/backend/src/accounting/payments.routes.ts", expectedCount: 2 },
  { file: "apps/backend/src/accounting/customer-payments.routes.ts", expectedCount: 1 },
  { file: "apps/backend/src/accounting/expenses.routes.ts", expectedCount: 2 },
];

export function check(fileContentsByPath) {
  const failures = [];

  for (const { file, expectedCount } of TARGETS) {
    const src = fileContentsByPath[file];
    if (src === undefined) {
      failures.push(`${file}: file missing from check input`);
      continue;
    }

    if (/spine_emit_\w+_failed/.test(src)) {
      failures.push(
        `${file}: a "spine_emit_*_failed" log message reappeared — this is the signature of the old ` +
          `post-commit catch-and-warn antipattern (a real emit failure gets silently swallowed)`
      );
    }

    // Every real call site must be awaited. Match the call opener and check what precedes it.
    const callOpener = "emitAccountingSpineEvent(client, {";
    let searchFrom = 0;
    let foundCount = 0;
    for (;;) {
      const idx = src.indexOf(callOpener, searchFrom);
      if (idx === -1) break;
      foundCount++;
      const before = src.slice(Math.max(0, idx - 10), idx);
      if (!/await\s+$/.test(before)) {
        failures.push(
          `${file}: an "emitAccountingSpineEvent(client, {" call site at offset ${idx} is not awaited ` +
            `— fire-and-forget regression`
        );
      }
      searchFrom = idx + callOpener.length;
    }

    if (foundCount !== expectedCount) {
      failures.push(
        `${file}: expected ${expectedCount} emitAccountingSpineEvent call site(s), found ${foundCount} ` +
          `— either a site was silently dropped (audit trail gap) or duplicated`
      );
    }
  }

  return failures;
}

function readAll() {
  const out = {};
  for (const { file } of TARGETS) {
    out[file] = fs.readFileSync(path.join(root, file), "utf8");
  }
  return out;
}

function run() {
  const failures = check(readAll());
  if (failures.length > 0) {
    console.error("FAIL: accounting-spine-event-emitted-in-transaction");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    "PASS: all accounting-spine-event call sites are awaited inside their write's own transaction; " +
      "no fire-and-forget post-commit antipattern present"
  );
}

function selftest() {
  const baselineFiles = readAll();
  const baseline = check(baselineFiles);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Mutation 1: drop `await` from one real call site (invoices.routes.ts) — the exact
  // fire-and-forget regression this guard exists to catch.
  const mutatedA = { ...baselineFiles };
  const invoicesSrc = mutatedA["apps/backend/src/accounting/invoices.routes.ts"];
  const patchedA = invoicesSrc.replace(
    "await emitAccountingSpineEvent(client, {",
    "emitAccountingSpineEvent(client, {"
  );
  if (patchedA === invoicesSrc) {
    console.error("FAIL(selftest): mutation A did not change the file — pattern out of sync");
    process.exit(1);
  }
  mutatedA["apps/backend/src/accounting/invoices.routes.ts"] = patchedA;
  const failuresA = check(mutatedA);
  if (failuresA.length === 0) {
    console.error("FAIL(selftest): planted offender (dropped await) was NOT caught");
    process.exit(1);
  }

  // Mutation 2: reintroduce the exact old post-commit catch-and-warn antipattern shape (the real
  // pre-fix code) on bills.routes.ts, which should have zero call sites post-fix.
  const mutatedB = { ...baselineFiles };
  const billsRoutesSrc = mutatedB["apps/backend/src/accounting/bills.routes.ts"];
  const offenderBlock = `
      await withCompanyScope(String(user.uuid), query.data.operating_company_id, (client) =>
        emitAccountingSpineEvent(client, {
          operating_company_id: query.data.operating_company_id,
          actor_user_id: String(user.uuid),
          event_type: "payment.bill_voided",
          entity_id: params.data.id,
          entity_type: "bill_payment",
          source_table: "accounting.bill_payments",
          payload: { reason: body.data.reason ?? null },
        })
      ).catch((err) =>
        req.log.warn(
          { err, bill_payment_id: params.data.id, company_id: query.data.operating_company_id },
          "spine_emit_bill_payment_voided_failed"
        )
      );
`;
  mutatedB["apps/backend/src/accounting/bills.routes.ts"] = billsRoutesSrc + offenderBlock;
  const failuresB = check(mutatedB);
  if (failuresB.length === 0) {
    console.error("FAIL(selftest): planted offender (reintroduced post-commit catch-and-warn block) was NOT caught");
    process.exit(1);
  }

  // Mutation 3: silently delete a whole call site (audit-trail regression via deletion, not just
  // un-awaiting it) — remove one full emit block from bills.service.ts.
  const mutatedC = { ...baselineFiles };
  const billsServiceSrc = mutatedC["apps/backend/src/accounting/bills.service.ts"];
  const oneCallSite = /await emitAccountingSpineEvent\(client, \{[\s\S]*?\}\);\n/;
  const patchedC = billsServiceSrc.replace(oneCallSite, "");
  if (patchedC === billsServiceSrc) {
    console.error("FAIL(selftest): mutation C did not change the file — pattern out of sync");
    process.exit(1);
  }
  mutatedC["apps/backend/src/accounting/bills.service.ts"] = patchedC;
  const failuresC = check(mutatedC);
  if (failuresC.length === 0) {
    console.error("FAIL(selftest): planted offender (deleted call site) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): all 3 planted regressions correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
