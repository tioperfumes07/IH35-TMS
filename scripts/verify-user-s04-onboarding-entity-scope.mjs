#!/usr/bin/env node
/**
 * USER-S04 — /onboarding Operator Onboarding wizard entity-scoped.
 * Static ratchet (no verify-steps / CLAIMED — Rule 37; same pattern as verify-user-s03*).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-s04-onboarding-entity-scope";
const SELFTEST = process.argv.includes("--selftest");
const SIDEBAR = "apps/frontend/src/components/layout/sidebar-config.ts";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";
const WIZARD = "apps/frontend/src/pages/onboarding/OnboardingWizard.tsx";
const STATE_ROUTES = "apps/backend/src/onboarding/state.routes.ts";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractUsersCase(src) {
  const marker = 'case "users"';
  const start = src.indexOf(marker);
  if (start < 0) return "";
  const nextCase = src.indexOf("case \"", start + marker.length);
  return nextCase < 0 ? src.slice(start) : src.slice(start, nextCase);
}

function extractRouteBlock(src, routePath) {
  const needle = `path="${routePath}"`;
  const start = src.indexOf(needle);
  if (start < 0) return "";
  const routeOpen = src.lastIndexOf("<Route", start);
  const from = routeOpen >= 0 ? routeOpen : start;
  const end = src.indexOf("</Route>", from);
  return end < 0 ? src.slice(from, from + 400) : src.slice(from, end + "</Route>".length);
}

function assertLive() {
  const problems = [];
  const sidebar = read(SIDEBAR);
  const manifest = read(MANIFEST);
  const wizard = read(WIZARD);
  const backend = read(STATE_ROUTES);
  const usersCase = extractUsersCase(sidebar);

  if (!usersCase) problems.push('sidebar missing case "users"');
  if (!usersCase.includes('{ label: "Operator Onboarding", to: "/onboarding" }')) {
    problems.push("users flyout missing Operator Onboarding → /onboarding");
  }

  const onboardingRoute = extractRouteBlock(manifest, "/onboarding");
  if (!onboardingRoute) problems.push('manifest missing path="/onboarding"');
  if (onboardingRoute && !onboardingRoute.includes("<OnboardingWizard")) {
    problems.push("/onboarding must mount OnboardingWizard");
  }
  if (onboardingRoute && !onboardingRoute.includes("ProtectedRoute")) {
    problems.push("/onboarding must be behind ProtectedRoute");
  }
  if (!manifest.includes('import("../pages/onboarding/OnboardingWizard")')) {
    problems.push("manifest must lazy-import OnboardingWizard");
  }

  if (!wizard.includes("useCompanyContext")) {
    problems.push("OnboardingWizard must use useCompanyContext");
  }
  if (!wizard.includes("selectedCompanyId")) {
    problems.push("OnboardingWizard must read selectedCompanyId");
  }
  if (!wizard.includes("operating_company_id=${encodeURIComponent(companyId)}")) {
    problems.push("getOnboardingState must pass operating_company_id query param");
  }
  if (!wizard.includes("body: { operating_company_id: companyId, ...payload }")) {
    problems.push("patchOnboardingState must send operating_company_id in body");
  }
  if (!wizard.includes("body: { operating_company_id: companyId }")) {
    problems.push("seedSampleData must send operating_company_id in body");
  }
  if (!wizard.includes('queryKey: ["onboarding-state", companyId]')) {
    problems.push("onboarding state queryKey must include companyId");
  }
  if (!wizard.includes("Select an operating company to begin onboarding.")) {
    problems.push("missing empty-company gate copy");
  }
  if (!wizard.includes('data-testid="operator-onboarding-wizard"')) {
    problems.push("operator-onboarding-wizard testid missing");
  }
  if (/ComingSoon|coming soon/i.test(wizard)) {
    problems.push("OnboardingWizard must not be ComingSoon");
  }

  if (!backend.includes("assertCompanyMembership")) {
    problems.push("onboarding state.routes must assertCompanyMembership");
  }
  if (!backend.includes("withCompanyScope")) {
    problems.push("onboarding state.routes must use withCompanyScope");
  }
  if (!backend.includes("operating_company_id: z.string().uuid()")) {
    problems.push("onboarding state.routes must require operating_company_id uuid");
  }
  if (!backend.includes("set_config('app.operating_company_id'")) {
    problems.push("onboarding state.routes must set app.operating_company_id GUC");
  }
  if (!backend.includes('FROM onboarding.onboarding_state') || !backend.includes("WHERE company_id = $1")) {
    problems.push("onboarding state must be keyed by company_id");
  }

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const wizardPath = path.join(ROOT, WIZARD);
  const orig = fs.readFileSync(wizardPath, "utf8");
  fs.writeFileSync(
    wizardPath,
    orig.replace(
      "operating_company_id=${encodeURIComponent(companyId)}",
      "company_id_REMOVED=${encodeURIComponent(companyId)}"
    )
  );
  try {
    if (!assertLive().length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(wizardPath, orig);
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
