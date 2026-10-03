#!/usr/bin/env node
/**
 * SETL-DUAL-APPROVAL-STATE-CONTRADICTION guard.
 *
 * driver_finance.driver_settlements carries two approval columns: the lifecycle `status` and the
 * canonical header `approval_status` (needs_review -> approved -> finalized), which only
 * approveSettlement() (apps/backend/src/settlements/approval.service.ts) may advance — it refuses
 * unless every settlement line is approved and the feed gate is green. Two routes
 * (settlements-mvp approve, pre-settlement Settle & Pay) once wrote status='approved' directly,
 * leaving live rows status='approved' + approval_status='needs_review' ($0 shells "approved").
 *
 * Rule: any backend UPDATE that sets driver_settlements.status = 'approved' must be preceded,
 * in the same handler (within WINDOW chars before the UPDATE), by an approveSettlement( call.
 *
 * --selftest exercises the matcher against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const WINDOW = 2500;
const UPDATE_RE = /UPDATE\s+driver_finance\.driver_settlements\s+SET\s+[^`;]*?\bstatus\s*=\s*'approved'/g;

export function findViolations(text) {
  const out = [];
  for (const m of text.matchAll(UPDATE_RE)) {
    const before = text.slice(Math.max(0, m.index - WINDOW), m.index);
    if (!/\bapproveSettlement\(/.test(before)) {
      out.push(text.slice(0, m.index).split("\n").length);
    }
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      walk(p, acc);
    } else if (e.name.endsWith(".ts") && !/\.test\.ts$/.test(e.name)) {
      acc.push(p);
    }
  }
  return acc;
}

function selftest() {
  const bad = "await client.query(`\n  UPDATE driver_finance.driver_settlements\n  SET status = 'approved'\n  WHERE id = $1`);";
  const good = `await approveSettlement(client, id, user, co);\n${bad}`;
  const header = "UPDATE driver_finance.driver_settlements SET approval_status = 'approved', approved_at = now() WHERE id = $1";
  const other = "UPDATE driver_finance.driver_settlements SET status = 'locked' WHERE id = $1";
  const checks = [
    [findViolations(bad).length === 1, "direct status='approved' is flagged"],
    [findViolations(good).length === 0, "gated status='approved' passes"],
    [findViolations(header).length === 0, "approval_status write is not mistaken for status"],
    [findViolations(other).length === 0, "other status values are ignored"],
  ];
  const failed = checks.filter(([ok]) => !ok);
  for (const [, name] of failed) console.error(`selftest FAIL: ${name}`);
  if (failed.length) process.exit(1);
  console.log(`verify-settlement-status-approved-runs-approval-gate --selftest: OK (${checks.length} cases)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const violations = [];
  let scanned = 0;
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    if (!text.includes("driver_settlements")) continue;
    for (const line of findViolations(text)) {
      scanned++;
      violations.push(`${path.relative(ROOT, file)}:${line}`);
    }
    scanned += (text.match(UPDATE_RE) || []).length - findViolations(text).length;
  }
  if (scanned === 0) {
    console.error("verify-settlement-status-approved-runs-approval-gate: FAIL — found 0 status='approved' writers; the matcher is stale (expected settlements-mvp + pre-settlement).");
    process.exit(1);
  }
  if (violations.length) {
    console.error("verify-settlement-status-approved-runs-approval-gate: FAIL — driver_settlements.status='approved' written without approveSettlement() (status/approval_status contradiction):");
    for (const v of violations) console.error(`  ${v}`);
    process.exit(1);
  }
  console.log(`verify-settlement-status-approved-runs-approval-gate: OK (${scanned} status='approved' writer(s), all gated)`);
}
