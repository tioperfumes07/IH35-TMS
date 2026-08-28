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
const selftest = process.argv.includes("--selftest");

function placeholderSuppressesFailedFeeds(source) {
  const condition = source.match(/\{section\.placeholder\s*&&([\s\S]*?)\?\s*\(/)?.[1] ?? "";
  return /rows\.length\s*===\s*0/.test(condition)
    && /!\(section\.key\s*===\s*"in_shop"\s*&&\s*inShopUnitsQuery\.isError\)/.test(condition)
    && /!\(section\.key\s*===\s*"awaiting"\s*&&\s*unitsWithoutLoadQuery\.isError\)/.test(condition);
}

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
if (!/const awaitingTruckCount\s*=\s*boardSections\.find\(\(section\) => section\.key === "awaiting"\)\?\.rows\.length \?\? 0;/.test(board)) {
  fail("awaitingTruckCount must use the same filtered rows rendered in the Awaiting section");
}
if (/const awaitingTruckCount\s*=\s*unassignedUnits\.length/.test(board)) {
  fail("awaitingTruckCount must not count raw unassignedUnits because in-shop units are filtered from visible awaiting rows");
}
if (!board.includes("inShopUnitsQuery.isError")) {
  fail("DispatchBoard must branch on inShopUnitsQuery.isError for failed in-shop feed loads");
}
if (!board.includes("Couldn't load in-shop units")) {
  fail("in-shop feed failure must render an explicit error surface, not an empty placeholder");
}
if (!placeholderSuppressesFailedFeeds(board)) {
  fail("No units in shop placeholder must only render after a successful in-shop query with empty rows");
}

if (selftest) {
  const mutations = [
    board.replace('!(section.key === "in_shop" && inShopUnitsQuery.isError) &&', "true &&"),
    board.replace('!(section.key === "awaiting" && unitsWithoutLoadQuery.isError) ?', "true ?"),
  ];
  if (mutations.some((source) => placeholderSuppressesFailedFeeds(source))) {
    fail("selftest mutation escaped failed-feed empty-state exclusion");
  }
  console.log("PASS verify-dispatch-in-shop-feed-wired SELFTEST — 2/2 failed-feed empty-state mutations red");
  process.exit(0);
}

console.log("PASS verify-dispatch-in-shop-feed-wired");
