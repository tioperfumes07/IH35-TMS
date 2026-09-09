#!/usr/bin/env node
/**
 * verify-settlement-loan-recovery-modal-wired.mjs
 *
 * SET-25 (owner LOCKED MANDATE 2026-09-09: "non-deferrable loan pop-up at settlement close").
 * 00_LOCKED_DECISIONS 9.2/9.3: "If the driver has ANY outstanding loan or debt... a window MUST
 * appear and ask. IT CANNOT BE DEFERRED and the decision MUST BE REGISTERED AT THAT MOMENT."
 *
 * Live-verified 2026-09-09: the pop-up is BUILT (#19819) — LoanRecoveryDecisionModal.tsx +
 * PayRunClosePanel.tsx catch the backend's 409 OUTSTANDING_LOAN_DECISION_REQUIRED and open the
 * blocking Accept-full / Edit-partial control, then retry the close with the decision attached. The
 * assignment doc's "fully unbuilt" was a STALE finding. But unlike its sibling
 * (verify-settlement-floor-override-modal-wired.mjs for NET_PAY_FLOOR_BREACH), the LOAN pop-up had
 * NO non-regression guard, so the non-deferrable behavior could silently regress into a default.
 * This guard locks it — mirrors the floor guard exactly.
 *
 * node scripts/verify-settlement-loan-recovery-modal-wired.mjs
 * node scripts/verify-settlement-loan-recovery-modal-wired.mjs --selftest
 */
import { readFileSync } from "node:fs";

const modalPath = "apps/frontend/src/pages/driver-finance/components/LoanRecoveryDecisionModal.tsx";
const panelPath = "apps/frontend/src/pages/driver-finance/components/PayRunClosePanel.tsx";

const source = { modal: readFileSync(modalPath, "utf8"), panel: readFileSync(panelPath, "utf8") };

export function collectFailures(src = source) {
  const failures = [];

  // --- The modal: the blocking Accept-full / Edit-partial control itself ---
  if (!/export function LoanRecoveryDecisionModal/.test(src.modal)) {
    failures.push(`${modalPath}: no longer exports LoanRecoveryDecisionModal`);
  }
  if (!/onDecide:\s*\(decision:\s*\{\s*mode:\s*"full"\s*\|\s*"partial";\s*partial_cents:\s*number\s*\|\s*null;\s*reason:\s*string\s*\|\s*null\s*\}\)\s*=>\s*void/.test(src.modal)) {
    failures.push(`${modalPath}: onDecide no longer carries the {mode, partial_cents, reason} decision shape`);
  }
  if (!/mode:\s*"full"/.test(src.modal) || !/mode:\s*"partial"/.test(src.modal)) {
    failures.push(`${modalPath}: must offer BOTH a full-recovery and a partial-recovery decision`);
  }
  if (!/reason\.trim\(\)\.length >= 10/.test(src.modal)) {
    failures.push(`${modalPath}: a partial recovery no longer requires a written reason (min 10 chars)`);
  }
  if (!/data-testid="loan-recovery-accept-full"/.test(src.modal) || !/data-testid="loan-recovery-confirm-partial"/.test(src.modal)) {
    failures.push(`${modalPath}: the accept-full / confirm-partial controls are missing`);
  }

  // --- The panel: catch the 409, open the modal, retry with the decision, never default it ---
  if (!/import\s*\{\s*LoanRecoveryDecisionModal\s*\}\s*from\s*"\.\/LoanRecoveryDecisionModal"/.test(src.panel)) {
    failures.push(`${panelPath}: no longer imports LoanRecoveryDecisionModal`);
  }
  if (!/parsed\.code === "OUTSTANDING_LOAN_DECISION_REQUIRED"/.test(src.panel)) {
    failures.push(`${panelPath}: no longer catches the OUTSTANDING_LOAN_DECISION_REQUIRED refusal`);
  }
  if (!/setLoanDecisionDetails\(details\)/.test(src.panel)) {
    failures.push(`${panelPath}: the loan refusal no longer opens the decision modal`);
  }
  if (!/loan_recovery_decision:\s*loanDecision\s*\?\?\s*null/.test(src.panel)) {
    failures.push(`${panelPath}: close call no longer threads loan_recovery_decision through to the backend`);
  }
  if (!/<LoanRecoveryDecisionModal[\s\S]{0,200}?open=\{loanDecisionDetails !== null\}/.test(src.panel)) {
    failures.push(`${panelPath}: LoanRecoveryDecisionModal is no longer rendered off loanDecisionDetails`);
  }
  if (!/onDecide=\{\(decision\) => void runClose\(decision\)\}/.test(src.panel)) {
    failures.push(`${panelPath}: the loan decision no longer retries the close with the decision attached`);
  }
  // NON-DEFERRABLE invariant: the Close button must submit with NO decision (runClose(null)); the
  // decision only ever comes from the modal via the 409, never auto-defaulted before the close call.
  if (!/onClick=\{\(\) => void runClose\(null\)\}/.test(src.panel)) {
    failures.push(`${panelPath}: the Close button must submit with no pre-attached decision (the 409 forces the modal — the decision is never defaulted)`);
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-settlement-loan-recovery-modal-wired SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const mutations = [
    ["modal export", "modal", /export function LoanRecoveryDecisionModal/, "function LoanRecoveryDecisionModal"],
    ["min reason length", "modal", /reason\.trim\(\)\.length >= 10/, "reason.trim().length >= 0"],
    ["partial mode", "modal", /mode:\s*"partial"/g, 'mode: "PARTIAL_DISABLED"'],
    ["accept-full testid", "modal", /data-testid="loan-recovery-accept-full"/, 'data-testid="x"'],
    ["panel import", "panel", /import \{ LoanRecoveryDecisionModal \} from "\.\/LoanRecoveryDecisionModal";\n/, ""],
    ["catch branch", "panel", /OUTSTANDING_LOAN_DECISION_REQUIRED/g, "OUTSTANDING_LOAN_DECISION_REQUIRED_DISABLED"],
    ["open details", "panel", /setLoanDecisionDetails\(details\)/, "/* dropped */"],
    ["close payload", "panel", /loan_recovery_decision: loanDecision \?\? null,/, "loan_recovery_decision: null,"],
    ["modal render", "panel", /open=\{loanDecisionDetails !== null\}/, "open={false}"],
    ["retry wiring", "panel", /onDecide=\{\(decision\) => void runClose\(decision\)\}/, "onDecide={() => {}}"],
    ["non-deferrable close", "panel", /onClick=\{\(\) => void runClose\(null\)\}/, "onClick={() => void runClose({ mode: 'full', partial_cents: null, reason: null })}"],
  ];
  const escaped = [];
  for (const [name, key, pattern, replacement] of mutations) {
    const planted = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (planted[key] === source[key] || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-settlement-loan-recovery-modal-wired SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-settlement-loan-recovery-modal-wired SELFTEST PASS — ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();

if (failures.length > 0) {
  console.error("verify-settlement-loan-recovery-modal-wired: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-settlement-loan-recovery-modal-wired: OK — OUTSTANDING_LOAN_DECISION_REQUIRED opens the non-deferrable Accept-full / Edit-partial control (reason required for partial), retried close threads loan_recovery_decision; the Close button never defaults the decision"
);
