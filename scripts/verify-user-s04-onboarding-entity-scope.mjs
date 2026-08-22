#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.wizard.onboarding"],"task":"DRV-F5929-ONBOARDING-CONNECTIVITY-EXACT","vertical":"class-sweep"} */
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
const REQUIRED = "docs/specs/scoreboard/modules/drivers.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-user-s04-onboarding-entity-scope.mjs";
const EXACT_HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["connectivity"],"leaves":["drivers.wizard.onboarding"],"task":"DRV-F5929-ONBOARDING-CONNECTIVITY-EXACT","vertical":"class-sweep"} */';

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

function assertLive(overrides = {}) {
  const problems = [];
  const sidebar = overrides.sidebar ?? read(SIDEBAR);
  const manifest = overrides.manifest ?? read(MANIFEST);
  const wizard = overrides.wizard ?? read(WIZARD);
  const backend = overrides.backend ?? read(STATE_ROUTES);
  const requiredSrc = overrides.required ?? read(REQUIRED);
  const feed = overrides.feed ?? read(FEED);
  const self = overrides.self ?? read(SELF);
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

  if (!wizard.includes("const { selectedCompanyId } = useCompanyContext();")) {
    problems.push("OnboardingWizard must read selectedCompanyId from useCompanyContext");
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
  try {
    const leaf = JSON.parse(requiredSrc).leaves?.find((row) => row.id === "drivers.wizard.onboarding");
    if (!leaf?.required?.includes("connectivity")) problems.push("drivers onboarding leaf must require connectivity");
    if (leaf?.route_hint !== "surface://pages/onboarding/OnboardingWizard.tsx") problems.push("drivers onboarding leaf must name canonical surface route");
  } catch {
    problems.push("drivers Required matrix must parse");
  }
  if (!self.split("/**\n * USER-")[0].includes(EXACT_HEADER)) problems.push("exact Drivers onboarding connectivity header missing");
  if (/"guard"\s*:\s*"scripts\/verify-user-s04-onboarding-entity-scope\.mjs"/.test(feed)) problems.push("manual feed duplicates Drivers onboarding connectivity");

  return problems;
}

if (SELFTEST) {
  const live = assertLive();
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  const good = {
    sidebar: read(SIDEBAR), manifest: read(MANIFEST), wizard: read(WIZARD), backend: read(STATE_ROUTES),
    required: read(REQUIRED), feed: read(FEED), self: read(SELF),
  };
  const mutations = [
    ["sidebar", '{ label: "Operator Onboarding", to: "/onboarding" }'],
    ["manifest", 'path="/onboarding"'], ["manifest", "<OnboardingWizard />"],
    ["manifest", '<ProtectedRoute>\n              <OnboardingWizard />\n            </ProtectedRoute>'],
    ["wizard", "const { selectedCompanyId } = useCompanyContext();"], ["wizard", "selectedCompanyId"],
    ["wizard", "operating_company_id=${encodeURIComponent(companyId)}"],
    ["wizard", "body: { operating_company_id: companyId, ...payload }"],
    ["wizard", "body: { operating_company_id: companyId }"],
    ["wizard", 'queryKey: ["onboarding-state", companyId]'],
    ["wizard", 'data-testid="operator-onboarding-wizard"'],
    ["backend", "assertCompanyMembership"], ["backend", "withCompanyScope"],
    ["backend", "operating_company_id: z.string().uuid()"], ["backend", "set_config('app.operating_company_id'"],
    ["backend", "WHERE company_id = $1"],
    ["required", '"id": "drivers.wizard.onboarding"'],
    ["self", EXACT_HEADER],
    ["feed", '"entries": ['],
  ];
  for (const [key, needle] of mutations) {
    const replacement = key === "feed"
      ? '"entries": [{"guard":"scripts/verify-user-s04-onboarding-entity-scope.mjs"},'
      : key === "required"
        ? '"id": "drivers.wizard.onboarding.broken"'
        : "REMOVED_BY_SELFTEST";
    const mutated = { ...good, [key]: good[key].split(needle).join(replacement) };
    if (mutated[key] === good[key] || !assertLive(mutated).length) {
      console.error(`${LABEL} SELFTEST FAILED: planted defect escaped: ${key}:${needle}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} planted defects detected`);
  process.exit(0);
}

const problems = assertLive();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
