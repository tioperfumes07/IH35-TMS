#!/usr/bin/env node
/**
 * verify-usmca-activation-checklist-mutation-error-surfaced.mjs (ADMIN-F6332, verify-step 5120)
 *
 * Root cause: `apps/frontend/src/pages/admin/USMCAActivationPanel.tsx` (mounted at
 * `/admin/usmca-activation`, Owner-only launch-readiness gate) has `checklistMutation` (backing
 * every checkbox in the "Activation Checklist (16 items)" list) with no `onError` — unlike its
 * sibling `transitionMutation` in the same file, which already correctly wires
 * `onError: (e) => pushToast(e.message || "Transition failed", "error")`. On a rejected
 * checklist-item PATCH this was a silent no-op — the Owner could believe a launch-readiness item
 * was toggled when it was not (or vice versa).
 *
 * Fix: added `onError: (e) => pushToast(e.message || "...", "error")` matching the sibling's own
 * established pattern.
 *
 * Usage:
 *   node scripts/verify-usmca-activation-checklist-mutation-error-surfaced.mjs            # scan
 *   node scripts/verify-usmca-activation-checklist-mutation-error-surfaced.mjs --selftest # regression harness
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const FILE = "apps/frontend/src/pages/admin/USMCAActivationPanel.tsx";

function extractMutationBlock(src, mutationName) {
  const startRe = new RegExp(`const ${mutationName} = useMutation\\(\\{`);
  const m = startRe.exec(src);
  if (!m) return null;
  const closeIdx = src.indexOf("\n  });", m.index);
  if (closeIdx === -1) return null;
  return src.slice(m.index, closeIdx);
}

export function checkUsmcaActivationChecklistMutationError(src) {
  const offenders = [];
  const block = extractMutationBlock(src, "checklistMutation");
  if (!block || !/onError:/.test(block)) {
    offenders.push(`${FILE}: checklistMutation has no onError — a rejected checklist-item PATCH will silently do nothing again.`);
  }
  return offenders;
}

export function run() {
  const src = fs.readFileSync(path.join(repoRoot, FILE), "utf8");
  const offenders = checkUsmcaActivationChecklistMutationError(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const checklistMutation = useMutation({
      mutationFn: ({ item_id, completed }) =>
        apiRequest("/api/v1/usmca/activation/checklist-item", { method: "PATCH", body: { item_id, completed } }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["usmca", "activation"] }),
    });
  `;
  const fixed = fs.readFileSync(path.join(repoRoot, FILE), "utf8");

  const buggyOffenders = checkUsmcaActivationChecklistMutationError(buggy);
  const fixedOffenders = checkUsmcaActivationChecklistMutationError(fixed);

  if (buggyOffenders.length >= 1 && fixedOffenders.length === 0) {
    console.log("verify-usmca-activation-checklist-mutation-error-surfaced selftest OK");
    process.exit(0);
  }
  console.error("verify-usmca-activation-checklist-mutation-error-surfaced selftest FAILED", {
    buggyOffenders,
    fixedOffenders,
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error(
      "verify-usmca-activation-checklist-mutation-error-surfaced FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "),
    );
    process.exit(1);
  }
  console.log(
    "verify-usmca-activation-checklist-mutation-error-surfaced OK — checklistMutation surfaces failures via toast, never a silent no-op",
  );
}
