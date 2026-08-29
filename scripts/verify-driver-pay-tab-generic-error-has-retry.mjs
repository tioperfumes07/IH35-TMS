#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver_pay","connectivity"],"leaves":["dispatch.load.driver_pay.retry_wired"],"task":"DSP-MONEY-F7105-DRIVER-PAY-READ-FAILURE-DEAD-END","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7105-DRIVER-PAY-READ-FAILURE-DEAD-END (GO-0027 drain, CC-1, 2026-08-28): the mounted
 * Load Detail Driver Pay tab gave dedicated semantic states for 501 (module not configured) and
 * 403 (forbidden), but every OTHER failure from the canonical load-scoped driver-bills reader
 * (transient network error, 500, timeout) ended in terminal "Failed to load driver pay data."
 * copy with no way to recover short of closing and reopening the entire load drawer. Root-caused
 * live: apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx's generic error branch
 * rendered a static message with no onRetry. Fixed by rendering the shared ListErrorState (which
 * every other retry-capable list/read surface in this codebase already uses) bound to the exact
 * billsQuery.refetch(). This guard holds that fix, and the deliberate 501/403 states beside it, so
 * neither can regress.
 *
 * Self-test: node scripts/verify-driver-pay-tab-generic-error-has-retry.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  tab: "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx",
};
const LABEL = "verify-driver-pay-tab-generic-error-has-retry";

export function audit(src) {
  const failures = [];
  const errorBlockMatch = src.tab.match(
    /if \(billsQuery\.error\) \{[\s\S]*?\n  \}/,
  );
  if (!errorBlockMatch) {
    failures.push(`${FILES.tab}: billsQuery.error handling block not found`);
    return failures;
  }
  const body = errorBlockMatch[0];
  if (!/status === 501/.test(body) || !/not yet configured/.test(body)) {
    failures.push(`${FILES.tab}: the deliberate 501-not-configured state must be preserved`);
  }
  if (!/status === 403/.test(body) || !/do not have permission/.test(body)) {
    failures.push(`${FILES.tab}: the deliberate 403-forbidden state must be preserved`);
  }
  if (!/<ListErrorState/.test(body)) {
    failures.push(
      `${FILES.tab}: the generic (non-501/403) error branch must render ListErrorState, not a ` +
        `static dead-end message — a transient read failure needs a way to recover`,
    );
  }
  if (!/onRetry=\{\(\) => void billsQuery\.refetch\(\)\}/.test(body)) {
    failures.push(
      `${FILES.tab}: the generic error branch's ListErrorState must bind onRetry to the exact ` +
        `billsQuery.refetch() instance, not a page reload or a different query`,
    );
  }
  return failures;
}

function loadSrc(root) {
  return {
    tab: fs.readFileSync(path.join(root, FILES.tab), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const noRetry = {
    tab: good.tab.replace(
      `    return (
      <ListErrorState
        title="Failed to load driver pay data."
        status={err?.status ?? 0}
        onRetry={() => void billsQuery.refetch()}
      />
    );`,
      `    return (
      <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load driver pay data.
      </div>
    );`,
    ),
  };
  if (noRetry.tab === good.tab) {
    console.error(`${LABEL} SELFTEST FAIL — retry-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(noRetry).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — retry removal escaped`);
    process.exit(1);
  }
  const no501 = {
    tab: good.tab.replace("Driver finance module is not yet configured for this company.", "Something went wrong."),
  };
  if (no501.tab === good.tab) {
    console.error(`${LABEL} SELFTEST FAIL — 501-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(no501).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — 501 state removal escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — driver-pay tab's generic read failure offers a real Retry; 501/403 states intact`);
