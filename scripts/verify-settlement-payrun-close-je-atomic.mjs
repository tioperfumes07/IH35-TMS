#!/usr/bin/env node
/**
 * ACCT-F5652 — closeSettlementPayRun runs its whole body inside ONE caller-owned transaction (FOR UPDATE locks, the
 * payrun_gl_runs idempotency claim, advance recovery stamps). A post that opens a SECOND connection commits on its
 * own and survives a rollback of the close — a retry then double-posts. This guard fails if the settlement close's
 * posting leaves the caller's transaction.
 *
 * ROUND 326 (CC-1): the close no longer posts one createJournalEntry; it posts the per-load A/P chain
 * (settlement-ap-chain.service.ts). Same invariant, re-anchored:
 *   - closeSettlementPayRun calls postSettlementApChainInClientTx(client, …) and no second-connection poster
 *     (createJournalEntry without a client, createBill(, payBill(, postSourceTransaction() ;
 *   - the chain posts ONLY with on-client variants (createBillInClientTx, payBillInClientTx,
 *     postSourceTransactionInClientTx, createJournalEntryOnClient) and never opens its own scope (withCurrentUser).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-payrun-close-je-atomic";
const CLOSE = path.join(ROOT, "apps/backend/src/driver-finance/settlement-payrun-close.service.ts");
const CHAIN = path.join(ROOT, "apps/backend/src/driver-finance/settlement-ap-chain.service.ts");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function analyze(closeSrc, chainSrc) {
  const failures = [];
  const close = strip(closeSrc);
  const chain = strip(chainSrc);
  if (!/await postSettlementApChainInClientTx\(\s*client\b/.test(close)) failures.push(`${path.relative(ROOT, CLOSE)}: the close must post through postSettlementApChainInClientTx(client, …) on its own transaction`);
  if (/\bcreateJournalEntry\(/.test(close) && !/createJournalEntry\([\s\S]{0,400}\{\s*client\b/.test(close)) failures.push(`${path.relative(ROOT, CLOSE)}: createJournalEntry without the caller's client (a second-connection post)`);
  for (const bad of ["createBill(", "payBill(", "postSourceTransaction(", "withCurrentUser(", "createJournalEntry("]) {
    if (chain.includes(bad)) failures.push(`${path.relative(ROOT, CHAIN)}: uses ${bad.slice(0, -1)} — the chain must post only on the caller's client (on-client variants)`);
  }
  for (const need of ["createBillInClientTx(", "payBillInClientTx(", "postSourceTransactionInClientTx(", "createJournalEntryOnClient("]) {
    if (!chain.includes(need)) failures.push(`${path.relative(ROOT, CHAIN)}: expected ${need.slice(0, -1)} on the caller's client`);
  }
  return failures;
}

export function run() {
  if (!fs.existsSync(CLOSE) || !fs.existsSync(CHAIN)) return ["missing the close service or the chain service"];
  return analyze(fs.readFileSync(CLOSE, "utf8"), fs.readFileSync(CHAIN, "utf8"));
}

if (process.argv.includes("--selftest")) {
  const close = fs.readFileSync(CLOSE, "utf8");
  const chain = fs.readFileSync(CHAIN, "utf8");
  if (analyze(close, chain).length) { console.error(`[${LABEL}] selftest: the real tree must pass first`); process.exit(1); }
  const plants = [
    ["chain opens its own connection", close, chain + "\nawait payBill(x, y);"],
    ["close posts a second-connection JE", close + "\nconst je = await createJournalEntry(jeInput, actor);", chain],
    ["close stops posting through the chain", close.replace(/postSettlementApChainInClientTx\(\s*client/, "noop(client"), chain],
  ];
  for (const [name, c, ch] of plants) {
    if (!analyze(c, ch).length) { console.error(`[${LABEL}] selftest: plant "${name}" not caught`); process.exit(1); }
  }
  console.log(`[${LABEL}] selftest: PASS — real tree clean, ${plants.length}/${plants.length} plants caught`);
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error(`[${LABEL}] FAILED — ${failures.length} check(s) regressed:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS — the settlement close posts entirely on its own transaction (per-load A/P chain, on-client variants only)`);
