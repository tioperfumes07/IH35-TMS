#!/usr/bin/env node
/**
 * GO-0016-CASH-FLOW-DRIVER-PAY-SILENT-DROP — leftover unique (500/dead/silent), scope
 * /reports /cash-flow /finance /tasks per GO-0016 item 3.
 *
 * apps/backend/src/cash-flow/cash-flow.service.ts's getDailyPrediction() wrapped its
 * driver_finance.driver_settlements query in `try { ... } catch {}` with ZERO logging — a real
 * query failure silently dropped every driver_pay line from the daily cash-flow prediction,
 * indistinguishable from the honest "no driver pay due today" case. Unlike the sibling
 * reports/scheduled/runner.service.ts's own per-item catch (which at least counts failures into
 * its returned summary), this one left no signal anywhere the failure had occurred.
 *
 * Fix is NOT a hard throw — a broken driver-pay subquery must not take down the whole daily
 * prediction response, same reasoning as the earlier LIAB-F9927 sweep's lane-profitability fix —
 * but the failure must fail loud in the logs, not vanish silently.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const CASH_FLOW_FILE = "apps/backend/src/cash-flow/cash-flow.service.ts";

function stripLineComments(src) {
  return src
    .split("\n")
    .map((line) => {
      const idx = line.indexOf("//");
      return idx === -1 ? line : line.slice(0, idx);
    })
    .join("\n");
}

export function check(srcRaw) {
  const src = stripLineComments(srcRaw);
  const failures = [];

  // The specific silent catch this finding fixed: a bare `catch {}` immediately following the
  // driver_pay expenseItems.push loop (anchored on the FROM driver_finance.driver_settlements
  // query nearby, so this doesn't false-positive on some unrelated bare catch elsewhere in the file).
  if (/FROM driver_finance\.driver_settlements[\s\S]{0,2000}?\}\s*catch\s*\{\s*(?:\/\/[^\n]*\n\s*)?\}/.test(src)) {
    failures.push(`${CASH_FLOW_FILE}: the driver_pay subquery's silent (no-log) catch {} reappeared (GO-0016-CASH-FLOW-DRIVER-PAY-SILENT-DROP)`);
  }

  if (!/logger\.warn\(\s*"cash-flow: driver_pay subquery failed/.test(src)) {
    failures.push(`${CASH_FLOW_FILE}: expected logger.warn(...) call on the driver_pay failure path not found — guard out of sync or fix reverted`);
  }

  if (!src.includes("FROM driver_finance.driver_settlements")) {
    failures.push(`${CASH_FLOW_FILE}: expected driver_finance.driver_settlements query not found — guard out of sync`);
  }

  return failures;
}

function readSrc() {
  return fs.readFileSync(path.join(root, CASH_FLOW_FILE), "utf8");
}

function run() {
  const failures = check(readSrc());
  if (failures.length > 0) {
    console.error("FAIL: cash-flow-driver-pay-no-silent-catch");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: cash-flow driver_pay failure now logs instead of vanishing silently");
}

function selftest() {
  const src = readSrc();
  const baseline = check(src);
  if (baseline.length !== 0) {
    console.error("FAIL(selftest): baseline (current HEAD) is not clean:", baseline);
    process.exit(1);
  }

  // Offender: reintroduce the silent no-log catch.
  const offender = src.replace(
    /\} catch \(err\) \{[\s\S]*?logger\.warn\(\s*"cash-flow: driver_pay subquery failed[\s\S]*?\n  \}/,
    "} catch {\n    // Degrade: omit driver_pay lines rather than fail the whole daily prediction.\n  }"
  );
  if (offender === src) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (silent catch reintroduced) was NOT caught");
    process.exit(1);
  }

  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
