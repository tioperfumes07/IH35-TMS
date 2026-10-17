#!/usr/bin/env node
/**
 * LEAD 443.186 — the three expense-line writer defects CC-2's harness found, closed at the writer.
 *
 *   1. insertExpenseLine (the one INSERT of accounting.expense_lines) completes every line from evidence on its own
 *      document before writing: company + driver/unit/trailer from its header (line on the header's load), account
 *      from its item's default expense account (caller value wins; no item → nothing guessed).
 *   2. The work-order expense copy names the line's item + the item's account + quantity x rate, and refuses an
 *      item-less line (wo_line_item_required) — the same rule as the work-order bill copy.
 *   3. The lumper cash-advance split line names the "Warehouse Lumper Expense" item (exactly one) and its header the
 *      advance's driver + the load's same-entity unit.
 *   4. The settlement-seed expense line carries its load's driver + unit, the same as its header.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const F = {
  writer: "apps/backend/src/accounting/expense-writer.service.ts",
  wo: "apps/backend/src/maintenance/two-section-service.ts",
  lumper: "apps/backend/src/cash-advances/lumper-cash-advance-split.ts",
  seed: "apps/backend/src/feed/seed-settlement-document.service.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");

export function check(src = {}) {
  const s = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, src[k] ?? read(rel)]));
  const p = [];
  const ins = s.writer.match(/export async function insertExpenseLine\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/row = await completeExpenseLine\(client, row\);/.test(ins)) p.push(`${F.writer}: insertExpenseLine must complete the line (completeExpenseLine) before the INSERT (1)`);
  const comp = s.writer.match(/export async function completeExpenseLine\([\s\S]*?\n\}/)?.[0] ?? "";
  if (!/FROM accounting\.expenses WHERE id = \$1::uuid/.test(comp) || !/out\.driver_id == null && hdr\.d/.test(comp) || !/out\.unit_id == null && hdr\.u/.test(comp) || !/out\.operating_company_id == null && hdr\.co/.test(comp))
    p.push(`${F.writer}: completeExpenseLine must take company + driver/unit from the line's header (1)`);
  if (!/default_expense_account_id::text AS a FROM catalogs\.items WHERE id = \$1::uuid AND operating_company_id = \$2::uuid/.test(comp) || !/out\.expense_account_uuid == null && out\.item_id/.test(comp))
    p.push(`${F.writer}: completeExpenseLine must take a missing account from the line's item (same company) (1)`);
  const woExp = s.wo.slice(s.wo.indexOf("LEAD 443.186 — the expense branch"), s.wo.indexOf("return { rows: lineId ? [{ id: lineId }] : [] };"));
  if (!/"wo_line_item_required"/.test(woExp) || !/item_id: row\.item_id,/.test(woExp) || !/expense_account_uuid: row\.item_account_id,/.test(woExp))
    p.push(`${F.wo}: the work-order expense copy must name the line's item + its account and refuse an item-less line (2)`);
  if (!/item_id: lumperItem\[0\]!\.id,/.test(s.lumper) || !/LUMPER_EXPENSE_ITEM_NAME/.test(s.lumper) || !/driver_uuid: \(adv\.rows\[0\]/.test(s.lumper) || !/sameEntityLoadUnitSql\(/.test(s.lumper))
    p.push(`${F.lumper}: the lumper split must name its item and its header the advance's driver + the load's unit (3)`);
  // 443.182 C step 2 — the seed line is written by the one expense engine (writeExpenseDocumentInClientTx … lines: [ … ]);
  // the older inline insertExpenseLine form is still accepted. Same rule: the line carries the load's driver + unit.
  const inlineAt = s.seed.indexOf("await insertExpenseLine(client, {");
  const engineAt = s.seed.indexOf("lines: [", Math.max(0, s.seed.indexOf("writeExpenseDocumentInClientTx(")));
  const seedStart = inlineAt >= 0 ? inlineAt : engineAt;
  const seedLine = seedStart >= 0 ? s.seed.slice(seedStart, s.seed.indexOf("expense_account_uuid: item.expenseAccountId,", seedStart)) : "";
  if (!/driver_id: fromLoad\.driver_id,/.test(seedLine) || !/unit_id: fromLoad\.assigned_unit_id,/.test(seedLine))
    p.push(`${F.seed}: the seeded expense line must carry its load's driver + unit (4)`);
  return p;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain && process.argv.includes("--selftest")) {
  const base = Object.fromEntries(Object.entries(F).map(([k, rel]) => [k, read(rel)]));
  if (check().length) {
    console.error("SELFTEST FAIL: baseline not clean", check());
    process.exit(1);
  }
  const plants = [
    ["writer skips completion", { writer: base.writer.replace("row = await completeExpenseLine(client, row);", "") }],
    ["no account from item", { writer: base.writer.replace("out.expense_account_uuid == null && out.item_id", "false && out.item_id") }],
    ["no driver from header", { writer: base.writer.replace("out.driver_id == null && hdr.d", "false && hdr.d") }],
    ["WO line without item", { wo: base.wo.replace("            item_id: row.item_id,\n            expense_account_uuid: row.item_account_id,\n", "") }],
    ["lumper without item", { lumper: base.lumper.replace("item_id: lumperItem[0]!.id,", "") }],
    ["seed line without driver", { seed: base.seed.replace(/\n[ \t]*driver_id: fromLoad\.driver_id,(?=\n[ \t]*unit_id: fromLoad\.assigned_unit_id,\n[ \t]*expense_account_uuid)/, "") }],
  ];
  for (const [n, src] of plants) {
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
    console.error(`verify-expense-line-writers-complete FAIL (${p.length}):`);
    for (const x of p) console.error(`  ${x}`);
    process.exit(1);
  }
  console.log("verify-expense-line-writers-complete PASS: every expense line is complete from its own document (account from item, driver/unit from header/load, lumper item) (443.186)");
}
