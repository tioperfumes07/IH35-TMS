#!/usr/bin/env node
/**
 * C-06 — Every page auto-adjusts to the viewport.
 * No fixed layout that forces document horizontal scroll.
 * Named surfaces: /customers /vendors /banking /cash-flow /maintenance /drivers.
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
  console.log("usage: node scripts/ops/verify-c06-viewport-auto-adjust.mjs --selftest");
  process.exit(0);
}

const shellCss = read("apps/frontend/src/styles/responsive-shell.css");
if (!shellCss.includes('[data-c06-viewport="true"]')) fail("responsive-shell.css missing C-06 viewport rule");
if (!shellCss.includes("max-width: 100vw")) fail("C-06 shell must cap at 100vw");
if (!shellCss.includes("overflow-x: hidden")) fail("C-06 shell must overflow-x:hidden");
if (!shellCss.includes("[data-c06-page]")) fail("C-06 page selector missing");
ok("C-06 responsive-shell.css viewport rules");

const shell = read("apps/frontend/src/components/Shell.tsx");
if (!shell.includes('data-c06-viewport="true"')) fail("Shell missing data-c06-viewport");
if (!shell.includes("min-w-0") || !shell.includes("max-w-full")) fail("UltraWideContainer must be min-w-0 max-w-full");
ok("C-06 Shell marked");

for (const [rel, key] of [
  ["apps/frontend/src/pages/Customers.tsx", "customers"],
  ["apps/frontend/src/pages/Vendors.tsx", "vendors"],
  ["apps/frontend/src/pages/Drivers.tsx", "drivers"],
  ["apps/frontend/src/pages/banking/BankingHome.tsx", "banking"],
  ["apps/frontend/src/pages/cash-flow/CashFlowPage.tsx", "cash-flow"],
  ["apps/frontend/src/pages/maintenance/MaintenanceHome.tsx", "maintenance"],
]) {
  const src = read(rel);
  if (!src.includes(`data-c06-page="${key}"`)) fail(`${rel} missing data-c06-page=${key}`);
  ok(`C-06 ${key} page marked`);
}

console.log("verify-c06-viewport-auto-adjust --selftest OK");
