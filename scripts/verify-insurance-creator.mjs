#!/usr/bin/env node
/** Ratchets vendor creation, unit FKs, allocation, and atomic policy submit. */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  wizard: resolve(ROOT, "apps/frontend/src/components/insurance/PolicyCreateWizard.tsx"),
  hook: resolve(ROOT, "apps/frontend/src/components/insurance/useCostPerVehicle.ts"),
  service: resolve(ROOT, "apps/backend/src/insurance/policy-create-atomic.service.ts"),
  route: resolve(ROOT, "apps/backend/src/insurance/policy-create-atomic.routes.ts"),
  api: resolve(ROOT, "apps/frontend/src/api/insurance.ts"),
};
const CHECKS = [
  ["wizard:create-wording", "wizard", /\+\s*Create policy/],
  ["wizard:cost-per-vehicle", "wizard", /costPerVehicleDisplay/],
  ["wizard:equal-split", "wizard", /equal_split/],
  ["wizard:pro-rata", "wizard", /pro_rata/],
  ["wizard:weighted", "wizard", /weighted/],
  ["wizard:equal-split-default", "wizard", /equal_split.*default|default.*equal_split|allocation_method.*equal_split/],
  ["wizard:term-months", "wizard", /term_months|termMonths/],
  ["wizard:unit-ids", "wizard", /unit_ids|unitIds/],
  ["wizard:zero-unit-guard", "wizard", /selectedUnits\.length\s*===\s*0/],
  ["wizard:vendor-picker", "wizard", /<EntityPicker[\s\S]{0,180}kind=["']vendor["']/],
  ["wizard:nested-vendor-create", "wizard", /<EntityPicker[\s\S]{0,260}kind=["']vendor["'][\s\S]{0,260}allowCreate[\s\S]{0,260}nestedInDrawer/],
  ["wizard:vendor-not-found-ux", "wizard", /insurance_vendor_not_found/],
  ["hook:cost-per-month", "hook", /costPerVehiclePerMonth/],
  ["hook:equal-split", "hook", /equal_split/],
  ["hook:display-export", "hook", /costPerVehicleDisplay/],
  ["service:idempotency", "service", /idempotencyKey|idempotency_key/],
  ["service:equal-split", "service", /equal_split/],
  ["service:pro-rata", "service", /pro_rata/],
  ["service:weighted", "service", /weighted/],
  ["service:term-months", "service", /termMonths|term_months/],
  ["service:single-transaction", "service", /withCurrentUser/],
  ["route:with-bills", "route", /\/with-bills/],
  ["route:term-months", "route", /term_months/],
  ["route:allocation-method", "route", /allocation_method/],
  ["route:unit-ids", "route", /unit_ids/],
  ["api:create-with-bills", "api", /createPolicyWithBills/],
  ["api:allocation-type", "api", /AllocationMethod/],
  ["api:equal-split", "api", /equal_split/],
];

export function collectProblems(sources) {
  const problems = [];
  for (const [id, key, pattern] of CHECKS) if (!pattern.test(sources[key] ?? "")) problems.push(id);
  for (const key of ["wizard", "api"]) {
    if (/\+\s*New\s+[Pp]olicy|\+\s*Add\s+[Pp]olicy/.test(sources[key] ?? "")) problems.push(`${key}:forbidden-create-vocabulary`);
  }
  return problems;
}

function readSources() {
  const sources = {};
  for (const [key, path] of Object.entries(FILES)) {
    if (!existsSync(path)) throw new Error(`${key}: file not found at ${path}`);
    sources[key] = readFileSync(path, "utf8");
  }
  return sources;
}

function selftest() {
  const baseline = readSources();
  const missed = [];
  for (const [id, key, pattern] of CHECKS) {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    const removeEveryMatch = new RegExp(pattern.source, flags);
    const mutated = { ...baseline, [key]: baseline[key].replace(removeEveryMatch, "__PLANTED_DEFECT__") };
    if (!collectProblems(mutated).includes(id)) missed.push(id);
  }
  for (const key of ["wizard", "api"]) {
    const id = `${key}:forbidden-create-vocabulary`;
    const mutated = { ...baseline, [key]: `${baseline[key]}\nconst planted = '+ New policy';` };
    if (!collectProblems(mutated).includes(id)) missed.push(id);
  }
  if (missed.length) throw new Error(`selftest missed: ${missed.join(", ")}`);
  console.log(`verify-insurance-creator --selftest ${CHECKS.length + 2}/${CHECKS.length + 2}`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = collectProblems(readSources());
  if (problems.length) {
    console.error(`verify-insurance-creator FAILED:\n${problems.map((p) => ` - ${p}`).join("\n")}`);
    process.exit(1);
  }
  console.log("verify-insurance-creator PASS — canonical vendor creator, unit FKs, allocation, and atomic bill route agree");
}
