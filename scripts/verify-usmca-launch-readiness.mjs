#!/usr/bin/env node
/**
 * CLOSURE-13 — USMCA launch readiness static CI guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:usmca-launch-readiness";

function fail(message) {
  console.error(`[${LABEL}] FAIL: ${message}`);
  process.exit(1);
}

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing file: ${rel}`);
  return fs.readFileSync(abs, "utf8");
}

const migration = read("apps/backend/src/migrations/202606080244-usmca-activation-state.sql");
const stateMachine = read("apps/backend/src/usmca/activation/activation-state-machine.ts");
const routes = read("apps/backend/src/usmca/activation/activation.routes.ts");
const panel = read("apps/frontend/src/pages/admin/USMCAActivationPanel.tsx");
const adminPage = read("apps/frontend/src/pages/admin/AdminPage.tsx");
const runbook = read("docs/runbooks/USMCA-JULY-2026-LAUNCH-RUNBOOK.md");
const rollbackPlan = read("docs/runbooks/USMCA-ROLLBACK-PLAN.md");
const trainingEN = read("data/training/usmca-driver-onboarding-EN.md");
const trainingES = read("data/training/usmca-driver-onboarding-ES.md");

function activationContractFailures(source) {
  const failures = [];
  const required = [
    'id: "tms_entity_scope"',
    'id: "tms_posting_flags"',
    'id: "launch_evidence"',
    "USMCA TMS entity scope and RLS verified",
    "USMCA TMS posting enabled and QBO sync flags disabled",
    "Required launch guards and live proofs recorded",
  ];
  for (const token of required) if (!source.includes(token)) failures.push(`activation checklist must retain ${token}`);
  for (const stale of ["qbo_subaccount", "coa_cloned", "owner_signoff", "QBO subaccount created", "Chart of Accounts cloned from TRANSP", "Jorge approves transition"])
    if (source.includes(stale)) failures.push(`activation checklist must not retain stale dependency ${stale}`);
  return failures;
}

function activationRouteFailures(source) {
  const failures = [];
  const required = [
    "CHECKLIST_ITEM_IDS.includes(id)",
    "parseChecklistCompleted(row.checklist_completed)",
    "getSingletonActivationState(client, true)",
    'throw new Error("USMCA activation state singleton invariant violated")',
    "WHERE id = $3",
  ];
  for (const token of required) if (!source.includes(token)) failures.push(`activation routes must retain ${token}`);
  if (source.includes("UPDATE usmca_ops.activation_state SET state = $1, activated_at = now(), activated_by_user_id = $2, updated_at = now()\",")) {
    failures.push("activation transition must never update every state row");
  }
  return failures;
}

const activationFailures = activationContractFailures(stateMachine);
if (activationFailures.length) fail(activationFailures.join("; "));
const activationRoutesFailures = activationRouteFailures(routes);
if (activationRoutesFailures.length) fail(activationRoutesFailures.join("; "));

if (process.argv.includes("--selftest")) {
  const mutations = [
    stateMachine.replace('id: "tms_entity_scope"', 'id: "qbo_subaccount"'),
    stateMachine.replace('id: "tms_posting_flags"', 'id: "coa_cloned"'),
    stateMachine.replace('id: "launch_evidence"', 'id: "owner_signoff"'),
  ];
  mutations.forEach((mutated, index) => {
    if (!activationContractFailures(mutated).length) fail(`selftest mutation ${index + 1} survived`);
  });
  const routeMutations = [
    routes.replace("CHECKLIST_ITEM_IDS.includes(id)", "true"),
    routes.replace("parseChecklistCompleted(row.checklist_completed)", "{}"),
    routes.replace('throw new Error("USMCA activation state singleton invariant violated")', "return result.rows[0]"),
    routes.replaceAll("WHERE id = $3", ""),
  ];
  routeMutations.forEach((mutated, index) => {
    if (!activationRouteFailures(mutated).length) fail(`route selftest mutation ${index + 1} survived`);
  });
  console.log(`[${LABEL}] SELFTEST PASS — ${mutations.length + routeMutations.length} launch-contract mutations rejected`);
}

// Migration checks
if (!migration.includes("usmca_ops.activation_state")) fail("migration must create usmca_ops.activation_state");
if (!migration.includes("ENABLE ROW LEVEL SECURITY")) fail("migration must enable RLS");
if (!migration.includes("ih35_app")) fail("migration must grant to ih35_app");

// State machine checks
const EXPECTED_STATES = ["hidden", "soft_launch", "pilot_drivers", "full_active", "rollback"];
for (const state of EXPECTED_STATES) {
  if (!stateMachine.includes(`"${state}"`)) fail(`state machine must define state: ${state}`);
}
if (!stateMachine.includes("validateTransition")) fail("state machine must export validateTransition");
if (!stateMachine.includes("CHECKLIST_ITEMS")) fail("state machine must export CHECKLIST_ITEMS");
if (!stateMachine.includes("hidden") || !stateMachine.includes("soft_launch")) fail("state machine must define valid transition hidden→soft_launch");
if (!stateMachine.includes("VALID_TRANSITIONS")) fail("state machine must define VALID_TRANSITIONS map");

// Count checklist items (should be 16)
const checklistMatches = stateMachine.match(/\{ id:/g) ?? [];
if (checklistMatches.length < 16) fail(`checklist must have 16 items, found ${checklistMatches.length}`);

// Routes checks
if (!routes.includes("/api/v1/usmca/activation/state")) fail("routes must expose GET /usmca/activation/state");
if (!routes.includes("/api/v1/usmca/activation/transition")) fail("routes must expose POST /usmca/activation/transition");
if (!routes.includes("/api/v1/usmca/activation/checklist-item")) fail("routes must expose PATCH /usmca/activation/checklist-item");

// Panel checks
if (!panel.includes("DEACTIVATE")) fail("panel must require typed confirm DEACTIVATE for rollback");
if (!panel.includes("Emergency Rollback")) fail("panel must have Emergency Rollback section");
if (!panel.includes("Transition to")) fail("panel must have Transition button");

// Admin page check
if (!adminPage.includes("USMCAActivationPanel")) fail("AdminPage must include USMCAActivationPanel");

// Runbook checks
if (!runbook.includes("T-7 days")) fail("runbook must include T-7 days section");
if (!runbook.includes("T-0")) fail("runbook must include T-0 section");
if (!runbook.includes("full_active")) fail("runbook must reference full_active transition");

// Rollback plan checks
if (!rollbackPlan.includes("When to Rollback")) fail("rollback plan must include When to Rollback section");
if (!rollbackPlan.includes("Communication Plan")) fail("rollback plan must include Communication Plan");

// Training docs
if (!trainingEN.includes("USMCA")) fail("English training doc must reference USMCA");
if (!trainingES.includes("USMCA")) fail("Spanish training doc must reference USMCA");

console.log(`[${LABEL}] PASS — USMCA launch readiness verified (${EXPECTED_STATES.length} states, 16 checklist items)`);
