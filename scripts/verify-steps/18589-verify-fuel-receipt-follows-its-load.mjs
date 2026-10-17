#!/usr/bin/env node
/**
 * LEAD 443.192 (10:35Z — verify-every-load-born-posting-carries-its-load RULE 2, 44 postings / 12 Relay fills): a posted fuel
 * receipt follows its fill's load. Measured on main before this step:
 *   - fuel/fuel-receipt-repoint.service.ts only ever looked at LOAD-LESS receipts and stamped the posting load once, so a
 *     receipt attached on unconfirmed facts (loads booked "dispatched" with no stop stamps) was never revisited;
 *   - driver-finance/settlement-creator.service.ts wrote the fill's fuel row on its load without bringing the posted receipt;
 *   - accounting/reclassify/reclassify.service.ts refused every load move on a fuel_event line (no engine path at all).
 * THE RULE: a move is one RECLASSIFICATION entry through the reclassify engine (lines reversed on the old load, posted on the
 * new one — same accounts, same amounts, TB unchanged), the fill's fuel row + its one expense document move with it, audited;
 * the only direct posting-load write left is the fill-once NULL → load attach.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  repoint: "apps/backend/src/fuel/fuel-receipt-repoint.service.ts",
  reclass: "apps/backend/src/accounting/reclassify/reclassify.service.ts",
  creator: "apps/backend/src/driver-finance/settlement-creator.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const move = s.repoint.match(/export async function moveFuelReceiptToLoad\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/await applyReclassifyOnClient\(/.test(move)) p.push(`${F.repoint}: moveFuelReceiptToLoad must move the receipt through the reclassify engine`);
  if (!/FUEL_RECEIPT_REATTRIBUTED_EVENT/.test(move)) p.push(`${F.repoint}: a receipt move must be audited (fuel.receipt_reattributed_to_load)`);
  const postingWrites = s.repoint.match(/UPDATE accounting\.journal_entry_postings[\s\S]*?`/g) ?? [];
  if (postingWrites.some((w) => !/AND load_id IS NULL/.test(w)))
    p.push(`${F.repoint}: writes a posting's load directly beyond the fill-once NULL → load attach — moves go through the engine`);
  if (!/await reattributeFuelReceiptsForLoad\(client, \{ operatingCompanyId: input\.operatingCompanyId, loadId: input\.loadId/.test(s.repoint))
    p.push(`${F.repoint}: repointing receipts to a load must also re-attribute receipts already attached elsewhere`);
  if (!/p\.source_transaction_type === "fuel_event" && target\.to_load_id && !target\.to_item_id/.test(s.reclass))
    p.push(`${F.reclass}: the reclassify engine must accept a fuel_event receipt moving by load`);
  if (!/export async function moveFuelReceiptDocumentToLoad\(/.test(s.reclass) || !/relinkExpenseToLoadInClientTx\(/.test(s.reclass))
    p.push(`${F.reclass}: the fill's fuel row + expense document must move with the receipt (one link writer)`);
  if (!/await carryFuelReceiptToLoad\(client as never, \{/.test(s.creator))
    p.push(`${F.creator}: the Settlement Creator must bring an already-posted Relay receipt to its fuel row's load`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["move bypasses the engine", { repoint: base.repoint.replace("const batch = await applyReclassifyOnClient(", "const batch = await somethingElse(") }],
    ["direct posting load overwrite", { repoint: base.repoint + "\nconst x = `UPDATE accounting.journal_entry_postings SET load_id = $2::uuid WHERE id = $1::uuid`;\n" }],
    ["engine refuses fuel by load again", { reclass: base.reclass.replace('p.source_transaction_type === "fuel_event" && target.to_load_id && !target.to_item_id', "false") }],
    ["Creator stops carrying the receipt", { creator: base.creator.replace("await carryFuelReceiptToLoad(client as never, {", "void ({") }],
    ["repoint stops re-attributing", { repoint: base.repoint.replace("await reattributeFuelReceiptsForLoad(client, { operatingCompanyId: input.operatingCompanyId, loadId: input.loadId", "void ({ operatingCompanyId: input.operatingCompanyId, loadId: input.loadId") }],
  ];
  for (const [n, src] of plants) {
    const k = Object.keys(src)[0];
    if (src[k] === base[k]) {
      console.error(`SELFTEST FAIL: plant "${n}" did not apply`);
      process.exit(1);
    }
    if (!check(src).length) {
      console.error(`SELFTEST FAIL: plant "${n}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}
if (isMain) {
  const p = check();
  if (p.length) {
    console.error(`verify-fuel-receipt-follows-its-load: FAIL —\n  ${p.join("\n  ")}`);
    process.exit(1);
  }
  console.log("verify-fuel-receipt-follows-its-load: OK — posted fuel receipts follow their fill's load through the reclassify engine.");
}
