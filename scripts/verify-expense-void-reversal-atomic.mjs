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

  // The posting-engine import list grows (postSourceTransactionInClientTx, ensureOpenPeriod, ...); what matters is that
  // the atomic, client-taking reverser is imported from the posting engine — an exact whole-line match broke on every
  // unrelated addition to that import.
  // ACCT-F4431310 (2026-10-12): the void route now reverses through reverseExpenseDocumentInClientTx (expense-void-reversal.ts),
  // the client-taking reversal of EVERY live posting of the document (own 'expense' lines + a fuel receipt's fuel_event
  // entry); it takes the same client, so the rule — reversal and status flip in ONE transaction — is unchanged.
  const engineImport = src.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/posting-engine\.service\.js"/);
  const docImport = /import\s*\{[^}]*\breverseExpenseDocumentInClientTx\b[^}]*\}\s*from\s*"\.\/expense-void-reversal\.js"/.test(src);
  if (!docImport && (!engineImport || !/\breversePostedSourceTransactionInClientTx\b/.test(engineImport[1]))) {
    failures.push("expenses.routes.ts must import a client-taking, atomic reverser (reverseExpenseDocumentInClientTx or reversePostedSourceTransactionInClientTx), not the non-atomic reversePostedSourceTransaction");
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
  if (!/(?:reversePostedSourceTransactionInClientTx|reverseExpenseDocumentInClientTx)\(\s*client,/.test(routeBody)) {
    failures.push("the reversal call must pass the same `client` used by the subsequent UPDATE — anchored on reverseExpenseDocumentInClientTx(client, ...) / reversePostedSourceTransactionInClientTx(client, ...)");
  }
  // The UPDATE must appear AFTER the reversal call within the same callback body, not in a separate
  // withCompanyScope block.
  const reversalIdx = routeBody.search(/(?:reversePostedSourceTransactionInClientTx|reverseExpenseDocumentInClientTx)\(/);
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

  // ACCT-F4431310 shape: the document reverser on the same client, before the UPDATE -> PASS; moved after the UPDATE -> caught.
  const goodDoc = good
    .replace('import { postSourceTransaction, reversePostedSourceTransactionInClientTx, PostingEngineError } from "./posting-engine.service.js";',
      'import { postSourceTransaction, PostingEngineError } from "./posting-engine.service.js";\nimport { reverseExpenseDocumentInClientTx } from "./expense-void-reversal.js";')
    .replace(/const rev = await reversePostedSourceTransactionInClientTx\([\s\S]*?todayIso\(\)\n        \);/, "const rev = await reverseExpenseDocumentInClientTx(client, { operatingCompanyId: oci, expenseId });");
  mk("apps/backend/src/accounting/expenses.routes.ts", goodDoc);
  if (run(tmp).length) throw new Error("PASS fail (document reverser): " + run(tmp).join("; "));
  const badDoc = goodDoc
    .replace("const rev = await reverseExpenseDocumentInClientTx(client, { operatingCompanyId: oci, expenseId });\n", "")
    .replace("return { reversingJeId: rev.journal_entry_id };", "const rev = await reverseExpenseDocumentInClientTx(client, { operatingCompanyId: oci, expenseId });\n        return { reversingJeId: rev.journal_entry_id };");
  mk("apps/backend/src/accounting/expenses.routes.ts", badDoc);
  if (!run(tmp).length) throw new Error("FAIL fail: document reversal after the status flip should be caught");

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
