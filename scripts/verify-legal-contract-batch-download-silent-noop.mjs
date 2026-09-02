#!/usr/bin/env node
/**
 * LEGAL-CONTRACT-BATCH-DOWNLOAD-SILENT-NOOP — LegalContractInstancesPage batch
 * Download must not let legalContractsApi.get() failures die silently (no try/catch).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const TARGET = "apps/frontend/src/pages/legal/contracts/LegalContractInstancesPage.tsx";
const LABEL = "verify-legal-contract-batch-download-silent-noop";

const BATCH_DOWNLOAD_HANDLER = /onClick=\{async \(\) => \{[\s\S]*?legalContractsApi\.get\([\s\S]*?\}\s*\}\s*>\s*\n\s*Download/;

export function audit(src) {
  const problems = [];
  const match = src.match(BATCH_DOWNLOAD_HANDLER);
  if (!match) {
    problems.push(`${TARGET}: batch Download handler with legalContractsApi.get not found`);
    return problems;
  }
  const block = match[0];
  if (!/try\s*\{/.test(block)) {
    problems.push(`${TARGET}: batch Download loop must wrap legalContractsApi.get in try/catch`);
  }
  if (!/catch\s*\(/.test(block)) {
    problems.push(`${TARGET}: batch Download loop must catch API failures`);
  }
  if (!/pushToast\s*\(\s*userFacingApiError/.test(block)) {
    problems.push(`${TARGET}: batch Download catch must pushToast userFacingApiError (never silent)`);
  }
  const silentLoop = /onClick=\{async \(\) => \{\s*for \(const row of selected\) \{\s*const detail = await legalContractsApi\.get/;
  if (silentLoop.test(src)) {
    problems.push(`${TARGET}: batch Download must not use bare async for-loop without try/catch`);
  }
  return problems;
}

function selftest() {
  const good = `
    onClick={async () => {
      for (const row of selected) {
        try {
          const detail = await legalContractsApi.get(row.id, operatingCompanyId);
          window.open(url, "_blank");
        } catch (error) {
          pushToast(userFacingApiError(error, "Failed to download contract"), "error");
        }
      }
    }}
            >
              Download`;
  const silent = `
    onClick={async () => {
      for (const row of selected) {
        const detail = await legalContractsApi.get(row.id, operatingCompanyId);
        window.open(url, "_blank");
      }
    }}>Download`;
  const failures = [];
  if (audit(good).length) failures.push(`good fixture rejected: ${audit(good).join(" | ")}`);
  if (!audit(silent).length) failures.push("planted silent batch download was not detected");
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
  console.log(`${LABEL}: PASS — batch Download surfaces API failures via toast`);
}
