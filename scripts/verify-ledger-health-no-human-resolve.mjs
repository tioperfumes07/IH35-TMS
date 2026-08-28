#!/usr/bin/env node
/**
 * verify-ledger-health-no-human-resolve.mjs
 * CI guard: `_system.reconciliation_findings` (the table Ledger Health reads) has NO human-facing
 * resolve/acknowledge/suppress action anywhere in the backend. Findings SELF-CLOSE — only
 * apps/backend/src/reconciliation/reconciliation-worker.service.ts's automated re-detection pass may
 * write `status`, and that file is a cron worker, not an HTTP route. See
 * apps/backend/src/system/ledger-health-reads.ts's header ("SELF-CLOSE ONLY / NO HUMAN RESOLVE") and
 * docs/lockdown/CURSOR-VERIFY-MASTER-LAUNCH-PLAN-2026-08-28.md §4 ("a guard that forbids human resolve
 * on `integration='ledger'`").
 *
 * FAILS IF ANY OF:
 *   1. apps/backend/src/system/ledger-health.routes.ts registers any HTTP method other than GET.
 *   2. Any `*.routes.ts` file anywhere in apps/backend/src (route files are the only place a human
 *      request reaches the backend) contains an UPDATE or DELETE statement against
 *      `_system.reconciliation_findings`.
 *
 * Self-test (pure logic, no filesystem): node scripts/verify-ledger-health-no-human-resolve.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WRITE_METHOD_RE = /\bapp\.(post|patch|put|delete)\s*\(/i;
const FINDINGS_WRITE_RE = /\b(UPDATE|DELETE\s+FROM)\s+_system\.reconciliation_findings\b/i;

/** Pure evaluation given { ledgerHealthRoutes, otherRouteFiles: {relPath: content} }. */
export function computeLedgerHealthNoHumanResolveFailures({ ledgerHealthRoutes, otherRouteFiles }) {
  const errors = [];

  const lh = ledgerHealthRoutes ?? "";
  if (!lh.includes("app.get(")) {
    errors.push("ledger-health.routes.ts: must register at least one app.get(...) route");
  }
  const writeMatch = lh.match(WRITE_METHOD_RE);
  if (writeMatch) {
    errors.push(`ledger-health.routes.ts: must be GET-only — found app.${writeMatch[1]}(...)`);
  }

  for (const [relPath, content] of Object.entries(otherRouteFiles ?? {})) {
    if (FINDINGS_WRITE_RE.test(content)) {
      errors.push(`${relPath}: a route file must never UPDATE/DELETE _system.reconciliation_findings — findings self-close only`);
    }
  }

  return errors;
}

function readIf(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return "";
  return fs.readFileSync(p, "utf8");
}

function listRouteFiles(dir) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      out.push(...listRouteFiles(full));
    } else if (/\.routes\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const goodLedgerHealth = 'app.get("/api/v1/system/ledger-health", async (req, reply) => { /* ... */ });';
  const goodOther = {
    "apps/backend/src/accounting/qbo-recon.routes.ts": 'app.get("/api/v1/accounting/qbo-recon", async () => {});',
  };

  const pass = computeLedgerHealthNoHumanResolveFailures({ ledgerHealthRoutes: goodLedgerHealth, otherRouteFiles: goodOther });

  const failWriteMethod = computeLedgerHealthNoHumanResolveFailures({
    ledgerHealthRoutes: goodLedgerHealth + '\napp.patch("/api/v1/system/ledger-health/:id/resolve", async () => {});',
    otherRouteFiles: goodOther,
  });

  const failNoGet = computeLedgerHealthNoHumanResolveFailures({
    ledgerHealthRoutes: '// nothing registered here',
    otherRouteFiles: goodOther,
  });

  const failOtherRouteResolve = computeLedgerHealthNoHumanResolveFailures({
    ledgerHealthRoutes: goodLedgerHealth,
    otherRouteFiles: {
      ...goodOther,
      "apps/backend/src/system/ledger-resolve.routes.ts":
        'app.post("/api/v1/system/ledger-health/:id/resolve", async (req) => {\n' +
        "  await client.query(`UPDATE _system.reconciliation_findings SET status = 'resolved' WHERE id = $1`, [req.params.id]);\n" +
        "});",
    },
  });

  const checks = [
    ["clean inputs produce zero failures", pass.length === 0],
    ["a non-GET method on ledger-health.routes.ts is flagged", failWriteMethod.some((e) => e.includes("GET-only"))],
    ["a ledger-health.routes.ts with no app.get is flagged", failNoGet.some((e) => e.includes("app.get"))],
    ["a human resolve route anywhere in the backend is flagged", failOtherRouteResolve.some((e) => e.includes("self-close only"))],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error("verify:ledger-health-no-human-resolve --selftest FAIL:");
    for (const [n] of failed) console.error("  x " + n);
    process.exit(1);
  }
  console.log(`verify:ledger-health-no-human-resolve --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const ledgerHealthRoutes = readIf("apps/backend/src/system/ledger-health.routes.ts");
const routeDir = path.join(ROOT, "apps/backend/src");
const otherRouteFiles = {};
for (const full of listRouteFiles(routeDir)) {
  const rel = path.relative(ROOT, full);
  if (rel.endsWith("system/ledger-health.routes.ts")) continue;
  otherRouteFiles[rel] = fs.readFileSync(full, "utf8");
}

const failures = computeLedgerHealthNoHumanResolveFailures({ ledgerHealthRoutes, otherRouteFiles });

if (failures.length) {
  console.error("verify:ledger-health-no-human-resolve FAIL — a human resolve path exists on reconciliation_findings:");
  for (const f of failures) console.error("  x " + f);
  process.exit(1);
}
console.log(`verify:ledger-health-no-human-resolve PASS (ledger-health.routes.ts is GET-only; 0 of ${Object.keys(otherRouteFiles).length} other route files write reconciliation_findings)`);
