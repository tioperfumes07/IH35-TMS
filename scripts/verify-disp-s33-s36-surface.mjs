#!/usr/bin/env node
/** DISP-S33…S36 — pre-settlements / settings / settlements / trip-pairing honest empty. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-disp-s33-s36-surface";
const SELFTEST = process.argv.includes("--selftest");

const FILES = {
  dispatch: "apps/frontend/src/pages/Dispatch.tsx",
  panel: "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx",
  settings: "apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx",
  trip: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx",
  manifest: "apps/frontend/src/routes/manifest.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertLive() {
  const problems = [];
  const manifest = read(FILES.manifest);
  const dispatch = read(FILES.dispatch);
  const panel = read(FILES.panel);
  const settings = read(FILES.settings);
  const trip = read(FILES.trip);

  if (!/path="\/dispatch\/pre-settlements"/.test(manifest)) problems.push("S33 route missing");
  if (!/path="\/dispatch\/settings"/.test(manifest)) problems.push("S34 route missing");
  if (!/path="\/dispatch\/settlements"/.test(manifest)) problems.push("S35 route missing");
  if (!/path="\/dispatch\/trip-pairing"/.test(manifest)) problems.push("S36 route missing");

  if (!/data-testid="dispatch-pre-settlements-need-company"/.test(dispatch)) problems.push("S33 need-company");
  if (!/ListErrorBanner/.test(dispatch) || !/preSettlementsQuery\.isError/.test(dispatch)) {
    problems.push("S33 ListErrorBanner on pre-settlements");
  }
  if (!/data-testid="dispatch-pre-settlements-honest-empty"/.test(panel)) problems.push("S33 honest empty");
  if (!/enabled:\s*Boolean\(defaultCompanyIds\[0\]\)/.test(dispatch)) problems.push("S33 query not company-gated");

  if (!/data-testid="dispatch-settings-need-company"/.test(settings)) problems.push("S34 need-company");
  if (!/ListErrorBanner/.test(settings)) problems.push("S34 ListErrorBanner");
  if (!/useCompanyContext/.test(settings)) problems.push("S34 missing company context");

  if (!/data-testid="dispatch-settlements-need-company"/.test(dispatch)) problems.push("S35 need-company");
  if (!/data-testid="dispatch-settlements-honest-empty"/.test(dispatch)) problems.push("S35 honest empty");

  if (!/data-testid="dispatch-trip-pairing-need-company"/.test(trip)) problems.push("S36 need-company");
  if (!/data-testid="dispatch-trip-pairing-honest-empty"/.test(trip)) problems.push("S36 honest empty");
  if (!/ListErrorBanner/.test(trip)) problems.push("S36 ListErrorBanner");
  if (!/enabled:\s*Boolean\(companyId\)/.test(trip)) problems.push("S36 not company-gated");
  if (!/aria-label=\{`Book Southbound return for \$\{t\.unit_number/.test(trip)) {
    problems.push("S36 open-return action is not an accessible button");
  }
  if (!/onClick=\{\(\) => setBookUnitId\(t\.unit_id\)\}/.test(trip)) {
    problems.push("S36 open-return action does not open Book Load for the tour unit");
  }
  if (!/tours\.find\(\(tour\) => tour\.unit_id === bookUnitId\)\?\.driver_id/.test(trip)) {
    problems.push("S36 open-return Book Load does not preserve the assigned driver");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const pagePath = path.join(ROOT, FILES.trip);
  const orig = fs.readFileSync(pagePath, "utf8");
  fs.writeFileSync(
    pagePath,
    orig.replace(/onClick=\{\(\) => setBookUnitId\(t\.unit_id\)\}/, 'data-noop="open-return"'),
  );
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(pagePath, orig);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
