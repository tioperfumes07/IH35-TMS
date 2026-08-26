#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.VERIFY_TRAINING_PROGRAM_RECERTIFY_ROOT ?? process.cwd();
const files = {
  migration: "db/migrations/202613150000_safety_training_program_recertify_months.sql",
  route: "apps/backend/src/safety/training-programs.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  page: "apps/frontend/src/pages/safety/TrainingProgramsPage.tsx",
};

function read(relative) {
  return fs.readFileSync(path.join(ROOT, relative), "utf8");
}

function inspect(source) {
  const failures = [];
  const { migration, route, api, page } = source;
  const requireMatch = (value, pattern, message) => {
    if (!pattern.test(value)) failures.push(message);
  };

  requireMatch(migration, /ADD COLUMN IF NOT EXISTS recertify_months SMALLINT/, "migration must persist recertify_months");
  requireMatch(migration, /frequency = 'n_month' AND recertify_months BETWEEN 1 AND 60/, "migration must constrain n_month values");
  requireMatch(route, /app\.get\("\/api\/v1\/safety\/training-programs"/, "backend must expose canonical list GET");
  requireMatch(route, /WHERE operating_company_id = \$1[\s\S]*AND voided_at IS NULL/, "GET must explicitly scope company and omit voided rows");
  requireMatch(route, /recertify_months: z\.number\(\)\.int\(\)\.min\(1\)\.max\(60\)/, "POST must validate recertify_months");
  requireMatch(route, /INSERT INTO safety\.training_programs[\s\S]*recertify_months/, "POST must persist recertify_months");
  requireMatch(api, /export function listTrainingPrograms\(companyId: string\)/, "frontend must read canonical programs endpoint");
  requireMatch(api, /recertify_months\?: number/, "frontend create payload must forward recertify_months");
  requireMatch(page, /queryKey: \["safety", "training-programs", operatingCompanyId\]/, "page must key canonical reads by company");
  requireMatch(page, /recertify_months: frequency === "n_month" \? Number\(recertifyMonths\) : undefined/, "creator must submit visible month value");
  requireMatch(page, /program\.frequency === "annual"[\s\S]*program\.frequency === "n_month" && program\.recertify_months/, "assignment expiry must use selected program");
  requireMatch(page, /companyGenerationRef\.current \+= 1[\s\S]*createMutation\.reset\(\)[\s\S]*assignMutation\.reset\(\)/, "company switch must reset mutations and stale UI");
  requireMatch(page, /companyId: operatingCompanyId[\s\S]*driverIds: \[\.\.\.assignDriverIds\]/, "assignment must snapshot company and driver ids");
  requireMatch(page, /<EntityPicker[\s\S]*kind="driver"[\s\S]*operatingCompanyId=\{operatingCompanyId\}/, "assignment must use canonical company-scoped driver picker");
  requireMatch(page, /<EntityLink[\s\S]*kind="driver"[\s\S]*id=\{driverId\}/, "assigned drivers must retain reverse drill-through");
  if (/deriveProgramsFromCompletions|sessionPrograms/.test(page)) {
    failures.push("page must not synthesize the program catalog from completion/session rows");
  }
  return failures;
}

function selftest(source) {
  const mutations = [
    ["migration", "ADD COLUMN IF NOT EXISTS recertify_months SMALLINT", "ADD COLUMN IF NOT EXISTS interval_months SMALLINT"],
    ["route", 'app.get("/api/v1/safety/training-programs"', 'app.get("/api/v1/safety/training-program-catalog"'],
    ["route", "AND voided_at IS NULL", "AND true"],
    ["api", "export function listTrainingPrograms(companyId: string)", "function hiddenListTrainingPrograms(companyId: string)"],
    ["page", 'queryKey: ["safety", "training-programs", operatingCompanyId]', 'queryKey: ["safety", "training-programs"]'],
    ["page", 'recertify_months: frequency === "n_month" ? Number(recertifyMonths) : undefined', "recertify_months: undefined"],
    ["page", 'program.frequency === "annual"', 'frequency === "annual"'],
    ["page", "companyGenerationRef.current += 1", "companyGenerationRef.current += 0"],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`selftest fixture missing: ${before}`);
    const planted = { ...source, [key]: source[key].replace(before, after) };
    if (inspect(planted).length === 0) throw new Error(`selftest failed to catch ${key}: ${before}`);
  }
  console.log(`verify-training-program-recertify-rw --selftest PASS (${mutations.length}/${mutations.length})`);
}

const source = Object.fromEntries(Object.entries(files).map(([key, value]) => [key, read(value)]));
if (process.argv.includes("--selftest")) {
  selftest(source);
} else {
  const failures = inspect(source);
  if (failures.length) {
    console.error("verify-training-program-recertify-rw FAILED");
    failures.forEach((failure) => console.error(` - ${failure}`));
    process.exit(1);
  }
  console.log("verify-training-program-recertify-rw PASS — canonical R=W, selected-program expiry, lifecycle, and driver reverse are ratcheted");
}
