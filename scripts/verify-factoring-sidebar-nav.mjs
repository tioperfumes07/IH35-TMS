#!/usr/bin/env node
// Guard (FACTORING NAV): the sidebar FACT module must land on the factoring-only
// workspace (/factoring), NOT /accounting/factoring (which renders the full Accounting
// subnav — the "bleed"). Accounting's own nav (AP/AR/Vendors/Collections/Sales Tax/
// Bill Payment) must stay intact — this is a route re-point only, nothing removed.
import { readFileSync } from "node:fs";

const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const SUBNAV = "apps/frontend/src/pages/accounting/subnav-manifest.ts";
const failures = [];

let sidebar = "";
try {
  sidebar = readFileSync(SIDEBAR, "utf8");
} catch {
  failures.push(`${SIDEBAR}: missing`);
}
if (sidebar) {
  const m = sidebar.match(/factoring:\s*\{[^}]*label:\s*"FACT"[^}]*\}/);
  if (!m) {
    failures.push(`${SIDEBAR}: FACT sidebar module entry not found`);
  } else if (!/to:\s*"\/factoring"/.test(m[0])) {
    failures.push(`${SIDEBAR}: FACT module must point to "/factoring" (factoring-only workspace), not /accounting/factoring`);
  }
}

// Accounting subnav must remain intact (not gutted to "fix" the bleed).
let subnav = "";
try {
  subnav = readFileSync(SUBNAV, "utf8");
} catch {
  failures.push(`${SUBNAV}: missing — Accounting subnav must remain`);
}
if (subnav) {
  // Sentinel: a tab that lives in the shared Accounting subnav must still be there
  // (we only re-pointed the sidebar link — we did NOT prune the Accounting nav).
  if (!subnav.includes("Vendors")) {
    failures.push(`${SUBNAV}: Accounting subnav lost "Vendors" — nothing should be removed`);
  }
}

if (failures.length) {
  console.error("verify:factoring-sidebar-nav — FAIL");
  for (const f of failures) console.error("  - " + f);
  process.exit(1);
}
console.log("verify:factoring-sidebar-nav — OK (FACT → /factoring; Accounting subnav intact)");
