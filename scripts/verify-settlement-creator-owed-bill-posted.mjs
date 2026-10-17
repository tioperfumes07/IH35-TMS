#!/usr/bin/env node
/**
 * GUARD — LEAD 443.110 G4: the Settlement Creator's "owed" company expense is a full vendor bill.
 *   - The Creator's owed branch writes it ONLY through writeCreatorOwedBill (never a bare createBillInClientTx that
 *     leaves the bill unposted), keeps its id (owedBillIds -> the posted audit's owed_bill_ids) and its journal entry.
 *   - writeCreatorOwedBill numbers it on the load spine (nextOwedBillSpineNumber, never the bare load number), passes
 *     that number as the bill's displayId, and GL-posts it in the caller's transaction (postSourceTransactionInClientTx,
 *     source_transaction_type "bill"), refusing a bill that posts no journal entry.
 *   - Edit (voidPriorCreatorSettlementForEdit) voids the prior post's owed bills through voidCreatorOwedBills, which
 *     calls the bill void engine (voidDocument type "bill") — a reversal, never a delete.
 * Run: node scripts/verify-settlement-creator-owed-bill-posted.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-owed-bill-posted";
const D = "apps/backend/src/driver-finance/";
const F = { creator: D + "settlement-creator.service.ts", owed: D + "settlement-creator-owed-bill.ts" };
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

export function problems(s) {
  const p = [];
  const creator = strip(s.creator);
  const owed = strip(s.owed);
  const owedBranch = creator.slice(creator.indexOf('if (card === "owed")'), creator.indexOf('if (card === "owed")') + 2500);
  if (!creator.includes('if (card === "owed")')) p.push("the Creator no longer has an owed company-expense branch — re-point this guard");
  if (!/await writeCreatorOwedBill\(client,/.test(owedBranch)) p.push("the owed branch does not write its bill through writeCreatorOwedBill");
  if (/createBillInClientTx\(/.test(creator)) p.push("the Creator calls createBillInClientTx directly — an owed bill must go through writeCreatorOwedBill (posted)");
  if (!/owedBillIds\.push\(owed\.billId\)/.test(owedBranch) || !/journalEntryIds\.push\(owed\.journalEntryId\)/.test(owedBranch)) p.push("the owed branch does not keep the bill id and its journal entry");
  if (!/owed_bill_ids: owedBillIds/.test(creator)) p.push("the posted audit / result does not carry owed_bill_ids");
  const edit = creator.slice(creator.indexOf("async function voidPriorCreatorSettlementForEdit"), creator.indexOf("async function voidPriorCreatorSettlementForEdit") + 6000);
  if (!/await voidCreatorOwedBills\(client, \{[^}]*billIds: prior\.owed_bill_ids/.test(edit)) p.push("Edit does not void the prior post's owed bills (voidCreatorOwedBills with prior.owed_bill_ids)");
  if (!/const billNumber = await nextOwedBillSpineNumber\(/.test(owed) || !/displayId: billNumber/.test(owed)) p.push("the owed bill is not numbered on its load spine (nextOwedBillSpineNumber -> displayId)");
  if (!/if \(n\.number === n\.loadNumber\) continue;/.test(owed)) p.push("the spine number may hand the owed bill the bare load number (the driver bill's)");
  // 443.182 C step 2 — postBillDocumentInClientTx is the bill engine's in-transaction bill post.
  if (!/postSourceTransactionInClientTx\([\s\S]{0,200}source_transaction_type: "bill"/.test(owed) && !/postBillDocumentInClientTx\(/.test(owed)) p.push("the owed bill is not GL-posted in the caller's transaction");
  if (!/if \(!journalEntryId\) \{[\s\S]{0,200}owed_bill_post_refused/.test(owed)) p.push("a bill that posts no journal entry is not refused");
  if (!/voidDocument\([^)]*\{[\s\S]{0,200}type: "bill"/.test(owed)) p.push("voidCreatorOwedBills does not void through the bill void engine");
  return p;
}

const real = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, fs.readFileSync(path.join(ROOT, v), "utf8")]));

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real source passes", problems(real).length === 0);
  ex("owed branch back to a bare createBillInClientTx is caught",
    problems({ ...real, creator: real.creator.replace("await writeCreatorOwedBill(client,", "await createBillInClientTx(client,") }).length > 0);
  ex("dropping the kept bill id is caught", problems({ ...real, creator: real.creator.replace("owedBillIds.push(owed.billId);", "") }).length > 0);
  ex("Edit no longer voiding owed bills is caught", problems({ ...real, creator: real.creator.replace("await voidCreatorOwedBills(client,", "void (client,") }).length > 0);
  ex("posting removed is caught", problems({ ...real, owed: real.owed.replace("postSourceTransactionInClientTx(", "Promise.resolve(").replace("postBillDocumentInClientTx(", "Promise.resolve(") }).length > 0);
  ex("bare load number allowed is caught", problems({ ...real, owed: real.owed.replace("if (n.number === n.loadNumber) continue;", "") }).length > 0);
  ex("void through a delete instead of the engine is caught", problems({ ...real, owed: real.owed.replace(/type: "bill"/g, 'type: "expense"') }).length > 0);
  ex("spine number not used as the display id is caught", problems({ ...real, owed: real.owed.replace("displayId: billNumber,", "") }).length > 0);
  console.log(ok ? `${LABEL} --selftest PASS (8/8)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const p = problems(real);
if (p.length) {
  console.error(`${LABEL} FAILED:\n  - ${p.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — owed company expenses become posted vendor bills on the load spine, kept and voided on Edit.`);
