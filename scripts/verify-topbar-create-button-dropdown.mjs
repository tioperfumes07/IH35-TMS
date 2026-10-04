#!/usr/bin/env node
/**
 * Topbar global Create button must open a dropdown menu with navigation items.
 * HEADER-CREATE-BUTTON-DEAD-CLICK guard — the button was a dead click on some
 * pages because it had no handler. Now it toggles a dropdown with create actions.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const LABEL = "verify-topbar-create-button-dropdown";
const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/Topbar.tsx");

export function audit(src) {
  const failures = [];

  // Required: Create button with onClick toggling createOpen
  if (!src.includes("setCreateOpen((v) => !v)")) {
    failures.push("Topbar Create button missing onClick toggle for createOpen");
  }

  // Required: createOpen state
  if (!src.includes("createOpen")) {
    failures.push("Topbar missing createOpen state");
  }

  // Required: dropdown menu with data-testid
  if (!src.includes('data-testid="global-create-menu"')) {
    failures.push("Topbar missing global-create-menu dropdown");
  }

  // Required: at least Customer and Invoice create actions
  if (!src.includes("/customers?create=1")) {
    failures.push("Topbar Create menu missing Customer create action");
  }
  if (!src.includes("/accounting/invoices?create=1")) {
    failures.push("Topbar Create menu missing Invoice create action");
  }

  // Required: outside-click handler
  if (!src.includes("createMenuRef")) {
    failures.push("Topbar missing createMenuRef for outside-click close");
  }

  // BANK-F91417 leftover refuse — Topbar page-scoped text token ratchet
  if (src.includes("text-[11px]")) {
    failures.push("Topbar leftover text-[11px] — use text-xs");
  }
  if (src.includes("#8A92AB")) {
    failures.push("Topbar leftover #8A92AB — use #4B5563");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const src = readFileSync(filePath, "utf8");
  if (audit(src).length) {
    console.error(`${LABEL} selftest FAIL: live Topbar already failing audit`);
    process.exit(1);
  }
  const badToggle = src.replace("setCreateOpen((v) => !v)", "setCreateOpen(v => v)");
  if (audit(badToggle).length === 0) {
    console.error(`${LABEL} selftest FAIL: createOpen toggle plant escaped`);
    process.exit(1);
  }
  // BANK-F91417 leftover plant — Topbar page-scoped text token ratchet
  const leftoverPlant = src + '\n<p className="text-[11px] text-[#8A92AB]">plant</p>\n';
  if (!audit(leftoverPlant).some((f) => f.includes("leftover"))) {
    console.error(`${LABEL} selftest FAIL: leftover text-[11px]/#8A92AB plant escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest PASS — create toggle + leftover plants detected`);
  process.exit(0);
}

const failures = audit(readFileSync(filePath, "utf8"));
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log(`${LABEL}: OK — Topbar Create button toggles dropdown with create actions`);
process.exit(0);
