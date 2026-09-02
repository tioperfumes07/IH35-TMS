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
  if (/queryKey:\s*\[\s*["']auth-gates["']\s*,\s*props\s*\]/.test(src)) {
    problems.push(
      `${TARGET}: queryKey must not hash the entire props object — that refetches every parent render and resticks Checking dispatch authorization gates…`,
    );
  }
  if (!/queryKey:\s*\[\s*["']auth-gates["']\s*,\s*props\.operatingCompanyId/.test(src)) {
    problems.push(`${TARGET}: queryKey must use primitive identity fields so the check does not restick`);
  }
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
  if (/q\.isError\s*\?\s*\(\s*<div className="[^"]*(?:rounded|border)/.test(src)) {
    problems.push(`${TARGET}: error alert must stay flat inside the panel frame (no box-in-box)`);
  }
  return problems;
}

function selftest() {
  const good = `
    queryKey: ["auth-gates", props.operatingCompanyId, props.action, props.loadUuid ?? ""],
    props.onBlockersChange?.(q.isError || blockers.length > 0);
    userFacingApiError(q.error, "Could not verify dispatch authorization");
    {q.isError ? (<div className="bg-red-50"><button onClick={() => void q.refetch()}>Retry</button></div>) : null}`;
  const bad = `
    queryKey: ["auth-gates", props],
    props.onBlockersChange?.(blockers.length > 0);
    if (!q.data && !q.isLoading) return null;
    {q.isError ? (<div className="rounded-sm border border-red-200">Failed</div>) : null}`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (audit(bad).length < 6) failures.push("silent fail-open / nested-frame / unstable queryKey regression was not fully detected");
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
