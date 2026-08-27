#!/usr/bin/env node
/**
 * verify-fuel-card-overage-confirm-modal.mjs
 *
 * FUEL-MONEY-F6535-CARD-OVERAGE-APPROVAL-NATIVE-CONFIRM-AND-MUTABLE-COMPANY — the money-bearing
 * "Approve recovery" action used window.confirm(), bypassing canonical in-app modal chrome. The
 * scope-generation-snapshot half of this fix was already in place (approveMut already submitted
 * {eventId, companyId, generation}); the remaining defect was purely the native dialog.
 *
 * Fixed by replacing window.confirm() with ConfirmModal (the same component already used for
 * destructive/config confirmations elsewhere), holding the pending row in state until the
 * operator confirms or cancels, and clearing it on a company transition too.
 *
 * Guards against window.confirm() reappearing on this file, or the ConfirmModal/pending-row
 * state being dropped.
 */
import { readFileSync } from "node:fs";

const filePath = "apps/frontend/src/pages/fuel/card-overage/CardOverageQueuePage.tsx";
const src = readFileSync(filePath, "utf8");

const failures = [];

if (/(?:if\s*\(|=\s*)window\.confirm\(/.test(src)) {
  failures.push(`${filePath}: window.confirm() reintroduced — use ConfirmModal instead`);
}
if (!/import \{ ConfirmModal \} from "\.\.\/\.\.\/\.\.\/components\/shared\/ConfirmModal"/.test(src)) {
  failures.push(`${filePath}: no longer imports ConfirmModal`);
}
if (!/const \[confirmApproveRow, setConfirmApproveRow\] = useState<OverageEventRow \| null>\(null\)/.test(src)) {
  failures.push(`${filePath}: confirmApproveRow (pending-confirmation row state) is missing`);
}
if (!/onClick=\{\(\) => setConfirmApproveRow\(row\)\}/.test(src)) {
  failures.push(`${filePath}: Approve recovery no longer opens the confirmation modal via setConfirmApproveRow`);
}
if (!/<ConfirmModal\s*\n\s*open=\{confirmApproveRow != null\}/.test(src)) {
  failures.push(`${filePath}: ConfirmModal is no longer rendered, gated on confirmApproveRow`);
}
if (!/approveMut\.mutateAsync\(\{[\s\S]*eventId: confirmApproveRow\.id,[\s\S]*companyId,[\s\S]*generation: actionGenerationRef\.current/.test(src)) {
  failures.push(`${filePath}: ConfirmModal's onConfirm no longer awaits the scoped {eventId, companyId, generation} snapshot`);
}
if (!/setConfirmApproveRow\(null\);\s*\n\s*\}, \[companyId\]\)/.test(src)) {
  failures.push(`${filePath}: the companyId-change effect no longer clears a pending confirmApproveRow`);
}

if (failures.length > 0) {
  console.error("verify-fuel-card-overage-confirm-modal: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  "verify-fuel-card-overage-confirm-modal: OK — Approve recovery uses canonical ConfirmModal chrome and clears a pending confirmation on company transition"
);
