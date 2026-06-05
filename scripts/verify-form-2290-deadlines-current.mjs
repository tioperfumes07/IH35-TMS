#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationPath = path.join(ROOT, "db/migrations/0378_form_2290_filings.sql");
const routesPath = path.join(ROOT, "apps/backend/src/compliance/form-2290.routes.ts");
const generatorPath = path.join(ROOT, "apps/backend/src/compliance/form-2290-generator.ts");

function fail(message) {
  console.error(`verify:form-2290-deadlines-current FAIL: ${message}`);
  process.exit(1);
}

for (const filePath of [migrationPath, routesPath, generatorPath]) {
  if (!fs.existsSync(filePath)) fail(`missing required file ${path.relative(ROOT, filePath)}`);
}

const migration = fs.readFileSync(migrationPath, "utf8");
if (!/compliance\.form_2290_filings/.test(migration)) fail("migration must create compliance.form_2290_filings");
if (!/GRANT USAGE ON SCHEMA compliance TO ih35_app/.test(migration)) fail("migration must GRANT compliance schema");

const routes = fs.readFileSync(routesPath, "utf8");
if (!routes.includes("/api/v1/compliance/form-2290/upcoming-deadline")) {
  fail("routes must expose upcoming-deadline endpoint");
}
if (!routes.includes("generate-draft")) fail("routes must expose generate-draft endpoint");

const generator = fs.readFileSync(generatorPath, "utf8");
if (!generator.includes("upcomingForm2290Deadline")) fail("generator must export upcomingForm2290Deadline");
if (!generator.includes("partialYearTaxFactor")) fail("generator must support partial-year tax computation");

const { deadline, daysRemaining } = (await import(generatorPath)).upcomingForm2290Deadline();
if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) fail("deadline must be ISO date");
if (daysRemaining < 0 || daysRemaining > 366) fail(`unexpected daysRemaining=${daysRemaining}`);

if (daysRemaining <= 60) {
  console.warn(
    `verify:form-2290-deadlines-current WARN: Form 2290 deadline ${deadline} is ${daysRemaining} days away — ensure draft generation is exercised before Aug 31`
  );
}

console.log(`verify:form-2290-deadlines-current PASS (deadline=${deadline}, days_remaining=${daysRemaining})`);
