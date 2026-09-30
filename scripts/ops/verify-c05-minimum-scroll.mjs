#!/usr/bin/env node
/**
 * C-05 — MINIMUM-SCROLL LAW: list visible without document scroll.
 * Chrome locks to viewport (h-dvh); master-detail pages fill remaining height;
 * roster tables scroll via MASTER_DETAIL.listScrollClass (not max-h-[760px]).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c05-minimum-scroll.mjs --selftest");
  process.exit(0);
}

const tokens = read("apps/frontend/src/design/master-detail.ts");
if (!tokens.includes("pageShellClass:")) fail("master-detail missing pageShellClass");
if (!tokens.includes("listScrollClass:")) fail("master-detail missing listScrollClass");
if (!tokens.includes("min-h-0 flex-1")) fail("master-detail shell/list must use min-h-0 flex-1");
if (!/shellClass:[\s\S]{0,80}min-h-0 flex-1/.test(tokens)) fail("shellClass must include min-h-0 flex-1");
ok("C-05 MASTER_DETAIL fill-height tokens");

const shell = read("apps/frontend/src/components/Shell.tsx");
if (!shell.includes("h-dvh") && !shell.includes("h-screen")) fail("Shell must lock to viewport height (h-dvh)");
if (!shell.includes('data-c05-min-scroll="chrome"')) fail("Shell missing data-c05-min-scroll=chrome");
if (!shell.includes("overflow-hidden")) fail("Shell must overflow-hidden so document does not grow");
if (shell.includes("min-h-screen") && !shell.includes("h-dvh")) fail("Shell still uses min-h-screen without h-dvh lock");
ok("C-05 Shell viewport lock");

const mdShell = read("apps/frontend/src/components/layout/MasterDetailShell.tsx");
if (!mdShell.includes('data-c05-min-scroll="shell"')) fail("MasterDetailShell missing data-c05-min-scroll=shell");
ok("C-05 MasterDetailShell marked");

for (const [rel, label] of [
  ["apps/frontend/src/pages/Customers.tsx", "Customers"],
  ["apps/frontend/src/pages/Vendors.tsx", "Vendors"],
  ["apps/frontend/src/pages/Drivers.tsx", "Drivers"],
]) {
  const src = read(rel);
  if (!src.includes("MASTER_DETAIL.pageShellClass")) fail(`${label}: missing pageShellClass`);
  if (!src.includes("data-c05-min-scroll=")) fail(`${label}: missing data-c05-min-scroll`);
  ok(`C-05 ${label} page shell`);
}

for (const [rel, label] of [
  ["apps/frontend/src/pages/customers/CustomerListSidebar.tsx", "Customers sidebar"],
  ["apps/frontend/src/pages/vendors/VendorListSidebar.tsx", "Vendors sidebar"],
  ["apps/frontend/src/pages/drivers/DriverListSidebar.tsx", "Drivers sidebar"],
]) {
  const src = read(rel);
  if (src.includes("max-h-[760px]")) fail(`${label}: still uses fixed max-h-[760px]`);
  if (!src.includes("MASTER_DETAIL.listScrollClass")) fail(`${label}: missing listScrollClass`);
  if (!src.includes('data-c05-list-scroll="true"')) fail(`${label}: missing data-c05-list-scroll`);
  ok(`C-05 ${label} internal scroll`);
}

const header = read("apps/frontend/src/components/layout/PageHeader.tsx");
if (!header.includes("mb-2 shrink-0")) fail("PageHeader must be compact mb-2 shrink-0 (was mb-4)");
ok("C-05 PageHeader compact");

console.log("verify-c05-minimum-scroll --selftest OK");
