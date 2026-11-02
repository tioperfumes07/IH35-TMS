#!/usr/bin/env node
/** Banking Reconciliation tab outer chrome must be BoardSection (fill-not-shell). */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/banking/components/ReconciliationTabContent.tsx";
const src = fs.readFileSync(FILE, "utf8");

function fail(msg) {
  console.error(`verify-banking-recon-board-section FAIL: ${msg}`);
  process.exit(1);
}

if (!/import \{ BoardSection \}/.test(src)) fail("must import BoardSection");
if (!/testId="banking-recon-board"/.test(src)) fail("BoardSection testId banking-recon-board required");
if (!/data-testid="banking-recon-shell"/.test(src)) fail("keep banking-recon-shell testId");

if (process.argv.includes("--selftest")) {
  const broken = src.replace('testId="banking-recon-board"', 'testId="banking-recon-bare"');
  if (/testId="banking-recon-board"/.test(broken)) fail("selftest replace failed");
  console.log("verify-banking-recon-board-section --selftest PASS");
  process.exit(0);
}

console.log("verify-banking-recon-board-section PASS");
