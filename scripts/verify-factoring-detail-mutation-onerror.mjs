#!/usr/bin/env node
/**
 * verify-factoring-detail-mutation-onerror.mjs
 *
 * Owner root cause: FactoringDetailPage lifecycle actions (Mark Advanced, Mark Reserve Held,
 * Release Reserve, Recourse Return, Void) call backend endpoints via a react-query mutation
 * with an `onSuccess` handler but NO `onError` handler — a rejected action silently swallowed
 * the error. The modal just stopped spinning; nothing told the user the action failed
 * (Rule #0 "no silent failures"). Fix wires the mutation's `onError` into the shared `useToast`
 * pushToast contract, matching #2734/#2736/#2737.
 *
 * This guard locks BOTH the source wiring AND the behavioral regression test that proves a
 * rejected lifecycle mutation renders a visible toast (not a silent no-op).
 *
 * Usage:
 *   node scripts/verify-factoring-detail-mutation-onerror.mjs
 *   node scripts/verify-factoring-detail-mutation-onerror.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-detail-mutation-onerror";

const PAGE_FILE = "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx";
const TEST_FILE = "apps/frontend/src/pages/accounting/__tests__/FactoringDetailPage.mutationError.test.tsx";

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

  const mutationMatch = pageSrc.match(/const mutation = useMutation\(\{[\s\S]*?\n {2}\}\);/);
  if (!mutationMatch) {
    failures.push(`${PAGE_FILE} — lifecycle mutation block not found`);
  } else {
    const block = mutationMatch[0];
    if (!/onError\s*:/.test(block)) {
      failures.push(`${PAGE_FILE} — lifecycle mutation must have an onError handler (silent failure on rejected action)`);
    } else if (!/onError\s*:\s*\(error\)\s*=>\s*pushToast\(/.test(block)) {
      failures.push(`${PAGE_FILE} — lifecycle mutation.onError must call pushToast with the error message`);
    }
  }

  if (!testSrc) {
    failures.push(`${TEST_FILE} — MISSING (regression test for the silent-failure fix)`);
  } else {
    const requiredMarkers = [
      "markAdvancedMock.mockRejectedValue",
      'screen.getByTestId("toast-message")',
    ];
    for (const marker of requiredMarkers) {
      if (!testSrc.includes(marker)) {
        failures.push(`${TEST_FILE} — must include ${marker}`);
      }
    }
  }

  // ACCT-F5064 — CLS-LINKAGE-ONEWAY: reserve/interest JE EntityLinks must use memo/date, not null→UUID.
  if (/entityLabel\(\s*null\s*,\s*row\.journal_entry_id\s*,\s*["']Journal entry["']\s*\)/.test(pageSrc)) {
    failures.push(`${PAGE_FILE} — must not entityLabel(null, journal_entry_id) on packet JE hops`);
  }
  if (!/journal_entry_memo/.test(pageSrc) || !/journal_entry_date/.test(pageSrc)) {
    failures.push(`${PAGE_FILE} — reserve/interest JE labels must prefer journal_entry_date/memo`);
  }
  const tracker = readFile("apps/backend/src/accounting/factoring-posting/reserve-tracker.service.ts") ?? "";
  if (!/je\.memo AS journal_entry_memo/.test(tracker) || !/LEFT JOIN accounting\.journal_entries je/.test(tracker)) {
    failures.push("reserve-tracker.service: packet movements/accruals must JOIN JE memo/date");
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
    failures.push("planted removal of lifecycle mutation.onError was not caught");
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
console.log(`${LABEL} PASS — FactoringDetailPage lifecycle mutation surfaces failures via toast (no silent no-op)`);
