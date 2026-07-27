#!/usr/bin/env node
/**
 * verify-fuel-gl-posts-exist.mjs (FUEL-01)
 *
 * Static tripwire: unposted fuel must re-flush through the shared
 * flushFuelGlPostsAfterCommit entry point (no new GL math), and the
 * owner-gated reflush route must be mounted.
 *
 * --selftest plants a missing-flush tree and proves RED.
 * Live DB JE completeness is NOT asserted here (requires EXPENSE_GL_POSTING_ENABLED
 * ON + owner reflush) — that is LIVE PROOF after flag enable.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-gl-posts-exist";

const REFLUSH_SVC = "apps/backend/src/accounting/fuel-posting/reflush-unposted-fuel-gl.service.ts";
const REFLUSH_ROUTES = "apps/backend/src/fuel/fuel-gl-reflush.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const MAYBE = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

export function assertFuelGlReflushWired(opts = {}) {
  const root = opts.root ?? ROOT;
  const failures = [];
  const readRel = (rel) => {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) return null;
    return fs.readFileSync(abs, "utf8");
  };

  const svc = readRel(REFLUSH_SVC);
  if (!svc) failures.push(`missing ${REFLUSH_SVC}`);
  else {
    if (!svc.includes("flushFuelGlPostsAfterCommit")) {
      failures.push(`${REFLUSH_SVC} must call flushFuelGlPostsAfterCommit (shared entry point)`);
    }
    if (!svc.includes("source_transaction_type = 'fuel_event'") && !svc.includes('source_transaction_type = "fuel_event"')) {
      failures.push(`${REFLUSH_SVC} must detect unposted via posting_batches fuel_event`);
    }
    if (!/reflushUnpostedFuelGlExpenses/.test(svc)) {
      failures.push(`${REFLUSH_SVC} must export reflushUnpostedFuelGlExpenses`);
    }
    // No new poster / no QBO enable
    if (/createJournalEntry\s*\(|INSERT INTO accounting\.journal_entries/.test(svc)) {
      failures.push(`${REFLUSH_SVC} must NOT invent GL math — reuse flushFuelGlPostsAfterCommit only`);
    }
    if (/EXPENSE_GL_POSTING_ENABLED\s*=\s*true|QBO_JE_PUSH_ENABLED\s*=\s*true/.test(svc)) {
      failures.push(`${REFLUSH_SVC} must not enable posting/QBO flags`);
    }
  }

  const routes = readRel(REFLUSH_ROUTES);
  if (!routes) failures.push(`missing ${REFLUSH_ROUTES}`);
  else {
    if (!routes.includes("/api/v1/fuel/gl/reflush-unposted")) {
      failures.push(`${REFLUSH_ROUTES} must mount POST /api/v1/fuel/gl/reflush-unposted`);
    }
    if (!routes.includes("dry_run")) {
      failures.push(`${REFLUSH_ROUTES} must default/support dry_run`);
    }
    if (!routes.includes("reflushUnpostedFuelGlExpenses")) {
      failures.push(`${REFLUSH_ROUTES} must call reflushUnpostedFuelGlExpenses`);
    }
  }

  const index = readRel(INDEX);
  if (!index) failures.push(`missing ${INDEX}`);
  else if (!index.includes("registerFuelGlReflushRoutes")) {
    failures.push(`${INDEX} must register registerFuelGlReflushRoutes`);
  }

  const maybe = readRel(MAYBE);
  if (!maybe) failures.push(`missing ${MAYBE}`);
  else if (!maybe.includes("flushFuelGlPostsAfterCommit")) {
    failures.push(`${MAYBE} must export flushFuelGlPostsAfterCommit`);
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fuel01-"));
  // plant incomplete tree
  fs.mkdirSync(path.join(tmp, "apps/backend/src/accounting/fuel-posting"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "apps/backend/src/fuel"), { recursive: true });
  fs.writeFileSync(
    path.join(tmp, MAYBE),
    `export async function flushFuelGlPostsAfterCommit() {}\n`
  );
  fs.writeFileSync(path.join(tmp, INDEX), `// no register\n`);
  const planted = assertFuelGlReflushWired({ root: tmp });
  if (planted.length < 2) {
    console.error(`[${LABEL}] SELFTEST FAIL — planted missing wiring not detected`, planted);
    process.exit(1);
  }
  console.log(`[${LABEL}] SELFTEST PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const failures = assertFuelGlReflushWired();
  if (failures.length) {
    console.error(`[${LABEL}] FAIL — ${failures.length} issue(s):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] OK — FUEL-01 reflush wired through flushFuelGlPostsAfterCommit; route mounted; flags not auto-enabled`
  );
}

main();
