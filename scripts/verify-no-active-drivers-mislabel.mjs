#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const bankingPagesDir = path.join(repoRoot, "apps/frontend/src/pages/banking");
const failures = [];

function scanEscrowContext(relPath, source) {
  const escrowSection = source.match(/driver escrow visualizer[\s\S]{0,2500}/i);
  if (!escrowSection) {
    return;
  }
  if (/Active drivers/i.test(escrowSection[0])) {
    failures.push(`${relPath}: escrow visualizer must not label counts as "Active drivers"`);
  }
  // BANK-F91062 (bf76525c70, 2026-10-02): the Banking-home escrow card counts the GL ACCOUNTS holding escrow (Driver Escrow
  // and its per-driver sub-accounts — banking-kpi.service.ts escrow_held compare_label "Accounts holding escrow"), not
  // drivers, so "Accounts holding escrow" is the honest label there; the board keeps "Drivers with escrow:". Either honest
  // label passes; "Active drivers" (BANK-F6702's misleading count) still fails above.
  if (!/Drivers with escrow:|Accounts holding escrow/i.test(escrowSection[0])) {
    failures.push(`${relPath}: escrow visualizer must label the escrow count honestly ("Drivers with escrow:" or "Accounts holding escrow")`);
  }
}

function walk(dir, prefix = "") {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = path.join(prefix, entry.name);
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, rel);
      continue;
    }
    if (!/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      continue;
    }
    scanEscrowContext(path.join("apps/frontend/src/pages/banking", rel), fs.readFileSync(abs, "utf8"));
  }
}

walk(bankingPagesDir);

if (failures.length > 0) {
  console.error("verify:no-active-drivers-mislabel FAIL");
  for (const line of failures) {
    console.error(`  ${line}`);
  }
  process.exit(1);
}

console.log("verify:no-active-drivers-mislabel PASS");
