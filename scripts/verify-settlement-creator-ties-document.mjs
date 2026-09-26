#!/usr/bin/env node
/**
 * R-186.2 — Settlement Creator ties documents (Company + Driver AlwaysTrack PDFs).
 *
 * Static contract:
 * 1. Half-page ParityDrawer dual columns (Company | Driver), opened via ?creator=1.
 * 2. Preview/Post refuse until company EXPENSES and driver TOTAL DUE match typed PDF cents
 *    (service already on main from R-186).
 * 3. Drawer separates Comp. Exp. / Drv reimbursements / Additional pay / Escrow / control totals.
 * 4. Drv UI copy requires Cr 2175 (never 6890/5310); Comp. Exp. credits card rail.
 *
 * BE invoice/Faro/2175 JE legs land in a follow-up once LIVE driver-finance domain guards
 * (purge-era closures) are green — this guard never baselines those reds.
 *
 * Self-test: node scripts/verify-settlement-creator-ties-document.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-ties-document";

const DRAWER = path.join(ROOT, "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx");
const SERVICE = path.join(ROOT, "apps/backend/src/driver-finance/settlement-creator.service.ts");
const SIZING = path.join(ROOT, "apps/frontend/src/components/parity/sizing.ts");
const SETTLEMENTS_PAGE = path.join(ROOT, "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx");
const TOPBAR = path.join(ROOT, "apps/frontend/src/components/Topbar.tsx");

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

function runChecks() {
  const failures = [];
  const drawer = read(DRAWER);
  const service = read(SERVICE);
  const sizing = read(SIZING);
  const settlementsPage = read(SETTLEMENTS_PAGE);
  const topbar = read(TOPBAR);

  assert(/PARITY_DRAWER_WIDTH_HALF|size="half"/.test(drawer), "Drawer must open ParityDrawer size=half", failures);
  assert(/PARITY_DRAWER_WIDTH_HALF/.test(sizing), "sizing.ts must export PARITY_DRAWER_WIDTH_HALF (~50vw)", failures);
  assert(/sc-dual-columns|Company Settlement/.test(drawer) && /Driver Settlement/.test(drawer),
    "Drawer must render Company + Driver columns", failures);
  assert(/SettlementCreatorDrawer/.test(settlementsPage) && /creator=1|creatorOpen/.test(settlementsPage),
    "SettlementsPage must open SettlementCreatorDrawer via ?creator=1", failures);
  assert(/settlements\?creator=1/.test(topbar), "Topbar Create → Settlement Creator must open ?creator=1 panel", failures);

  assert(/company_expenses_matches_pdf/.test(service) && /driver_net_matches_pdf/.test(service),
    "Service preview must compare company + driver PDF control totals", failures);
  assert(/can_post/.test(service) && /pdf_company_expenses_cents/.test(service) && /pdf_driver_net_cents/.test(service),
    "Post must stay disabled until PDF cents match", failures);
  assert(/allowPost/.test(drawer) && /sc-post/.test(drawer),
    "Drawer Post must be gated (owner Preview-first / allowPost)", failures);

  assert(/2175/.test(drawer) && /never 6890\/5310/.test(drawer),
    "Drawer Drv section must require Cr 2175 (never 6890/5310)", failures);
  assert(/Comp\. Exp\. Cr card|cardRailNumber|2510|1295/.test(service),
    "Comp. Exp. must credit card rail 2510/1295 on service", failures);
  assert(/Company expenses|Comp\./.test(drawer) && /Driver-paid reimbursements|Drv/.test(drawer),
    "Drawer must separate Company expenses (Comp.) from Driver-paid reimbursements (Drv)", failures);
  assert(/Escrow/.test(drawer) && /Additional pay/.test(drawer),
    "Drawer must include Escrow and Additional pay sections", failures);
  assert(/not_yet_delivered|Not delivered/.test(drawer),
    "Drawer must support not-delivered loads (no invoice until delivered)", failures);
  assert(/formatAccountDisplayLabel/.test(drawer),
    "JE preview must hide account numbers by default (formatAccountDisplayLabel)", failures);

  return failures;
}

if (process.argv.includes("--selftest")) {
  const failures = runChecks();
  if (failures.length) {
    console.error(`${LABEL} --selftest: unexpected failures on current tree:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: PASS`);
  process.exit(0);
}

const failures = runChecks();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — half-panel Creator, PDF control totals, Comp/Drv/Escrow sections wired`);
process.exit(0);
