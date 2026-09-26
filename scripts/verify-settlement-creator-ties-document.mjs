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

  // R-186.2 follow-on — Love's / fuel_stop catalog feeds Creator Location (AT settlement shape).
  assert(/FuelStopLocationPicker/.test(drawer),
    "Drawer fuel/expense Location must use FuelStopLocationPicker (mdata.locations fuel_stop)", failures);
  assert(/sc-fuel-location|formatFuelStopLocationLabel/.test(drawer),
    "Drawer must bind fuel Location to AlwaysTrack-style fuel-stop labels", failures);
  assert(/kind=\"vendor\"/.test(drawer) && /sc-fuel-vendor/.test(drawer),
    "Fuel Vendor must be EntityPicker kind=vendor (catalog), not free text", failures);
  assert(/kind=\"trailer\"/.test(drawer) && /sc-trailer/.test(drawer),
    "Header Trailer must be EntityPicker kind=trailer (catalog)", failures);
  assert(/kind=\"customer\"/.test(drawer),
    "Load Customer must be EntityPicker kind=customer", failures);
  assert(/fieldGridClass|grid-cols-2 gap-2/.test(drawer),
    "Creator fields must use equal paired grid (gap-2, 2-col)", failures);
  assert(/item_id/.test(drawer) && !/ReferenceSelect[\s\S]{0,80}value=\{null\}/.test(drawer),
    "Comp./Drv Item ReferenceSelect must keep selected item_id (never value={null})", failures);
  assert(/Drv reimb Cr 2175|2175/.test(service),
    "Service preview must project Drv reimbursements to Cr 2175", failures);

  // Owner 2026-09-26 — Creator creates NEW only: auto next load # + AlwaysTrack settlement #, Edit unlock.
  assert(/peekNextLoadNumber/.test(drawer) && /peekNextSettlementNumber/.test(drawer),
    "Drawer must peek next load # + next AlwaysTrack settlement # on open", failures);
  assert(/sc-load-number-edit|sc-settlement-no-edit/.test(drawer) && /readOnly=\{!/.test(drawer),
    "Load No. and Settlement No. must be read-only until Edit", failures);
  assert(/nextSequentialLoadNumber|addLoadRow/.test(drawer),
    "Add Load must continue the numeric sequence automatically", failures);
  assert(/load_already_exists/.test(fs.readFileSync(path.join(ROOT, "apps/backend/src/driver-finance/settlement-creator-seed-loads.ts"), "utf8")),
    "Seed path must refuse existing load numbers (Creator books NEW only)", failures);
  assert(/allocateNextSettlementSourceDocumentRef/.test(service) && /never attach to driver's existing open/.test(service),
    "Post empty must mint next AlwaysTrack source_document_ref (never attach to driver open / never default P-series)", failures);
  assert(/peekNextSettlementSourceDocumentRef/.test(fs.readFileSync(path.join(ROOT, "apps/backend/src/driver-finance/settlement-source-document-ref.service.ts"), "utf8")),
    "source-document-ref service must export peekNextSettlementSourceDocumentRef", failures);
  assert(/next_number/.test(fs.readFileSync(path.join(ROOT, "apps/frontend/src/api/settlementCreator.ts"), "utf8")),
    "FE peek API must read next_number (AlwaysTrack digits), not next_display_id P-series", failures);

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
