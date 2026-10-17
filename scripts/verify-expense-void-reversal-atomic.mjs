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
  // 443.136 follow-up (de3de55e09, #26737): the route now delegates the whole in-transaction void to THE one expense
  // void, voidExpenseDocumentInClientTx (accounting/expense-void.service.ts), called with the route's client inside its
  // single withCompanyScope. The rule is unchanged — reversal then status flip, one client, one transaction — so when the
  // route delegates, the reversal-before-flip ordering is asserted on that service body instead of the route body.
  const delegates = /import\s*\{[^}]*\bvoidExpenseDocumentInClientTx\b[^}]*\}\s*from\s*"\.\/expense-void\.service\.js"/.test(src);
  const engineImport = src.match(/import\s*\{([^}]*)\}\s*from\s*"\.\/posting-engine\.service\.js"/);
  const docImport = /import\s*\{[^}]*\breverseExpenseDocumentInClientTx\b[^}]*\}\s*from\s*"\.\/expense-void-reversal\.js"/.test(src);
  if (!delegates && !docImport && (!engineImport || !/\breversePostedSourceTransactionInClientTx\b/.test(engineImport[1]))) {
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
  if (delegates && /\bvoidExpenseDocumentInClientTx\(/.test(routeBody)) {
    // The delegate must run on the route's transaction client, inside the (second) withCompanyScope callback.
    if (!/withCompanyScope\([^)]*\)\s*=>\s*\{?\s*(?:return\s+)?(?:await\s+)?voidExpenseDocumentInClientTx\(\s*client\b/.test(routeBody.replace(/async\s*\(client\)/g, "(client)"))) {
      failures.push("the void route must call voidExpenseDocumentInClientTx(client, ...) directly inside its withCompanyScope callback — the reversal and the status flip must share the route's one transaction");
    }
    const svcPath = `${root}/apps/backend/src/accounting/expense-void.service.ts`;
    if (!fs.existsSync(svcPath)) {
      failures.push("expenses.routes.ts imports voidExpenseDocumentInClientTx but accounting/expense-void.service.ts is missing");
      return failures;
    }
    const svc = fs.readFileSync(svcPath, "utf8");
    const start = svc.indexOf("export async function voidExpenseDocumentInClientTx(");
    if (start === -1) {
      failures.push("could not locate voidExpenseDocumentInClientTx in expense-void.service.ts to check");
      return failures;
    }
    const nextExport = svc.indexOf("\nexport ", start + 1);
    const fnBody = nextExport === -1 ? svc.slice(start) : svc.slice(start, nextExport);
    if (/withCompanyScope\(|withCurrentUser\(|pool\.connect\(|getPool\(|\bBEGIN\b|\bCOMMIT\b/.test(fnBody)) {
      failures.push("voidExpenseDocumentInClientTx must not open its own connection/transaction — it runs on the caller's client");
    }
    if (/\breversePostedSourceTransaction\(/.test(fnBody.replace(/reversePostedSourceTransactionInClientTx/g, ""))) {
      failures.push("voidExpenseDocumentInClientTx must not call the non-atomic reversePostedSourceTransaction");
    }
    if (!/(?:reversePostedSourceTransactionInClientTx|reverseExpenseDocumentInClientTx)\(\s*client\b/.test(fnBody)) {
      failures.push("voidExpenseDocumentInClientTx must reverse on its own `client` — anchored on reverseExpenseDocumentInClientTx(client, ...) / reversePostedSourceTransactionInClientTx(client, ...)");
    }
    const revIdx = fnBody.search(/(?:reversePostedSourceTransactionInClientTx|reverseExpenseDocumentInClientTx)\(/);
    const flipIdx = fnBody.search(/stampDocumentVoided\(|UPDATE accounting\.expenses/);
    if (revIdx === -1 || flipIdx === -1 || revIdx > flipIdx) {
      failures.push("in voidExpenseDocumentInClientTx the status flip (stampDocumentVoided / UPDATE accounting.expenses) must run after the reversal call");
    }
    return failures;
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

  // 443.136 follow-up shape: the route delegates to voidExpenseDocumentInClientTx on its client (PASS); the service
  // flipping before it reverses, opening its own transaction, or the route calling it off its client -> caught.
  const routeDelegate = `
import { voidExpenseDocumentInClientTx } from "./expense-void.service.js";

  app.post("/api/v1/expenses/:expenseId/void", async (req, reply) => {
    const pre = await withCompanyScope(user.uuid, oci, async (client) => {
      return { kind: "ok" };
    });
    try {
      const voided = await withCompanyScope(user.uuid, oci, async (client) =>
        voidExpenseDocumentInClientTx(client as never, { operatingCompanyId: oci, expenseId }));
      return reply.code(200).send({ status: "void" });
    } catch (err) {
      throw err;
    }
  });
`;
  const svcGood = `
export async function voidExpenseDocumentInClientTx(client, input) {
  const rev = await reverseExpenseDocumentInClientTx(client as never, { operatingCompanyId: input.operatingCompanyId });
  await stampDocumentVoided(client as never, { family: "expense" });
  await client.query(\`UPDATE accounting.expenses SET posting_status='reversed' WHERE id=$1\`, []);
  return { reversingJeId: rev.reversal_journal_entry_id };
}
`;
  mk("apps/backend/src/accounting/expenses.routes.ts", routeDelegate);
  mk("apps/backend/src/accounting/expense-void.service.ts", svcGood);
  if (run(tmp).length) throw new Error("PASS fail (delegate): " + run(tmp).join("; "));
  const svcFlipFirst = svcGood
    .replace("  const rev = await reverseExpenseDocumentInClientTx(client as never, { operatingCompanyId: input.operatingCompanyId });\n", "")
    .replace("  return { reversingJeId", "  const rev = await reverseExpenseDocumentInClientTx(client as never, { operatingCompanyId: input.operatingCompanyId });\n  return { reversingJeId");
  mk("apps/backend/src/accounting/expense-void.service.ts", svcFlipFirst);
  if (!run(tmp).length) throw new Error("FAIL fail: delegate service flipping status before the reversal should be caught");
  mk("apps/backend/src/accounting/expense-void.service.ts", svcGood.replace("export async function voidExpenseDocumentInClientTx(client, input) {", "export async function voidExpenseDocumentInClientTx(client, input) {\n  return withCompanyScope(uid, input.operatingCompanyId, async (own) => {});"));
  if (!run(tmp).length) throw new Error("FAIL fail: delegate service opening its own transaction should be caught");
  mk("apps/backend/src/accounting/expense-void.service.ts", svcGood);
  mk("apps/backend/src/accounting/expenses.routes.ts", routeDelegate.replace("voidExpenseDocumentInClientTx(client as never,", "voidExpenseDocumentInClientTx(otherClient as never,"));
  if (!run(tmp).length) throw new Error("FAIL fail: route calling the delegate off its transaction client should be caught");

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
