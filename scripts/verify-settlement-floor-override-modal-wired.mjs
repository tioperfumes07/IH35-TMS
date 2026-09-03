#!/usr/bin/env node
/**
 * verify-settlement-floor-override-modal-wired.mjs
 *
 * 25-task #10 (00_LOCKED_DECISIONS 9.2, owner-locked 2026-07-04): "5% net-pay floor, default,
 * EDITABLE per settlement... on termination may override to the full final check." The backend
 * (settlement-payrun-close.service.ts SET-05) has thrown 409 NET_PAY_FLOOR_BREACH with an
 * overrideFloor{pct,cents,reason} escape hatch since before this guard existed — #19819 wired the
 * sibling OUTSTANDING_LOAN_DECISION_REQUIRED popup (LoanRecoveryDecisionModal) but explicitly left
 * this one unbuilt (that PR's own body: "override_floor is wired in the API client but has no
 * modal UI yet") — so an operator hitting the floor on a termination settlement was stuck on the
 * raw error banner with no path forward, same defect class #19819 fixed for the loan case.
 *
 * FloorOverrideDecisionModal.tsx + PayRunClosePanel.tsx's catch now mirror that exact pattern.
 * Guards against either the modal or the wiring being dropped again.
 */
import { readFileSync } from "node:fs";

const modalPath = "apps/frontend/src/pages/driver-finance/components/FloorOverrideDecisionModal.tsx";
const panelPath = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";

const source = { modal: readFileSync(modalPath, "utf8"), panel: readFileSync(panelPath, "utf8") };

export function collectFailures(src = source) {
  const failures = [];

  if (!/export function FloorOverrideDecisionModal/.test(src.modal)) {
    failures.push(`${modalPath}: no longer exports FloorOverrideDecisionModal`);
  }
  if (!/onDecide:\s*\(override:\s*\{\s*pct:\s*number\s*\|\s*null;\s*cents:\s*number\s*\|\s*null;\s*reason:\s*string\s*\}\)\s*=>\s*void/.test(src.modal)) {
    failures.push(`${modalPath}: onDecide no longer carries the {pct, cents, reason} override shape`);
  }
  if (!/reason\.trim\(\)\.length >= 10/.test(src.modal)) {
    failures.push(`${modalPath}: no longer requires a written reason before confirming an override`);
  }

  if (!/import\s*\{\s*FloorOverrideDecisionModal\s*\}\s*from\s*"\.\/FloorOverrideDecisionModal"/.test(src.panel)) {
    failures.push(`${panelPath}: no longer imports FloorOverrideDecisionModal`);
  }
  if (!/parsed\.code === "NET_PAY_FLOOR_BREACH"/.test(src.panel)) {
    failures.push(`${panelPath}: no longer catches the NET_PAY_FLOOR_BREACH refusal`);
  }
  if (!/setFloorBreachDetails\(details\)/.test(src.panel)) {
    failures.push(`${panelPath}: NET_PAY_FLOOR_BREACH refusal no longer opens the override modal`);
  }
  if (!/override_floor:\s*floorOverride\s*\?\?\s*null/.test(src.panel)) {
    failures.push(`${panelPath}: close call no longer threads override_floor through to the backend`);
  }
  if (!/<FloorOverrideDecisionModal[\s\S]{0,200}?open=\{floorBreachDetails !== null\}/.test(src.panel)) {
    failures.push(`${panelPath}: FloorOverrideDecisionModal is no longer rendered off floorBreachDetails`);
  }
  if (!/onDecide=\{\(override\) => void runClose\(pendingLoanDecision, override\)\}/.test(src.panel)) {
    failures.push(`${panelPath}: override confirm no longer retries the close with the override attached`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-settlement-floor-override-modal-wired SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["modal export", "modal", /export function FloorOverrideDecisionModal/, "function FloorOverrideDecisionModal"],
    ["min reason length", "modal", /reason\.trim\(\)\.length >= 10/, "reason.trim().length >= 0"],
    ["panel import", "panel", /import \{ FloorOverrideDecisionModal \} from "\.\/FloorOverrideDecisionModal";\n/, ""],
    ["catch branch", "panel", /NET_PAY_FLOOR_BREACH/g, "NET_PAY_FLOOR_BREACH_DISABLED"],
    ["close payload", "panel", /override_floor: floorOverride \?\? null,/, "override_floor: null,"],
    ["modal render", "panel", /open=\{floorBreachDetails !== null\}/, "open={false}"],
    ["retry wiring", "panel", /onDecide=\{\(override\) => void runClose\(pendingLoanDecision, override\)\}/, "onDecide={() => {}}"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-settlement-floor-override-modal-wired SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlement-floor-override-modal-wired SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-settlement-floor-override-modal-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-settlement-floor-override-modal-wired: OK — NET_PAY_FLOOR_BREACH opens the Override control (reason required), retried close threads override_floor + any pending loan decision"
);
