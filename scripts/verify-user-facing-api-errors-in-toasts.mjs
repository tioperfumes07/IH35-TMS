#!/usr/bin/env node
/**
 * CLS-BARE-ERROR — operator toasts must use userFacingApiError for API failures.
 *
 * Ratchets the non-money surfaces already converted so they cannot regress to
 * raw `error.message` / `err.message` toasts. CU-09 wants the machine code hidden
 * from operators; `userFacingApiError` falls back through message/blocker/detail
 * and humanizes bare `E_*` codes.
 *
 * Run: node scripts/verify-user-facing-api-errors-in-toasts.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-facing-api-errors-in-toasts";

// Files converted to userFacingApiError for API-catch toasts. Keep this list
// exact; add a file only after every API error toast in it uses the helper.
const RATCHETED_FILES = [
  "apps/frontend/src/components/catalogs/CatalogExcelUploadModal.tsx",
  "apps/frontend/src/components/FleetTable.tsx",
  "apps/frontend/src/components/drivers/CreateDriverModal.tsx",
  "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx",
  "apps/frontend/src/pages/safety/eld/EldAuditTrailViewer.tsx",
  "apps/frontend/src/pages/safety/components/CargoClaimIntakeSurface.tsx",
  "apps/frontend/src/pages/reports/FuelReconciliationPage.tsx",
  "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx",
  "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
];

const RAW_PATTERNS = [
  /setUploadError\([^)]*(?:error|err)\.message[^)]*\)/,
  /setError\([^)]*(?:error|err)\.message[^)]*\)/,
  /pushToast\([^)]*error\.(message|toString\(\))[^)]*\)/,
  /pushToast\([^)]*err\.(message|toString\(\))[^)]*\)/,
  /pushToast\([^)]*firstError\.(message|toString\(\))[^)]*\)/,
  /pushToast\(\`[^`]*\$\{[^}]*\.(message|toString\(\))[^}]*\}[^`]*\`/,
];

export function assertFile(relPath, src) {
  const errors = [];
  let rawHit = false;
  for (const line of src.split("\n")) {
    // Cap-exceeded toasts are local validation, not API error responses.
    if (/onCapExceeded|CapExceeded/i.test(line)) continue;
    for (const re of RAW_PATTERNS) {
      if (re.test(line)) {
        rawHit = true;
        break;
      }
    }
  }
  if (rawHit) {
    errors.push(`${relPath}: still surfaces a raw error.message in pushToast`);
  }
  if (!src.includes("userFacingApiError")) {
    errors.push(`${relPath}: missing userFacingApiError import/usage`);
  }
  return errors;
}

function selftest() {
  const good = `
import { userFacingApiError } from "../lib/api-error-message";
function show(err) {
  pushToast(userFacingApiError(err, "Invite failed"), "error");
}
`;
  const bad = `
import { userFacingApiError } from "../lib/api-error-message";
function show(err) {
  pushToast(error instanceof Error ? error.message : "Invite failed", "error");
}
`;
  let failed = 0;
  for (const [name, src, wantErrors] of [
    ["uses helper", good, 0],
    ["raw error.message", bad, 1],
  ]) {
    const n = assertFile("test.tsx", src).length;
    const ok = n === wantErrors;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${name}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

let allErrors = [];
for (const rel of RATCHETED_FILES) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    allErrors.push(`${rel}: file not found`);
    continue;
  }
  const src = fs.readFileSync(p, "utf8");
  allErrors = allErrors.concat(assertFile(rel, src));
}

if (allErrors.length) {
  console.error(`[${LABEL}] FAILED — ${allErrors.length} issue(s):`);
  for (const e of allErrors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — ${RATCHETED_FILES.length} non-money surfaces use userFacingApiError for API toasts.`);
