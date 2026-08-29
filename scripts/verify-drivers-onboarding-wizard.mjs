#!/usr/bin/env node
/**
 * Block A24-8: Multi-step driver onboarding wizard with save+resume.
 * Migration 0361 (0349 reserved for A24-10 comm center; 0360 for B28).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const paths = {
  migration: path.join(ROOT, "db/migrations/0361_safety_onboarding_sessions.sql"),
  onboardingRoutes: path.join(ROOT, "apps/backend/src/safety/onboarding.routes.ts"),
  backendTest: path.join(ROOT, "apps/backend/src/safety/__tests__/onboarding.routes.test.ts"),
  wizardPage: path.join(ROOT, "apps/frontend/src/pages/drivers/OnboardingWizardPage.tsx"),
  frontendTest: path.join(ROOT, "apps/frontend/src/pages/drivers/__tests__/OnboardingWizardPage.test.tsx"),
  driverDetail: path.join(ROOT, "apps/frontend/src/pages/DriverDetail.tsx"),
  manifest: path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"),
  index: path.join(ROOT, "apps/backend/src/index.ts"),
  archDesign: path.join(ROOT, "docs/specs/IH35_ARCHITECTURAL_DESIGN.md"),
};

function read(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`missing file: ${filePath}`);
  return fs.readFileSync(filePath, "utf8");
}

function fail(msg) {
  console.error(`[verify-drivers-onboarding-wizard] ${msg}`);
  process.exit(1);
}

function launcherFailures({ onboardingRoutes, backendTest, driverDetail }) {
  const failures = [];
  const required = [
    [onboardingRoutes, "AND driver_id = $2::uuid", "launcher resume must bind the canonical driver FK"],
    [onboardingRoutes, "AND status = 'in_progress'", "launcher resume must target only an open session"],
    [onboardingRoutes, "return reply.code(result.resumed ? 200 : 201).send(result)", "route must distinguish resume from create"],
    [driverDetail, 'import { createOnboardingSession } from "../api/onboarding"', "Driver Profile must import the canonical creator"],
    [driverDetail, "createOnboardingSession({ operating_company_id: companyId, driver_id: id })", "launcher must forward company + driver"],
    [driverDetail, "navigate(`/drivers/onboarding/${session.id}`)", "launcher must navigate to the mounted wizard"],
    [driverDetail, "Start / Resume Onboarding", "Driver Profile must expose the launcher"],
    [backendTest, "instead of duplicating it", "backend test must prove idempotent resume"],
  ];
  for (const [source, needle, label] of required) if (!source.includes(needle)) failures.push(label);
  return failures;
}

function resumeFailures({ wizardPage, frontendTest }) {
  const failures = [];
  const required = [
    [wizardPage, "initializedSessionRef.current === session.id", "resume must initialize once per canonical session"],
    [wizardPage, "setStepIndex(Math.max(0, Math.min(6, (session.current_step ?? 1) - 1)))", "resume must open the persisted current step"],
    [wizardPage, 'title="Couldn\'t load onboarding session"', "read failure must be named"],
    [wizardPage, "onRetry={() => void sessionQ.refetch()}", "read failure must expose exact retry"],
    [frontendTest, "resumes at the persisted current step", "frontend must test current-step resume"],
    [frontendTest, "renders the read failure with an exact retry", "frontend must test read failure truth"],
  ];
  for (const [source, needle, label] of required) if (!source.includes(needle)) failures.push(label);
  if (/sessionQ\.isError \|\| !session/.test(wizardPage)) failures.push("read failure must not masquerade as not found");
  return failures;
}

function completionFailures({ onboardingRoutes, backendTest }) {
  const failures = [];
  const completionStart = onboardingRoutes.indexOf('/api/v1/safety/onboarding/sessions/:session_id/complete');
  const completionEnd = onboardingRoutes.indexOf('/api/v1/safety/onboarding/sessions/:session_id/admin-override', completionStart);
  const completionRoute = completionStart >= 0
    ? onboardingRoutes.slice(completionStart, completionEnd > completionStart ? completionEnd : undefined)
    : "";
  const required = [
    [completionRoute, "missingRequiredOnboardingSteps(existing.step_data ?? {})", "completion must validate qualification evidence"],
    [completionRoute, "FOR UPDATE", "completion validation and status write must share one locked transaction"],
    [completionRoute, 'error: "onboarding_incomplete"', "incomplete qualification must return a named error"],
    [completionRoute, "missing_steps: result.missing_steps", "completion response must identify missing steps"],
    [onboardingRoutes, "signatures.acknowledged !== true", "signature acknowledgement is required"],
    [onboardingRoutes, "i9.section1_completed !== true", "I-9 completion is required"],
    [backendTest, "rejects missing qualification evidence without updating or auditing", "backend must test false completion rejection"],
    [backendTest, 'missing_steps: [1, 2, 3, 4, 5, 6]', "backend must prove every required step is reported"],
  ];
  for (const [source, needle, label] of required) if (!source.includes(needle)) failures.push(label);
  return failures;
}

function mutateCompletionRoute(source, before, after) {
  const start = source.indexOf('/api/v1/safety/onboarding/sessions/:session_id/complete');
  const end = source.indexOf('/api/v1/safety/onboarding/sessions/:session_id/admin-override', start);
  if (start < 0) return source;
  const route = source.slice(start, end > start ? end : undefined);
  const mutated = route.replace(before, after);
  if (mutated === route) return source;
  return `${source.slice(0, start)}${mutated}${end > start ? source.slice(end) : ""}`;
}

function main() {
  const migration = read(paths.migration);
  const onboardingRoutes = read(paths.onboardingRoutes);
  const backendTest = read(paths.backendTest);
  const wizardPage = read(paths.wizardPage);
  const frontendTest = read(paths.frontendTest);
  const driverDetail = read(paths.driverDetail);
  const manifest = read(paths.manifest);
  const index = read(paths.index);
  const archDesign = read(paths.archDesign);
  const failures = [];

  if (!migration.includes("safety.onboarding_sessions")) {
    failures.push("Migration 0361 must create safety.onboarding_sessions");
  }
  if (migration.includes("0349_safety_onboarding")) {
    failures.push("Must not use migration 0349 (comm center conflict)");
  }
  if (!onboardingRoutes.includes("/api/v1/safety/onboarding/sessions")) {
    failures.push("Backend onboarding session routes required");
  }
  if (!onboardingRoutes.includes("admin-override")) {
    failures.push("Admin override endpoint required");
  }
  if (!index.includes("registerSafetyOnboardingRoutes")) {
    failures.push("Backend index must register onboarding routes");
  }
  if (!wizardPage.includes("OnboardingWizardPage")) {
    failures.push("OnboardingWizardPage required");
  }
  if (!wizardPage.includes("requestUploadUrl")) {
    failures.push("Wizard must upload via docs module");
  }
  if (!manifest.includes("/drivers/onboarding/:session_id")) {
    failures.push("Frontend route /drivers/onboarding/:session_id required");
  }
  if (!backendTest.includes("A24-8")) failures.push("Backend vitest must reference A24-8");
  const backendTestCount = (backendTest.match(/\bit\s*\(/g) ?? []).length;
  if (backendTestCount < 6) failures.push("Backend vitest must include at least 6 cases");
  if (!frontendTest.includes("A24-8")) failures.push("Frontend vitest must reference A24-8");
  const frontendTestCount = (frontendTest.match(/\bit\s*\(/g) ?? []).length;
  if (frontendTestCount < 4) failures.push("Frontend vitest must include at least 4 cases");
  failures.push(...launcherFailures({ onboardingRoutes, backendTest, driverDetail }));
  failures.push(...resumeFailures({ wizardPage, frontendTest }));
  failures.push(...completionFailures({ onboardingRoutes, backendTest }));

  if (!archDesign.includes("verify:drivers-onboarding-wizard")) {
    failures.push("ARCHITECTURAL_DESIGN must reference verify:drivers-onboarding-wizard");
  }

  if (failures.length) {
    for (const f of failures) console.error(` - ${f}`);
    fail("FAILED");
  }

  if (process.argv.includes("--selftest")) {
    const mutations = [
      { key: "driver FK", onboardingRoutes: onboardingRoutes.replaceAll("AND driver_id = $2::uuid", "") },
      { key: "open status", onboardingRoutes: onboardingRoutes.replaceAll("AND status = 'in_progress'", "") },
      { key: "resume status", onboardingRoutes: onboardingRoutes.replace("result.resumed ? 200 : 201", "201") },
      { key: "creator import", driverDetail: driverDetail.replace('import { createOnboardingSession } from "../api/onboarding";', "") },
      { key: "company+driver payload", driverDetail: driverDetail.replace("createOnboardingSession({ operating_company_id: companyId, driver_id: id })", "createOnboardingSession({ operating_company_id: companyId })") },
      { key: "mounted navigation", driverDetail: driverDetail.replace("navigate(`/drivers/onboarding/${session.id}`)", "navigate('/drivers')") },
      { key: "visible launcher", driverDetail: driverDetail.replace("Start / Resume Onboarding", "") },
      { key: "resume test", backendTest: backendTest.replace("instead of duplicating it", "duplicate behavior") },
    ];
    for (const mutation of mutations) {
      const detected = launcherFailures({
        onboardingRoutes: mutation.onboardingRoutes ?? onboardingRoutes,
        backendTest: mutation.backendTest ?? backendTest,
        driverDetail: mutation.driverDetail ?? driverDetail,
      });
      if (detected.length === 0) fail(`selftest missed ${mutation.key}`);
    }
    const resumeMutations = [
      { key: "persisted current step", wizardPage: wizardPage.replace("setStepIndex(Math.max(0, Math.min(6, (session.current_step ?? 1) - 1)))", "setStepIndex(0)") },
      { key: "session initialization latch", wizardPage: wizardPage.replace("initializedSessionRef.current === session.id", "false") },
      { key: "named read failure", wizardPage: wizardPage.replace('title="Couldn\'t load onboarding session"', 'title="Onboarding session not found"') },
      { key: "read retry", wizardPage: wizardPage.replace("onRetry={() => void sessionQ.refetch()}", "onRetry={() => undefined}") },
      { key: "not-found conflation", wizardPage: wizardPage.replace("if (sessionQ.isError) {", "if (sessionQ.isError || !session) {") },
      { key: "resume test", frontendTest: frontendTest.replace("resumes at the persisted current step", "renders onboarding") },
    ];
    for (const mutation of resumeMutations) {
      const detected = resumeFailures({
        wizardPage: mutation.wizardPage ?? wizardPage,
        frontendTest: mutation.frontendTest ?? frontendTest,
      });
      if (detected.length === 0) fail(`selftest missed ${mutation.key}`);
    }
    const total = mutations.length + resumeMutations.length;
    const completionMutations = [
      { key: "completion validator", onboardingRoutes: onboardingRoutes.replace("missingRequiredOnboardingSteps(existing.step_data ?? {})", "[]") },
      { key: "transaction lock", onboardingRoutes: mutateCompletionRoute(onboardingRoutes, "FOR UPDATE", "") },
      { key: "named incomplete error", onboardingRoutes: onboardingRoutes.replaceAll('error: "onboarding_incomplete"', 'error: "not_found"') },
      { key: "missing step response", onboardingRoutes: onboardingRoutes.replace("missing_steps: result.missing_steps", "missing_steps: []") },
      { key: "signature requirement", onboardingRoutes: onboardingRoutes.replace("signatures.acknowledged !== true", "false") },
      { key: "I-9 requirement", onboardingRoutes: onboardingRoutes.replace("i9.section1_completed !== true", "false") },
      { key: "false completion test", backendTest: backendTest.replace("rejects missing qualification evidence without updating or auditing", "completes qualification") },
    ];
    for (const mutation of completionMutations) {
      const detected = completionFailures({
        onboardingRoutes: mutation.onboardingRoutes ?? onboardingRoutes,
        backendTest: mutation.backendTest ?? backendTest,
      });
      if (detected.length === 0) fail(`selftest missed ${mutation.key}`);
    }
    const grandTotal = total + completionMutations.length;
    console.log(`[verify-drivers-onboarding-wizard] selftest OK — ${grandTotal}/${grandTotal} launcher/resume/completion defects rejected`);
  }

  console.log("[verify-drivers-onboarding-wizard] OK");
}

main();
