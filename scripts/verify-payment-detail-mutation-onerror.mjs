#!/usr/bin/env node
/**
 * verify-payment-detail-mutation-onerror.mjs
 *
 * Owner root cause: PaymentDetailPage's apply / unapply / void mutations had onSuccess handlers
 * but NO onError — rejected API calls silently stopped the spinner with no user feedback
 * (Rule #0 "no silent failures"). Fix wires each mutation's onError into useToast pushToast,
 * matching FactorReconciliationPage / WorkOrdersConsoleDetailPage pattern.
 *
 * Usage:
 *   node scripts/verify-payment-detail-mutation-onerror.mjs
 *   node scripts/verify-payment-detail-mutation-onerror.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-payment-detail-mutation-onerror";

const PAGE_FILE = "apps/frontend/src/pages/accounting/PaymentDetailPage.tsx";
const TEST_FILE = "apps/frontend/src/pages/accounting/__tests__/PaymentDetailPage.mutationError.test.tsx";

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

export function check({ pageSrc, testSrc }) {
  const failures = [];

  if (!pageSrc) {
    failures.push(`${PAGE_FILE} — MISSING`);
    return failures;
  }

  if (!/import\s*\{\s*useToast\s*\}\s*from\s*["']\.\.\/\.\.\/components\/Toast["']/.test(pageSrc)) {
    failures.push(`${PAGE_FILE} — must import useToast from the shared Toast component`);
  }
  if (!/const\s*\{\s*pushToast\s*\}\s*=\s*useToast\(\)/.test(pageSrc)) {
    failures.push(`${PAGE_FILE} — must destructure pushToast from useToast()`);
  }

  const mutationCount = (pageSrc.match(/useMutation\(/g) || []).length;
  const onErrorCount = (pageSrc.match(/onError\s*:/g) || []).length;
  if (mutationCount !== 3) {
    failures.push(`${PAGE_FILE} — expected 3 useMutation calls (apply/unapply/void), found ${mutationCount}`);
  }
  if (onErrorCount < mutationCount) {
    failures.push(
      `${PAGE_FILE} — each useMutation must have onError: found ${onErrorCount} onError for ${mutationCount} mutations`,
    );
  }
  if (!/onError:\s*\(error\)\s*=>\s*pushToast\(/.test(pageSrc)) {
    failures.push(`${PAGE_FILE} — mutation onError handlers must call pushToast with the error message`);
  }

  if (!testSrc) {
    failures.push(`${TEST_FILE} — MISSING (regression test for the silent-failure fix)`);
  } else {
    const requiredMarkers = [
      "unapplyPaymentMock.mockRejectedValue",
      'screen.getByTestId("toast-message")',
    ];
    for (const marker of requiredMarkers) {
      if (!testSrc.includes(marker)) {
        failures.push(`${TEST_FILE} — must include ${marker}`);
      }
    }
  }

  return failures;
}

function readSources() {
  return { pageSrc: readFile(PAGE_FILE), testSrc: readFile(TEST_FILE) };
}

if (process.argv.includes("--selftest")) {
  const sources = readSources();
  const failures = [];

  const baseline = check(sources);
  if (baseline.length) failures.push(`baseline failed: ${baseline.join("; ")}`);

  const noOnError = {
    ...sources,
    pageSrc: sources.pageSrc
      .split("\n")
      .filter((line) => !/^\s*onError: \(error\) => pushToast\(/.test(line))
      .join("\n"),
  };
  if (!check(noOnError).some((f) => f.includes("must have onError"))) {
    failures.push("planted removal of mutation onError handlers was not caught");
  }

  const noToastImport = {
    ...sources,
    pageSrc: sources.pageSrc.replace(
      'import { useToast } from "../../components/Toast";\n',
      "",
    ),
  };
  if (!check(noToastImport).some((f) => f.includes("must import useToast"))) {
    failures.push("planted removal of the useToast import was not caught");
  }

  const noTest = { ...sources, testSrc: null };
  if (!check(noTest).some((f) => f.includes("MISSING (regression test"))) {
    failures.push("planted removal of the regression test was not caught");
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (3 independent planted removals caught)`);
  process.exit(0);
}

const failures = check(readSources());
if (failures.length) {
  console.error(`${LABEL} FAIL:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — PaymentDetailPage mutations surface failures via toast (no silent no-op)`);
