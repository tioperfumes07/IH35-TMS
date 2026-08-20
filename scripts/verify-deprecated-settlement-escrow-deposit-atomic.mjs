#!/usr/bin/env node
/**
 * ACCT-F5645 — flagged as a follow-up in ACCT-F5644's own REMAINING note.
 * driver-settlement.service.deprecated.ts's postSettlement builds a Bill + BillPayment on its own
 * transaction client, then — for a bond-deduction settlement — called the connection-opening
 * depositEscrow() to post the escrow deposit on a SECOND, independent connection. A failure anywhere
 * later in this same function (the capped-recovery JE, or the outer transaction's own commit) would
 * leave the bond escrow genuinely deposited (GL posted, balance incremented) while the settlement/
 * bill/payment rolled back — an orphan escrow posting with no settlement behind it. Deprecated,
 * RETIRE-schema module (payroll.* — canonical is driver_finance.*) but still mounted/reachable via
 * driver-settlement.routes.ts (confirmed imported in index.ts).
 *
 * This guard proves the bond-deduction deposit now calls depositEscrowOnClient(client, ...) — the
 * ACCT-F5644 client-taking sibling — with the SAME client driving the rest of this settlement's
 * transaction, not the connection-opening depositEscrow.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/payroll/driver-settlement.service.deprecated.ts`, "utf8");

  if (!/import\s*\{\s*depositEscrowOnClient,\s*openEscrow\s*\}\s*from\s*"\.\.\/accounting\/escrow\/service\.js"/.test(src)) {
    failures.push("driver-settlement.service.deprecated.ts must import depositEscrowOnClient (the client-taking, atomic variant), not the connection-opening depositEscrow");
  }
  if (!/await depositEscrowOnClient\(\s*client,/.test(src)) {
    failures.push("the bond-deduction deposit must call depositEscrowOnClient(client, ...) with this function's own already-open transaction client");
  }

  const escrowSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/escrow/service.ts`, "utf8");
  if (!/export async function depositEscrowOnClient\(\s*client\b/.test(escrowSrc)) {
    failures.push("escrow/service.ts must export depositEscrowOnClient taking the caller's client as its first parameter");
  }
  if (!/postEscrowTransactionOnClient\(client,\s*\{\s*\.\.\.input,\s*posting_type:\s*"deposit"\s*\}/.test(escrowSrc)) {
    failures.push("depositEscrowOnClient must delegate to postEscrowTransactionOnClient on the caller's own client, mirroring releaseEscrowOnClient's own established pattern");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-deprecated-settlement-escrow-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodDeprecated = `
import { depositEscrowOnClient, openEscrow } from "../accounting/escrow/service.js";

export async function postSettlement(input, userId) {
  return withCurrentUser(userId, async (client) => {
    const escrow = await openEscrow({}, { userId, role: "Accountant" });
    await depositEscrowOnClient(
      client,
      { amount_cents: bondAmountCents },
      { userId, role: "Accountant" }
    );
  });
}
`;
  const goodEscrowService = `
export async function depositEscrowOnClient(client, input, actor) {
  return postEscrowTransactionOnClient(client, { ...input, posting_type: "deposit" }, actor);
}
`;
  mk("apps/backend/src/payroll/driver-settlement.service.deprecated.ts", goodDeprecated);
  mk("apps/backend/src/accounting/escrow/service.ts", goodEscrowService);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the original bug — depositEscrow (connection-opening) imported and called with no client.
  mk(
    "apps/backend/src/payroll/driver-settlement.service.deprecated.ts",
    goodDeprecated
      .replace("depositEscrowOnClient, openEscrow", "depositEscrow, openEscrow")
      .replace("await depositEscrowOnClient(\n      client,\n      { amount_cents: bondAmountCents },", "await depositEscrow(\n      { amount_cents: bondAmountCents },")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): the original connection-opening depositEscrow call should be caught");

  // Regression 2: depositEscrowOnClient imported but called without the client argument.
  mk(
    "apps/backend/src/payroll/driver-settlement.service.deprecated.ts",
    goodDeprecated.replace("depositEscrowOnClient(\n      client,\n      { amount_cents: bondAmountCents },", "depositEscrowOnClient(\n      { amount_cents: bondAmountCents },")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): a call missing the client argument should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-deprecated-settlement-escrow-deposit-atomic --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-deprecated-settlement-escrow-deposit-atomic — OK");
}
