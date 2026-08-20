#!/usr/bin/env node
/**
 * ACCT-F5637 — executeBillPayment (governance/void-cancel-executors.ts) used to call the
 * voidBillPayment() WRAPPER instead of the client-taking voidBillPaymentInClientTx variant. That
 * wrapper opens its OWN pool connection (withCurrentUser) and immediately runs its own
 * SELECT ... FOR UPDATE on the SAME accounting.bill_payments row ctx.client's own SELECT ... FOR
 * UPDATE already holds, uncommitted, for the duration of the request — an application-level
 * self-deadlock across two DB sessions that Postgres's own deadlock detector cannot see (there is no
 * DB-visible wait-for cycle; the first connection is blocked on a JS await, not a DB lock). Prod has
 * statement_timeout=0/lock_timeout=0, so the blocked query hangs indefinitely, permanently pinning two
 * pool connections per stuck attempt.
 *
 * Fixed by calling voidBillPaymentInClientTx directly on ctx.client, the same atomic pattern
 * executeDriverSettlement already uses for its own bill-payment/bill reversal calls in this same file,
 * with reversePostedGl: false since postVoidReversal already performed the reversal earlier in the
 * same executor.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/governance/void-cancel-executors.ts`, "utf8");

  if (!src.includes('import { voidBillPaymentInClientTx } from "../accounting/bills.service.js"')) {
    failures.push("void-cancel-executors.ts must import voidBillPaymentInClientTx (the client-taking, atomic variant)");
  }

  const fnMatch = src.match(/const executeBillPayment: EntityExecutor = async \(ctx\) => \{[\s\S]*?\n\};/);
  if (!fnMatch) {
    failures.push("executeBillPayment function not found");
    return failures;
  }
  const body = fnMatch[0];

  if (!/await voidBillPaymentInClientTx\(\s*client,/.test(body)) {
    failures.push("executeBillPayment must call voidBillPaymentInClientTx(client, ...) directly — a dynamic import of the connection-opening voidBillPayment() wrapper self-deadlocks");
  }
  if (/await import\(\s*"\.\.\/accounting\/bills\.service\.js"\s*\)/.test(body)) {
    failures.push("executeBillPayment must not dynamically import bills.service.js to call the standalone voidBillPayment() wrapper — that reopens a second DB connection and self-deadlocks on the row lock ctx.client already holds");
  }
  if (!/reversePostedGl:\s*false/.test(body)) {
    failures.push("voidBillPaymentInClientTx must be called with reversePostedGl: false — the GL reversal already happened via postVoidReversal earlier in this same executor; letting it run again risks a redundant reversing JE");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-billpay-void-executor-deadlock-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
import { voidBillPaymentInClientTx } from "../accounting/bills.service.js";

const executeBillPayment: EntityExecutor = async (ctx) => {
  const { client, operatingCompanyId, entityId, userId, reason } = ctx;
  const reversal = await postVoidReversal(client, {}, { userId });
  await voidBillPaymentInClientTx(client, {
    operatingCompanyId,
    paymentId: entityId,
    reason,
    userId,
    reversePostedGl: false,
    currentBusinessDate: companyBusinessDate(),
  });
};
`;
  mk("apps/backend/src/governance/void-cancel-executors.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: back to the dynamic-import wrapper call (the original self-deadlock bug).
  mk(
    "apps/backend/src/governance/void-cancel-executors.ts",
    good
      .replace('import { voidBillPaymentInClientTx } from "../accounting/bills.service.js";\n\n', "")
      .replace(
        /await voidBillPaymentInClientTx\([\s\S]*?\}\);/,
        `const { voidBillPayment } = await import("../accounting/bills.service.js");
  await voidBillPayment(operatingCompanyId, entityId, reason, userId);`
      )
  );
  const f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: dynamic-import wrapper call (self-deadlock shape) should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bill-payment-void-executor-no-self-deadlock --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-bill-payment-void-executor-no-self-deadlock — OK");
}
