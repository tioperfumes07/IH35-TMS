#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/dispatch/MultiStopEditor.tsx";
const LABEL = "verify-load-drawer-stops-read-recovery";

export function audit(src) {
  const problems = [];
  if (!/if \(q\.isError\)/.test(src)) problems.push("missing exact stop-read error branch");
  if (!/data-load-stops-read-error/.test(src) || !/role=["']alert["']/.test(src)) {
    problems.push("stop-read failure is not exposed as an accessible state");
  }
  if (!/Retry stops/.test(src)) problems.push("stop-read failure has no named retry control");
  if (!/onClick=\{\(\) => void q\.refetch\(\)\}/.test(src)) problems.push("retry control does not refetch the exact stop query");
  if (!/if \(q\.isLoading\)[\s\S]{0,300}if \(q\.isError\)/.test(src)) {
    problems.push("loading and error states are no longer ordered before the editor");
  }
  return problems;
}

function selftest() {
  const good = `
    if (q.isLoading) return <div>Loading stops…</div>;
    if (q.isError) return <div role="alert" data-load-stops-read-error><button onClick={() => void q.refetch()}>Retry stops</button></div>;
  `;
  const mutations = [
    ["error branch", good.replace("q.isError", "q.isSuccess")],
    ["accessible state", good.replace('role="alert"', 'role="status"')],
    ["retry label", good.replace("Retry stops", "Try later")],
    ["exact refetch", good.replace("q.refetch()", "window.location.reload()")],
    ["state order", good.replace("if (q.isLoading)", "if (q.isError)")],
  ];
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  for (const [name, fixture] of mutations) {
    if (!audit(fixture).length) failures.push(`${name} mutation escaped`);
  }
  if (failures.length) {
    failures.forEach((failure) => console.error(`  ✗ ${LABEL}: ${failure}`));
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — ${mutations.length} mutations detected`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const problems = audit(readFileSync(join(ROOT, TARGET), "utf8"));
  if (problems.length) {
    problems.forEach((problem) => console.error(`  ✗ ${LABEL}: ${problem}`));
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — load-drawer stop reads expose an accessible exact-query retry`);
}
