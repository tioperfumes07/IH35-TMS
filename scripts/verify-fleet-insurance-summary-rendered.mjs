#!/usr/bin/env node
/**
 * 0441-mod9-fleet-insurance-summary-never-render
 *
 * Guards: VehicleProfilePage must render insurance_summary (monthly_premium, carrier,
 * expiration) from the unit aggregate API — not a dead typed field. ComplianceSection
 * alone is insufficient (it omits monthly_premium).
 *
 * Usage:
 *   node scripts/verify-fleet-insurance-summary-rendered.mjs
 *   node scripts/verify-fleet-insurance-summary-rendered.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const LABEL = "verify:fleet-insurance-summary-rendered";

const paths = {
  profilePage: path.join(ROOT, "apps/frontend/src/pages/fleet/VehicleProfilePage.tsx"),
  section: path.join(ROOT, "apps/frontend/src/components/vehicle-profile/InsuranceSummarySection.tsx"),
  aggregate: path.join(ROOT, "apps/backend/src/mdata/unit-aggregate.service.ts"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

/** Pure assertions — used by live scan and --selftest planted fixtures. */
export function collectFailures({ profilePage, section, aggregate }) {
  const failures = [];

  if (!section.includes("export function InsuranceSummarySection")) {
    failures.push("InsuranceSummarySection must exist and be exported");
  }
  if (!section.includes("monthly_premium")) {
    failures.push("InsuranceSummarySection must render monthly_premium");
  }
  if (!section.includes('data-testid="vp-insurance-summary"')) {
    failures.push("InsuranceSummarySection must expose data-testid=vp-insurance-summary");
  }
  if (!section.includes('data-testid="vp-insurance-monthly-premium"')) {
    failures.push("InsuranceSummarySection must expose data-testid=vp-insurance-monthly-premium");
  }
  if (!section.includes("formatUsdCents")) {
    failures.push("InsuranceSummarySection must format premium via formatUsdCents (no hand-rolled money)");
  }

  if (!profilePage.includes("InsuranceSummarySection")) {
    failures.push("VehicleProfilePage must import and render InsuranceSummarySection");
  }
  if (!profilePage.includes("insurance_summary")) {
    failures.push("VehicleProfilePage must pass insurance_summary from unit profile aggregate");
  }
  if (!profilePage.includes('data-testid="vp-section-6b-insurance-summary"')) {
    failures.push("VehicleProfilePage must expose data-testid=vp-section-6b-insurance-summary");
  }
  if (!/insuranceSummary=\{profile\.insurance_summary\}/.test(profilePage)) {
    failures.push("VehicleProfilePage must wire profile.insurance_summary into InsuranceSummarySection");
  }

  if (!aggregate.includes("insurance_summary:")) {
    failures.push("unit-aggregate.service must return insurance_summary on unit profile");
  }
  if (!aggregate.includes("monthly_premium:")) {
    failures.push("unit-aggregate.service insurance_summary must include monthly_premium");
  }

  return failures;
}

function selftest() {
  const base = {
    profilePage: `
      import { InsuranceSummarySection } from "../../components/vehicle-profile/InsuranceSummarySection";
      insurance_summary?: UnitInsuranceSummary;
      <div data-testid="vp-section-6b-insurance-summary">
        <InsuranceSummarySection insuranceSummary={profile.insurance_summary} />
      </div>
    `,
    section: `
      export function InsuranceSummarySection
      monthly_premium
      data-testid="vp-insurance-summary"
      data-testid="vp-insurance-monthly-premium"
      formatUsdCents
    `,
    aggregate: `
      insurance_summary: {
        monthly_premium: usMonthlyPremiumCents,
      }
    `,
  };

  const good = collectFailures(base);
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL: well-formed fixtures must PASS, got:`);
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  const bad = collectFailures({
    ...base,
    profilePage: base.profilePage.replace("InsuranceSummarySection insuranceSummary={profile.insurance_summary}", ""),
  });
  if (!bad.some((f) => f.includes("insurance_summary"))) {
    console.error(`${LABEL} --selftest FAIL: removing insurance_summary wiring must be caught`);
    console.error(`  got: ${JSON.stringify(bad)}`);
    process.exit(1);
  }

  const badSection = collectFailures({
    ...base,
    section: base.section.replace("monthly_premium", ""),
  });
  if (!badSection.some((f) => f.includes("monthly_premium"))) {
    console.error(`${LABEL} --selftest FAIL: removing monthly_premium render must be caught`);
    process.exit(1);
  }

  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const failures = collectFailures({
    profilePage: read(paths.profilePage),
    section: read(paths.section),
    aggregate: read(paths.aggregate),
  });

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail(failures.join("; "));
  }

  console.log(`${LABEL} PASS`);
}

const isMain = path.resolve(process.argv[1] ?? "") === path.resolve(new URL(import.meta.url).pathname);
if (isMain) main();
