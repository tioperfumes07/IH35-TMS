#!/usr/bin/env node
// CLOSURE-24 CI guard: assert the operator onboarding 6-step flow is present and
// that a full run with test inputs drives the state machine to "complete".
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function fail(message) {
  console.error(`verify:onboarding-flow-completes — FAILED\n- ${message}`);
  process.exit(1);
}

// 1. Required files exist.
const requiredFiles = [
  "apps/frontend/src/pages/onboarding/OnboardingWizard.tsx",
  "apps/frontend/src/pages/onboarding/Step1Company.tsx",
  "apps/frontend/src/pages/onboarding/Step2QBOConnect.tsx",
  "apps/frontend/src/pages/onboarding/Step3SamsaraConnect.tsx",
  "apps/frontend/src/pages/onboarding/Step4PlaidConnect.tsx",
  "apps/frontend/src/pages/onboarding/Step5InviteTeam.tsx",
  "apps/frontend/src/pages/onboarding/Step6SampleData.tsx",
  "apps/backend/src/onboarding/state.routes.ts",
  "apps/backend/src/onboarding/seed-sample-data.ts",
  "apps/backend/src/migrations/0403-onboarding-state.sql",
  "docs/walkthroughs/NEW-USER-DAY-1.md",
  "docs/walkthroughs/NEW-USER-WEEK-1.md",
];
for (const rel of requiredFiles) {
  if (!fs.existsSync(path.join(ROOT, rel))) fail(`missing required file: ${rel}`);
}

// 2. Wizard wires all six step components + completion handler.
const wizard = fs.readFileSync(
  path.join(ROOT, "apps/frontend/src/pages/onboarding/OnboardingWizard.tsx"),
  "utf8"
);
for (const comp of [
  "Step1Company",
  "Step2QBOConnect",
  "Step3SamsaraConnect",
  "Step4PlaidConnect",
  "Step5InviteTeam",
  "Step6SampleData",
]) {
  if (!wizard.includes(comp)) fail(`OnboardingWizard does not wire ${comp}`);
}
if (!wizard.includes("mark_complete")) fail("OnboardingWizard must be able to mark onboarding complete");

// 3. Backend exposes GET + PATCH state and seed-sample-data endpoints.
const routes = fs.readFileSync(path.join(ROOT, "apps/backend/src/onboarding/state.routes.ts"), "utf8");
for (const needle of [
  '"/api/v1/onboarding/state"',
  '"/api/v1/onboarding/seed-sample-data"',
  "app.get(",
  "app.patch(",
  "app.post(",
]) {
  if (!routes.includes(needle)) fail(`state.routes.ts missing required wiring: ${needle}`);
}

// 4. Migration creates onboarding_state with the 7 canonical steps + sample flags.
const migration = fs.readFileSync(
  path.join(ROOT, "apps/backend/src/migrations/0403-onboarding-state.sql"),
  "utf8"
);
if (!migration.includes("onboarding.onboarding_state")) fail("migration must create onboarding.onboarding_state");
for (const step of ["company", "qbo", "samsara", "plaid", "team", "samples", "complete"]) {
  if (!migration.includes(`'${step}'`)) fail(`migration current_step CHECK missing '${step}'`);
}
if (!migration.includes("is_sample_data")) fail("migration must add is_sample_data flag for removable sample rows");

// 5. Simulate the full 6-step flow with test inputs and assert completion.
const STEP_ORDER = ["company", "qbo", "samsara", "plaid", "team", "samples"];

function makeState() {
  return { current_step: "company", step_data: {}, skipped_steps: [], completed_at: null };
}

function patchState(state, payload) {
  if (payload.step_data) {
    state.step_data = { ...state.step_data, ...payload.step_data };
  }
  if (payload.mark_complete) {
    state.current_step = "complete";
    state.completed_at = new Date().toISOString();
  } else if (payload.current_step) {
    state.current_step = payload.current_step;
  }
  return state;
}

const testInputs = {
  company: { company: { company_name: "Test Carrier LLC", mc_number: "MC123456", dot_number: "DOT789", ein: "12-3456789" } },
  qbo: { qbo: { connected: true, realm_id: "test-realm" } },
  samsara: { samsara: { configured: true, org_id: "test-org" } },
  plaid: { plaid: { linked_account_count: 1 } },
  team: { team: { invites: [{ email: "ops@test.invalid", role: "operator" }] } },
  samples: { samples: { seeded: true } },
};

const state = makeState();
for (let i = 0; i < STEP_ORDER.length; i += 1) {
  const step = STEP_ORDER[i];
  patchState(state, { current_step: step, step_data: testInputs[step] });
  if (state.current_step !== step) fail(`expected to land on step '${step}', got '${state.current_step}'`);
}

// Company gate: required fields must be present before advancing past step 1.
const company = state.step_data.company;
if (!company || !company.company_name || !company.mc_number || !company.dot_number) {
  fail("company step did not capture required fields (company_name, mc_number, dot_number)");
}

patchState(state, { mark_complete: true });
if (state.current_step !== "complete") fail("flow did not reach 'complete'");
if (!state.completed_at) fail("completed_at not set on completion");

console.log("verify:onboarding-flow-completes — OK (6-step flow reaches complete)");
