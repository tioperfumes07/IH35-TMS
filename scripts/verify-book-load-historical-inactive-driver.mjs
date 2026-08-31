#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  modal: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  api: "apps/frontend/src/api/dispatch.ts",
  routes: "apps/backend/src/dispatch/loads.routes.ts",
  service: "apps/backend/src/dispatch/book-load.service.ts",
};

const baseline = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(path.join(ROOT, file), "utf8")]));

function failures(src) {
  const out = [];
  const require = (key, token, message) => {
    if (!src[key].includes(token)) out.push(`${FILES[key]}: ${message}`);
  };

  require("modal", 'data-testid="book-load-historical-inactive-driver-id"', "missing separate historical driver-id input");
  require("modal", 'data-testid="book-load-historical-import-reason"', "missing explicit historical-import reason input");
  require("api", "historical_import_driver_id?: string", "client payload omits historical driver id");
  require("routes", "historical_import_driver_id: z.string().uuid().optional()", "route does not validate historical driver UUID");
  require("routes", "historical_import_reason: z.string().trim().min(10)", "route does not require a meaningful reason");
  require("service", 'input.requestingUserRole !== "Owner"', "historical path is not Owner-only");
  require("service", "historical_import_live_load_number_required", "historical path does not require a legacy load reference");
  require("service", "historical_import_driver_not_in_company", "historical driver is not company-scoped");
  require("service", "historical_import_driver_must_be_inactive", "historical path does not reject active drivers");
  require("service", "dispatch.historical_import_inactive_driver_attested", "historical assignment is not audited");
  require("service", 'attestation_scope: "historical_import_only"', "audit does not pin the narrow historical scope");
  require("service", "input.assigned_primary_driver_id !== historicalImportDriverId", "historical id can diverge from persisted driver FK");
  if ((src.service.match(/driverId !== historicalImportDriverId/g) ?? []).length < 2) {
    out.push(`${FILES.service}: historical exception must be isolated from both drug and qualification gates`);
  }
  require("service", "historical_import_solo_driver_only", "historical exception can be mixed with team assignment");
  return out;
}

if (process.argv.includes("--selftest")) {
  const plants = [
    ["modal", 'data-testid="book-load-historical-inactive-driver-id"', 'data-testid="removed-historical-driver-id"'],
    ["routes", "historical_import_reason: z.string().trim().min(10)", "historical_import_reason: z.string().optional()"],
    ["service", 'input.requestingUserRole !== "Owner"', 'input.requestingUserRole !== "Dispatcher"'],
    ["service", "historical_import_driver_not_in_company", "removed_driver_company_scope"],
    ["service", "dispatch.historical_import_inactive_driver_attested", "removed_historical_import_audit"],
    ["service", "driverId !== historicalImportDriverId", "driverId !== null"],
  ];
  for (const [key, from, to] of plants) {
    const mutated = { ...baseline, [key]: baseline[key].replaceAll(from, to) };
    if (mutated[key] === baseline[key] || failures(mutated).length === 0) {
      console.error(`verify-book-load-historical-inactive-driver SELFTEST FAIL — mutation not caught: ${key}:${from}`);
      process.exit(1);
    }
  }
  console.log(`verify-book-load-historical-inactive-driver SELFTEST PASS — ${plants.length}/${plants.length} planted regressions caught`);
  process.exit(0);
}

const problems = failures(baseline);
if (problems.length) {
  console.error("verify-book-load-historical-inactive-driver FAIL");
  for (const problem of problems) console.error(` - ${problem}`);
  process.exit(1);
}
console.log("verify-book-load-historical-inactive-driver PASS");
