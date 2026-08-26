#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/shared/ConfirmModal.tsx";
const live = fs.readFileSync(file, "utf8");

function failures(source) {
  const problems = [];
  if (!/const closeUnlessBusy = \(\) => \{[\s\S]{0,80}if \(!busy\) onClose\(\)/.test(source)) problems.push("shared close boundary is not busy-gated");
  if (!/<Modal open=\{open\} onClose=\{closeUnlessBusy\}/.test(source)) problems.push("Escape/backdrop can dismiss a pending confirmation");
  if (!/variant="secondary" onClick=\{closeUnlessBusy\} disabled=\{busy\}/.test(source)) problems.push("Cancel remains active during a pending confirmation");
  if (!/await onConfirm\(\);[\s\S]{0,80}onClose\(\);/.test(source)) problems.push("success close does not wait for confirmation promise");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["if (!busy) onClose();", "onClose();"],
    ["onClose={closeUnlessBusy}", "onClose={onClose}"],
    ['onClick={closeUnlessBusy} disabled={busy}', 'onClick={onClose}'],
    ["await onConfirm();", "void onConfirm();"],
  ];
  for (const [from, to] of mutations) {
    const mutated = live.replace(from, to);
    if (mutated === live || failures(mutated).length === 0) throw new Error(`verify-confirm-modal-pending-dismiss-lock SELFTEST missed ${from}`);
  }
  console.log(`verify-confirm-modal-pending-dismiss-lock SELFTEST PASS — ${mutations.length}/${mutations.length} pending-dismiss mutations rejected`);
  process.exit(0);
}
const problems = failures(live);
if (problems.length) {
  console.error(`verify-confirm-modal-pending-dismiss-lock FAILED:\n - ${problems.join("\n - ")}`);
  process.exit(1);
}
console.log("verify-confirm-modal-pending-dismiss-lock PASS — pending confirmation blocks Cancel, Escape, and backdrop until outcome");
