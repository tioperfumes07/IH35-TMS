#!/usr/bin/env node
/**
 * LV-MAINT-WO-CREATE-PRIMARY-OPENS
 * Maintenance home "+ Create Work Order" must open the wizard on primary click
 * (not only toggle a type submenu that looks like dead chrome).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "apps/frontend/src/pages/maintenance/components/QuickActionsBar.tsx");

function fail(msg) {
  console.error(`FAIL verify-maint-wo-create-primary-opens: ${msg}`);
  process.exit(1);
}

function assertSource(label, src) {
  if (/setMenuOpen|menuOpen/.test(src)) {
    fail(`${label}: still uses type submenu state — primary must open wizard`);
  }
  if (!/onCreate\(\s*["']pm["']\s*\)/.test(src)) {
    fail(`${label}: primary click must call onCreate("pm")`);
  }
  if (!/\+ Create Work Order/.test(src)) {
    fail(`${label}: missing + Create Work Order label`);
  }
}

function main() {
  assertSource("QuickActionsBar.tsx", fs.readFileSync(FILE, "utf8"));
  console.log("OK verify-maint-wo-create-primary-opens — primary opens Create WO wizard");
}

function selftest() {
  const bad = `const [menuOpen, setMenuOpen] = useState(false);\nonClick={() => setMenuOpen(true)}`;
  let failed = false;
  const orig = process.exit;
  process.exit = (code) => {
    failed = code === 1;
    throw new Error("exit");
  };
  try {
    assertSource("selftest-bad", bad);
  } catch {
    /* expected */
  }
  process.exit = orig;
  if (!failed) fail("selftest: submenu fixture did not fail");

  const ok = `onClick={() => onCreate("pm")}\n+ Create Work Order`;
  assertSource("selftest-ok", ok);

  const poisoned = fs.readFileSync(FILE, "utf8").replace(/onCreate\(\s*"pm"\s*\)/, "setMenuOpen(true)");
  failed = false;
  process.exit = (code) => {
    failed = code === 1;
    throw new Error("exit");
  };
  try {
    assertSource("selftest-poison", poisoned);
  } catch {
    /* expected */
  }
  process.exit = orig;
  if (!failed) fail("selftest: poison did not fail");
  console.log("OK verify-maint-wo-create-primary-opens --selftest");
}

if (process.argv.includes("--selftest")) selftest();
else main();
