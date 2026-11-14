#!/usr/bin/env node
/**
 * verify-dispatch-misc-back-ret — ROUND 8.20 board13/14.
 * Misc Dispatch leaves (not Overview View-all set) Back resolveBackHref.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-dispatch-misc-back-ret";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGES = [
  "apps/frontend/src/pages/dispatch/AssignmentHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/AvailableTrucksPage.tsx",
  "apps/frontend/src/pages/dispatch/AwaitingBolInvoicePage.tsx",
  "apps/frontend/src/pages/dispatch/BorderCrossingHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/DispatchAlertsPage.tsx",
  "apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx",
  "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx",
  "apps/frontend/src/pages/dispatch/ExpenseLoadConfirmationsPage.tsx",
  "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/LateArrivalsPage.tsx",
  "apps/frontend/src/pages/dispatch/LoadBankingLinkagePage.tsx",
  "apps/frontend/src/pages/dispatch/LoadHistoryPage.tsx",
  "apps/frontend/src/pages/dispatch/LoadsWithoutTourPage.tsx",
  "apps/frontend/src/pages/dispatch/MapView.tsx",
  "apps/frontend/src/pages/dispatch/NeedsDeliveryAuthorizationPage.tsx",
  "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  "apps/frontend/src/pages/dispatch/OcrQueuePage.tsx",
  "apps/frontend/src/pages/dispatch/OwnerOverrideLogPage.tsx",
  "apps/frontend/src/pages/dispatch/PlannerCalendarPage.tsx",
  "apps/frontend/src/pages/dispatch/PodReviewPage.tsx",
  "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx",
  "apps/frontend/src/pages/dispatch/TripProfitability.tsx",
  "apps/frontend/src/pages/dispatch/borders/BorderCrossingHistory.tsx",
];

export function check(src, file) {
  const f = [];
  if (!src) return [`${file} missing`];
  if (!/resolveBackHref/.test(src)) f.push(`${file}: must use resolveBackHref`);
  if (!/backHref=\{dispatchBackHref\}/.test(src)) f.push(`${file}: backHref must be dispatchBackHref`);
  if (/backHref="\/dispatch"/.test(src)) f.push(`${file}: still hardcodes backHref=/dispatch`);
  return f;
}

function selftest() {
  let pass = 0;
  const total = PAGES.length + 1;
  for (const file of PAGES) {
    const src = fs.readFileSync(path.join(ROOT, file), "utf8");
    if (check(src, file).length === 0) pass += 1;
    else console.error(`${LABEL} --selftest: live ${file} fails`, check(src, file));
  }
  const bare = fs.readFileSync(path.join(ROOT, PAGES[0]), "utf8").replace(
    /backHref=\{dispatchBackHref\}/,
    'backHref="/dispatch"',
  );
  if (check(bare, PAGES[0]).length > 0) pass += 1;
  else console.error(`${LABEL} --selftest: did not catch bare`);
  if (pass !== total) {
    console.error(`${LABEL} --selftest FAIL ${pass}/${total}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const f = [];
  for (const file of PAGES) {
    const src = fs.existsSync(path.join(ROOT, file)) ? fs.readFileSync(path.join(ROOT, file), "utf8") : "";
    f.push(...check(src, file));
  }
  if (f.length) {
    for (const x of f) console.error(`${LABEL}: FAIL — ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — dispatch misc leaf Backs resolve ret`);
}
