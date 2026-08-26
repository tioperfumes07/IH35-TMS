#!/usr/bin/env node
/**
 * GUARD — verify-wo-detail-modal-complete-button-wired
 *
 * WO-DETAIL-MODAL-COMPLETE-DEAD-BUTTON: WorkOrderDetailModal renders an unconditionally-visible
 * "Mark Completed" button (`disabled={!canMarkComplete}` — visible and enabled once V5 clears
 * PEND0) wired to `onClick={onComplete}`. MaintenanceHome.tsx, the only place that mounts this
 * modal from the R&M Status Board Kanban, never passed an `onComplete` prop — so the button
 * rendered fully interactive, took the click, and did nothing. Live-reproduced: clicking it left
 * `maintenance.work_orders.status` unchanged on Neon; only a page reload plus a direct canonical
 * PATCH .../work-orders/:id/transition call actually advanced the status.
 *
 * The fix reuses the modal's OWN existing `statusMutation` (already wired to the R&M buckets
 * grid's `onAdvanceStatus`) rather than inventing a second transition path, and also invalidates
 * the work-order-detail query key so the modal reflects the new status without a manual reload.
 *
 * METHOD: static source-text assertions on MaintenanceHome.tsx. Comments are irrelevant to the
 * checks (they look for the actual JSX prop + a real handler body, not comment text).
 * --selftest mutates the REAL file and requires the assertion to fail.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-wo-detail-modal-complete-button-wired";
const TARGET = "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx";

function isolateModalBlock(text) {
  const start = text.indexOf("<WorkOrderDetailModal");
  if (start === -1) return null;
  const end = text.indexOf("/>", start);
  if (end === -1) return null;
  return text.slice(start, end + 2);
}

export function check(text) {
  const problems = [];
  const block = isolateModalBlock(text);
  if (!block) {
    problems.push("could not find a <WorkOrderDetailModal ... /> element in MaintenanceHome.tsx");
    return problems;
  }
  if (!/\bonComplete\s*=/.test(block)) {
    problems.push(
      "<WorkOrderDetailModal> is mounted without an onComplete prop — its Mark Completed button " +
        "renders enabled and clickable but silently does nothing (WO-DETAIL-MODAL-COMPLETE-DEAD-BUTTON)."
    );
  } else if (/\bonComplete\s*=\s*\{undefined\}/.test(block)) {
    problems.push("onComplete is wired to a literal undefined — same dead-button failure, just spelled explicitly.");
  }

  // The wired handler should reuse the existing statusMutation (same mutation the buckets grid's
  // onAdvanceStatus already calls), not invent a second transition call path.
  if (!/statusMutation\.mutate\(\s*\{[^}]*status:\s*["']complete["']/s.test(text)) {
    problems.push(
      "no call to statusMutation.mutate({ ..., status: 'complete' }) found anywhere in the file — " +
        "the fix must reuse the existing mutation, not add a second one."
    );
  }

  // The mutation's onSuccess must invalidate the work-order-detail query key so the open modal
  // reflects the new status without a manual page reload.
  const onSuccessMatch = text.match(/const statusMutation = useMutation\(\{[\s\S]*?onError:/);
  if (onSuccessMatch && !/work-order-detail/.test(onSuccessMatch[0])) {
    problems.push(
      "statusMutation's onSuccess does not invalidate the [\"maintenance\",\"work-order-detail\",...] " +
        "query key — the modal would still show stale status/V5 after a successful transition."
    );
  }

  return problems;
}

function run() {
  const text = readFileSync(TARGET, "utf8");
  const problems = check(text);
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — WorkOrderDetailModal's Mark Completed button is wired to the real transition mutation with detail-query invalidation.`);
}

function selftest() {
  const real = readFileSync(TARGET, "utf8");
  const failures = [];

  const baseline = check(real);
  if (baseline.length) failures.push(`baseline (real fixed file) should pass, got: ${baseline.join(" | ")}`);

  // Offender 1: strip the onComplete prop entirely (the original bug shape). Bracket-balanced
  // removal, not a naive regex — the real prop's value contains nested `{ }` (the mutate() call
  // args), which a `[^}]*` regex stops at prematurely.
  const propStart = real.indexOf("onComplete={");
  if (propStart === -1) failures.push("fixture setup: onComplete={ not found in real file");
  let depth = 0;
  let i = propStart + "onComplete=".length;
  let propEnd = -1;
  for (; i < real.length; i++) {
    if (real[i] === "{") depth++;
    else if (real[i] === "}") {
      depth--;
      if (depth === 0) {
        propEnd = i + 1;
        break;
      }
    }
  }
  const noOnComplete = propEnd === -1 ? real : real.slice(0, propStart) + real.slice(propEnd);
  const p1 = check(noOnComplete);
  if (!p1.some((m) => m.includes("without an onComplete prop"))) {
    failures.push(`offender-1 (missing onComplete) NOT caught: ${p1.join(" | ") || "none"}`);
  }

  // Offender 2: remove the work-order-detail invalidation from onSuccess.
  const noInvalidate = real.replace(
    /queryClient\.invalidateQueries\(\{ queryKey: \["maintenance", "work-order-detail", args\.companyId\] \}\),\n/,
    ""
  );
  const p2 = check(noInvalidate);
  if (!p2.some((m) => m.includes("does not invalidate"))) {
    failures.push(`offender-2 (missing detail-query invalidation) NOT caught: ${p2.join(" | ") || "none"}`);
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 2/2 offenders caught, baseline clean`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
