#!/usr/bin/env node
/** Ratchet dispatch authorization-gate transport failures as visible, retryable blockers. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/components/dispatch/AuthGatePanel.tsx";
const LABEL = "verify-auth-gate-panel-fails-closed";

export function audit(src) {
  const problems = [];
  if (!/onBlockersChange\?\.\(q\.isError \|\| blockers\.length > 0\)/.test(src)) {
    problems.push(`${TARGET}: query errors must fail closed through onBlockersChange`);
  }
  if (!/userFacingApiError\(q\.error, "Could not verify dispatch authorization"\)/.test(src)) {
    problems.push(`${TARGET}: query error must render shared human-facing API detail`);
  }
  if (!/onClick=\{\(\) => void q\.refetch\(\)\}/.test(src)) {
    problems.push(`${TARGET}: failed gate check must expose retry`);
  }
  if (/if \(!q\.data && !q\.isLoading\) return null/.test(src)) {
    problems.push(`${TARGET}: legacy early return still swallows query errors`);
  }
  return problems;
}

function selftest() {
  const good = `
    props.onBlockersChange?.(q.isError || blockers.length > 0);
    userFacingApiError(q.error, "Could not verify dispatch authorization");
    <button onClick={() => void q.refetch()}>Retry</button>`;
  const bad = `
    props.onBlockersChange?.(blockers.length > 0);
    if (!q.data && !q.isLoading) return null;`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (audit(bad).length < 4) failures.push("silent fail-open regression was not fully detected");
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — authorization transport errors are visible, retryable blockers`);
}
