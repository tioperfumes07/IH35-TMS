#!/usr/bin/env node
/**
 * CA-MARK-DISBURSED-SILENT-NOOP — AdvanceDetailDrawer Mark Disbursed must be
 * disabled (or toast) when disbursed/reversed. A bare `return` with no reason is FAIL.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/cash-advances/components/AdvanceDetailDrawer.tsx";
const LABEL = "verify-ca-mark-disbursed-silent-noop";

export function audit(src) {
  const problems = [];
  if (/if\s*\(\s*status\s*===\s*["']disbursed["']\s*\|\|\s*status\s*===\s*["']reversed["']\s*\)\s*return\s*;/.test(src)) {
    problems.push(`${TARGET}: Mark Disbursed must not silent-return on disbursed/reversed — disable or toast`);
  }
  if (!/const markDisbursedBlocked\s*=\s*status\s*===\s*["']disbursed["']\s*\|\|\s*status\s*===\s*["']reversed["']/.test(src)) {
    problems.push(`${TARGET}: markDisbursedBlocked must gate disbursed/reversed`);
  }
  if (!/disabled=\{markDisbursedBlocked\}/.test(src)) {
    problems.push(`${TARGET}: Mark Disbursed Button must set disabled={markDisbursedBlocked}`);
  }
  if (!/pushToast\(markDisbursedBlockedReason/.test(src)) {
    problems.push(`${TARGET}: blocked click must toast markDisbursedBlockedReason (never silent)`);
  }
  return problems;
}

function selftest() {
  const good = `
    const markDisbursedBlocked = status === "disbursed" || status === "reversed";
    const markDisbursedBlockedReason = markDisbursedBlocked ? \`Already \${status} — Mark Disbursed is not available\` : undefined;
    <Button disabled={markDisbursedBlocked} title={markDisbursedBlockedReason} onClick={() => {
      if (markDisbursedBlocked) {
        pushToast(markDisbursedBlockedReason ?? "Cannot mark disbursed", "info");
        return;
      }
      onMarkDisbursed();
    }}>Mark Disbursed</Button>`;
  const silent = `
    <Button onClick={() => {
      if (status === "disbursed" || status === "reversed") return;
      onMarkDisbursed();
    }}>Mark Disbursed</Button>`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (!audit(silent).some((p) => /silent-return/.test(p))) {
    failures.push("planted silent return was not detected");
  }
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
  console.log(`${LABEL}: PASS — Mark Disbursed is disabled/toasted when disbursed or reversed`);
}
