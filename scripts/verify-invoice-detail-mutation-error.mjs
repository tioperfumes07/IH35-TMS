#!/usr/bin/env node
/**
 * verify-invoice-detail-mutation-error.mjs
 *
 * Owner root cause: InvoiceDetailPage money mutations (send / void / addLine / patchLine /
 * deleteLine) had onSuccess invalidate handlers but NO onError — rejected API calls
 * silently stopped the button spinner with no toast (Rule #0 "no silent failures").
 * Fix wires each mutation's onError into shared useToast pushToast, matching
 * FactorReconciliationPage / SalesTaxPage / CoaRolesPage.
 *
 * Rule 17: auto-discovered via
 * scripts/verify-steps/937-verify-invoice-detail-mutation-error.mjs
 * Do NOT wire through package.json / locked-guards.yml / ci.yml.
 *
 * Usage:
 *   node scripts/verify-invoice-detail-mutation-error.mjs
 *   node scripts/verify-invoice-detail-mutation-error.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-invoice-detail-mutation-error";

const PAGE_FILE = "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx";
const TEST_FILE = "apps/frontend/src/pages/accounting/__tests__/InvoiceDetailPage.mutationError.test.tsx";

const MUTATION_NAMES = [
  "sendMutation",
  "voidMutation",
  "addLineMutation",
  "patchLineMutation",
  "deleteLineMutation",
];

function readFile(relPath) {
  const abs = path.join(ROOT, relPath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
}

function extractMutationBlock(pageSrc, name) {
  const re = new RegExp(`const ${name} = useMutation\\(\\{[\\s\\S]*?\\n {2}\\}\\);`);
  const match = pageSrc.match(re);
  return match ? match[0] : null;
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

  for (const name of MUTATION_NAMES) {
    const block = extractMutationBlock(pageSrc, name);
    if (!block) {
      failures.push(`${PAGE_FILE} — ${name} block not found`);
      continue;
    }
    if (!/onError\s*:/.test(block)) {
      failures.push(`${PAGE_FILE} — ${name} must have an onError handler (silent failure on rejected mutation)`);
    } else if (!/onError\s*:\s*\(error\)\s*=>\s*pushToast\(/.test(block)) {
      failures.push(`${PAGE_FILE} — ${name}.onError must call pushToast with the error message`);
    }
  }

  if (!testSrc) {
    failures.push(`${TEST_FILE} — MISSING (regression test for the silent-failure fix)`);
  } else {
    const requiredMarkers = [
      "sendInvoiceMock.mockRejectedValue",
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
  if (!check(noOnError).some((f) => f.includes("onError handler"))) {
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
console.log(`${LABEL} PASS — InvoiceDetailPage mutations surface failures via toast (no silent no-op)`);
