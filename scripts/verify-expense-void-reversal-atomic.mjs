#!/usr/bin/env node
/**
 * ACCT-F5635 — the direct expense void route (POST /api/v1/expenses/:expenseId/void) used to run its
 * GL reversal and its header status-flip as TWO independent database transactions:
 * reversePostedSourceTransaction opens+commits its own connection internally, then a SEPARATE
 * withCompanyScope call did the UPDATE. If the process/connection died between the two, the result
 * was a fully-reversed GL entry (money net to zero, already durable) attached to an expense header
 * still reporting status='posted' -- a subledger-vs-GL divergence.
 *
 * governance/void-cancel-executors.ts's executeExpense and work-orders.routes.ts's WO-void cascade
 * both already do the reversal + flip atomically on one client; this route was the third writer and
 * the only one that didn't. This guard proves the reversal now runs on the SAME client, inside the
 * SAME withCompanyScope transaction, as the status-flip UPDATE.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/expenses.routes.ts`, "utf8");

  if (!src.includes('import { postSourceTransaction, reversePostedSourceTransactionInClientTx, PostingEngineError } from "./posting-engine.service.js"')) {
    failures.push("expenses.routes.ts must import reversePostedSourceTransactionInClientTx (the client-taking, atomic variant), not the non-atomic reversePostedSourceTransaction");
  }
  if (/\breversePostedSourceTransaction\(/.test(src.replace(/reversePostedSourceTransactionInClientTx/g, ""))) {
    failures.push("expenses.routes.ts must not call the non-atomic reversePostedSourceTransaction anywhere");
  }

  const voidRouteMatch = src.match(/app\.post\(\s*"\/api\/v1\/expenses\/:expenseId\/void"[\s\S]*?\n {2}\}\);/);
  if (!voidRouteMatch) {
    failures.push("could not locate the expense void route to check");
    return failures;
  }
  const routeBody = voidRouteMatch[0];

  // The reversal call and the status-flip UPDATE must both be inside the SAME withCompanyScope
  // callback (same client), not in two separate withCompanyScope calls.
  const withCompanyScopeCalls = (routeBody.match(/await withCompanyScope\(/g) || []).length;
  if (withCompanyScopeCalls !== 2) {
    // 2 expected: one for the pre-check SELECT, one for the reversal+UPDATE together.
    failures.push(
      `expected exactly 2 withCompanyScope calls in the void route (pre-check + atomic reversal-and-flip), found ${withCompanyScopeCalls} — the reversal and the status flip must share one transaction`
    );
  }
  if (!/reversePostedSourceTransactionInClientTx\(\s*client,/.test(routeBody)) {
    failures.push("the reversal call must pass the same `client` used by the subsequent UPDATE — anchored on reversePostedSourceTransactionInClientTx(client, ...)");
  }
  // The UPDATE must appear AFTER the reversal call within the same callback body, not in a separate
  // withCompanyScope block.
  const reversalIdx = routeBody.search(/reversePostedSourceTransactionInClientTx\(/);
  const updateIdx = routeBody.search(/UPDATE accounting\.expenses/);
  if (reversalIdx === -1 || updateIdx === -1 || reversalIdx > updateIdx) {
    failures.push("the status-flip UPDATE must run after the reversal call within the same transaction");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-expense-void-atomic-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
import { postSourceTransaction, reversePostedSourceTransactionInClientTx, PostingEngineError } from "./posting-engine.service.js";

  app.post("/api/v1/expenses/:expenseId/void", async (req, reply) => {
    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      return { kind: "ok" };
    });
    try {
      const voided = await withCompanyScope(user.uuid, oci, async (client) => {
        const rev = await reversePostedSourceTransactionInClientTx(
          client,
          { operating_company_id: oci, source_transaction_type: "expense", source_transaction_id: expenseId },
          { userId: String(user.uuid) },
          todayIso()
        );
        await client.query(\`UPDATE accounting.expenses SET status='void' WHERE id=$1\`, []);
        return { reversingJeId: rev.journal_entry_id };
      });
      return reply.code(200).send({ status: "void" });
    } catch (err) {
      throw err;
    }
  });
`;
  mk("apps/backend/src/accounting/expenses.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: back to the non-atomic split — two separate reversal/UPDATE transactions, the
  // original bug shape (reversal via the non-client-tx variant, UPDATE in its own withCompanyScope).
  const bad = good
    .replace("reversePostedSourceTransactionInClientTx", "reversePostedSourceTransaction")
    .replace(
      /const voided = await withCompanyScope\(user\.uuid, oci, async \(client\) => \{[\s\S]*?\n      \}\);/,
      `const rev = await reversePostedSourceTransaction(
        { operating_company_id: oci, source_transaction_type: "expense", source_transaction_id: expenseId },
        { userId: String(user.uuid) }
      );
      await withCompanyScope(user.uuid, oci, async (client) => {
        await client.query(\`UPDATE accounting.expenses SET status='void' WHERE id=$1\`, []);
      });`
    );
  mk("apps/backend/src/accounting/expenses.routes.ts", bad);
  const f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: non-atomic split (two transactions) should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-expense-void-reversal-atomic --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-expense-void-reversal-atomic — OK");
}
