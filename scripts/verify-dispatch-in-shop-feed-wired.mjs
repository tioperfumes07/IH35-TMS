#!/usr/bin/env node
// DISPATCH-IN-SHOP-FEED guard — the List/Table "In shop" section must bind to the live maintenance
// fleet-table feed, NOT a hardcoded placeholder or empty fixture array in the production path.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf8");
const fail = (m) => {
  console.error(`FAIL verify-dispatch-in-shop-feed-wired: ${m}`);
  process.exit(1);
};

const api = read("apps/frontend/src/api/dispatch.ts");
if (!api.includes("listDispatchInShopUnits")) fail("dispatch api must export listDispatchInShopUnits");
if (!api.includes("isDispatchInShopUnit")) fail("dispatch api must export isDispatchInShopUnit");
if (!api.includes("/api/v1/maintenance/fleet-table/rows")) {
  fail("in-shop feed must use existing /api/v1/maintenance/fleet-table/rows endpoint");
}

const board = read("apps/frontend/src/pages/dispatch/DispatchBoard.tsx");
if (board.includes("In-shop (maintenance) feed pending")) {
  fail("hardcoded in-shop placeholder text must be removed");
}
if (!board.includes("listDispatchInShopUnits")) fail("DispatchBoard must fetch in-shop units via listDispatchInShopUnits");
if (!board.includes("isDispatchInShopUnit")) fail("DispatchBoard must filter in-shop units with isDispatchInShopUnit");
if (!board.includes("inShopUnitToBoardRow")) fail("DispatchBoard must map in-shop units via inShopUnitToBoardRow");
if (!/meta\.key === "in_shop"[\s\S]{0,120}\? inShopRows/.test(board)) {
  fail('boardSections must wire meta.key === "in_shop" to inShopRows (not an empty [] stub)');
}
if (/key:\s*"in_shop"[\s\S]{0,200}rows:\s*\[\]/.test(board)) {
  fail("in_shop section must not hardcode rows: [] in SECTION_META / boardSections");
}

console.log("PASS verify-dispatch-in-shop-feed-wired");
