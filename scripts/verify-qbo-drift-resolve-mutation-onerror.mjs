#!/usr/bin/env node
/**
 * verify-qbo-drift-resolve-mutation-onerror.mjs
 *
 * Root cause: QBOSyncDriftDashboard's resolve actions (accept_local / accept_qbo /
 * manual_merge_recorded) call a react-query mutation with onSuccess but NO onError —
 * a rejected resolve (auth, validation, network) silently stops the pending state with
 * no user feedback (Rule #0 "no silent failures"). Fix wires resolveMutation.onError
 * into the shared useToast pushToast contract.
 *
 * Locks source wiring AND the behavioral regression test proving a rejected resolve
 * renders a visible toast.
 *
 * Usage:
 *   node scripts/verify-qbo-drift-resolve-mutation-onerror.mjs
 *   node scripts/verify-qbo-drift-resolve-mutation-onerror.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-qbo-drift-resolve-mutation-onerror";

const PAGE_FILE = "apps/frontend/src/pages/accounting/QBOSyncDriftDashboard.tsx";
const TEST_FILE = "apps/frontend/src/pages/accounting/__tests__/QBOSyncDriftDashboard.resolveError.test.tsx";

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

  const mutationMatch = pageSrc.match(/const resolveMutation = useMutation\(\{[\s\S]*?\n {2}\}\);/);
  if (!mutationMatch) {
    failures.push(`${PAGE_FILE} — resolveMutation block not found`);
  } else {
    const block = mutationMatch[0];
    if (!/onError\s*:/.test(block)) {
      failures.push(`${PAGE_FILE} — resolveMutation must have an onError handler (silent failure on rejected resolve)`);
    } else if (!/onError\s*:\s*\(error\)\s*=>\s*pushToast\(/.test(block)) {
      failures.push(`${PAGE_FILE} — resolveMutation.onError must call pushToast with the error message`);
    }
  }

  if (!testSrc) {
    failures.push(`${TEST_FILE} — MISSING (regression test for the silent-failure fix)`);
  } else {
    const requiredMarkers = [
      "apiRequestMock.mockRejectedValue",
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
    failures.push("planted removal of resolveMutation.onError was not caught");
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
console.log(`${LABEL} PASS — QBOSyncDriftDashboard resolveMutation surfaces failures via toast (no silent no-op)`);
