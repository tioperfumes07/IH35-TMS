#!/usr/bin/env node
// U24 (owner, 2026-10-03) — "Reclassify: three selectors — by account, by item, by load". Static.
//   1. the engine takes to_item_id / to_load_id (expense and bill lines), the item's account follows the item
//   2. a load move re-stamps the reclass legs: reversing leg = old load, repost = new load (LAW 363.3)
//   3. the batch records from/to item and load (202615380600) and undo restores them
//   4. the register's Reclassify form offers Change item / Change load
import { readFileSync } from "node:fs";

const LABEL = "verify-reclassify-by-item-and-load";
const fails = [];
const svc = readFileSync("apps/backend/src/accounting/reclassify/reclassify.service.ts", "utf8");
const je = readFileSync("apps/backend/src/accounting/journal-entries.service.ts", "utf8");
const page = readFileSync("apps/frontend/src/pages/accounting/ReclassifyTransactionsPage.tsx", "utf8");
const mig = readFileSync("db/migrations/202615380600_reclassify_by_item_and_load.sql", "utf8");
const need = [
  [svc, /target\.to_account_id = it\.rows\[0\]\.acct;/, "an item move no longer carries the item's account"],
  [svc, /load_id: target\.to_load_id \? \(p\.load_id \?\? null\) : undefined/, "the reversing leg no longer keeps the old load"],
  [svc, /load_id: target\.to_load_id \?\? undefined,/, "the repost leg no longer carries the new load"],
  [svc, /from_item_id, to_item_id, from_load_id, to_load_id\)/, "batch lines no longer record from/to item and load"],
  [svc, /const itemMoved = l\.to_item_id !== l\.from_item_id;/, "undo no longer restores an item / load move"],
  [svc, /by item and by load apply to expense and bill lines/, "item / load moves are no longer limited to expense and bill lines"],
  [je, /COALESCE\(\$15::uuid, accounting\.posting_source_load_id\(\$13::text, \$14::text\)\)/, "the JE writer no longer accepts an explicit leg load stamp"],
  [page, /data-testid="reclassify-to-item"/, "the Reclassify form lost Change item"],
  [page, /data-testid="reclassify-to-load"/, "the Reclassify form lost Change load"],
  [mig, /ADD COLUMN IF NOT EXISTS from_load_id uuid/, "202615380600 lost the batch-line load columns"],
];
for (const [src, re, msg] of need) if (!re.test(src)) fails.push(msg);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — reclassify by item (account follows) and by load (legs re-stamped old -> new), recorded and undoable`);
