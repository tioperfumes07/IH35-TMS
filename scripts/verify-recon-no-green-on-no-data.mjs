#!/usr/bin/env node
// verify-recon-no-green-on-no-data (D-#1 RECON-COLLECTOR)
//
// THE DEFECT THIS LOCKS OUT (measured on prod 2026-07-19):
//   qbo-remote-count-collector.cron.ts returned cleanly when it saw zero QBO connections. Because
//   wrapBackgroundJobTick records SUCCESS for any tick that does not throw, _system.background_jobs
//   showed `qbo.remote_count_collector.delta` succeeding 4x/day with last_failed_run_at = NULL —
//   while accounting.qbo_remote_counts had not received a row since 2026-06-03 and
//   accounting.qbo_remote_count_collection_state was completely empty. A reconciliation control
//   reported healthy for 47 days while inert.
//
//   "Ran and found nothing to do" and "could not run at all" are different outcomes. Collapsing them
//   into SUCCESS is the green-on-no-data anti-pattern. In control terms (COSO / SOC 2 Processing
//   Integrity, which puts "timely" in the objective itself) a monitoring control that silently stops
//   operating is a control deficiency — and the false assurance is the aggravating factor, because it
//   displaces the manual scrutiny that would otherwise have happened.
//
// INVARIANTS:
//   1. The collector cron's zero-connection branch must THROW, never `return`. A tick that cannot see
//      a single connection has not succeeded.
//   2. The collector service's no-connection path must leave a durable trace (an audit event), so the
//      control's non-operation is evidenceable — PCAOB/AICPA require evidence a control OPERATED, and
//      an untraced skip cannot supply it.
//
// Self-test: --selftest (proves the guard FAILS on the exact regression).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CRON = "apps/backend/src/cron/qbo-remote-count-collector.cron.ts";
const SERVICE = "apps/backend/src/integrations/qbo/remote-count-collector.ts";

function read(rel, failures) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    failures.push(`missing file: ${rel}`);
    return "";
  }
}

/** Strip line + block comments so prose can never satisfy or trip a code assertion. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** Extract the body of the `if (companies.length === 0) { ... }` block. */
function zeroConnectionBranch(source) {
  const m = source.match(/companies\.length\s*===\s*0\s*\)\s*\{/);
  if (!m) return null;
  const start = source.indexOf("{", m.index + m[0].length - 1);
  let depth = 0;
  for (let i = start; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start + 1, i);
    }
  }
  return null;
}

/**
 * @param {{cron?: string, service?: string}} [override] injected sources (self-test only)
 * @returns {string[]} failures
 */
export function run(override) {
  const failures = [];
  const cron = override?.cron ?? read(CRON, failures);
  const service = override?.service ?? read(SERVICE, failures);

  // 1. The cron's zero-connection branch must throw.
  if (cron) {
    const branch = zeroConnectionBranch(stripComments(cron));
    if (branch === null) {
      failures.push(
        `${CRON}: could not locate the \`companies.length === 0\` branch — the no-data guard may have been restructured; re-verify by hand`
      );
    } else {
      if (!/\bthrow\b/.test(branch)) {
        failures.push(
          `${CRON}: the zero-connection branch does not THROW. A tick that sees no connections would be recorded as SUCCESS by wrapBackgroundJobTick — this is the exact 47-day silent-green defect.`
        );
      }
      if (/\breturn\b/.test(branch)) {
        failures.push(
          `${CRON}: the zero-connection branch still contains \`return\` — a clean return is recorded as a successful tick. It must throw.`
        );
      }
    }
  }

  // 2. The service's no-connection path must leave a durable audit trace.
  if (service) {
    if (!service.includes("remote_count_run_skipped")) {
      failures.push(
        `${SERVICE}: the no-active-connection path must emit the \`qbo.remote_count_run_skipped\` audit event — an untraced skip cannot evidence that the control did not operate`
      );
    }
  }

  return failures;
}

// ---------------------------------------------------------------------------
function selftest() {
  const goodCron =
    `const companies = await listQboConnectedOperatingCompanies();\n` +
    `if (companies.length === 0) {\n  throw new Error("0 visible qbo_connections");\n}\n` +
    `for (const id of companies) { await collect(id); }\n`;
  const badCronReturn =
    `const companies = await listQboConnectedOperatingCompanies();\n` +
    `if (companies.length === 0) {\n  app.log.info("none");\n  return;\n}\n`;
  const badCronSilent =
    `const companies = await listQboConnectedOperatingCompanies();\n` +
    `if (companies.length === 0) {\n  app.log.info("none");\n}\n`;
  const goodService = `await appendAuditEvent(client, "qbo.remote_count_run_skipped", "warning", {});`;

  const cases = [
    ["baseline (throws)", { cron: goodCron, service: goodService }, 0],
    ["REGRESSION: silent return restored", { cron: badCronReturn, service: goodService }, 2],
    ["REGRESSION: branch neither throws nor returns", { cron: badCronSilent, service: goodService }, 1],
    ["service loses its audit trace", { cron: goodCron, service: "// nothing" }, 1],
  ];

  let bad = 0;
  for (const [name, srcs, expected] of cases) {
    const got = run(srcs);
    const ok = expected === 0 ? got.length === 0 : got.length >= 1;
    if (!ok) {
      bad += 1;
      console.error(`  ✗ selftest "${name}": expected ${expected === 0 ? "no" : "at least 1"} failure, got ${got.length}`);
      for (const f of got) console.error(`      ${f}`);
    } else {
      console.log(`  ✓ selftest "${name}" (${got.length} failure(s))`);
    }
  }
  if (bad > 0) {
    console.error("verify:recon-no-green-on-no-data SELFTEST FAILED");
    process.exit(1);
  }
  console.log("verify:recon-no-green-on-no-data SELFTEST PASS (guard proven to catch the silent-success regression)");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
  } else {
    const failures = run();
    if (failures.length) {
      console.error("verify:recon-no-green-on-no-data FAIL — a reconciliation feed can report success while collecting nothing:");
      for (const f of failures) console.error("  ✗ " + f);
      process.exit(1);
    }
    console.log("verify:recon-no-green-on-no-data PASS (zero-connection tick fails loudly; skip path leaves an audit trace)");
  }
}
