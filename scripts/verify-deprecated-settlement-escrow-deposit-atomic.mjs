#!/usr/bin/env node
/**
 * ACCT-F5645 — the bond-deduction escrow deposit must run on the settlement's own transaction client.
 *
 * The retired payroll writer (driver-settlement.service.deprecated.ts) once called the connection-opening depositEscrow()
 * on a second connection, so a later rollback left an orphan escrow posting with no settlement behind it. ACCT-F5644
 * added depositEscrowOnClient(client, ...) and that writer was moved onto it.
 *
 * LST-F426 deleted the retired writer: it was not mounted, and its only importers were its own tests. The live settlement
 * chain is driver_finance (settlement-payrun-close.service.ts → settlement-ap-chain.service.ts). This guard now proves:
 *   1. escrow/service.ts still exports depositEscrowOnClient(client, ...), delegating to postEscrowTransactionOnClient on
 *      the caller's client — the atomic variant every in-transaction caller depends on;
 *   2. the retired writer stays deleted. If it is restored, it is a second settlement writer outside the documents chain
 *      that ROUND 393.1 refuses on ap_control.
 */
import fs from "node:fs";

export const RETIRED_WRITER = "apps/backend/src/payroll/driver-settlement.service.deprecated.ts";

export function run(root = process.cwd()) {
  const failures = [];

  if (fs.existsSync(`${root}/${RETIRED_WRITER}`)) {
    failures.push(
      `${RETIRED_WRITER} is back — it was retired by LST-F426 (a second settlement writer outside the driver_finance documents chain); delete it`
    );
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
  const goodEscrowService = `
export async function depositEscrowOnClient(client, input, actor) {
  return postEscrowTransactionOnClient(client, { ...input, posting_type: "deposit" }, actor);
}
`;
  mk("apps/backend/src/accounting/escrow/service.ts", goodEscrowService);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the retired writer is restored.
  mk(RETIRED_WRITER, "export async function postSettlement() {}\n");
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): a restored retired writer should be caught");
  fs.rmSync(`${tmp}/${RETIRED_WRITER}`);

  // Regression 2: depositEscrowOnClient opens its own connection instead of taking the caller's client.
  mk("apps/backend/src/accounting/escrow/service.ts", goodEscrowService.replace("depositEscrowOnClient(client, input, actor)", "depositEscrowOnClient(input, actor)"));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): a depositEscrowOnClient without a client parameter should be caught");

  // Regression 3: it no longer delegates on the caller's client.
  mk("apps/backend/src/accounting/escrow/service.ts", goodEscrowService.replace("postEscrowTransactionOnClient(client,", "postEscrowTransaction("));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 3): a deposit not delegated on the caller's client should be caught");

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
