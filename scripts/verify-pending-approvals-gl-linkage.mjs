#!/usr/bin/env node
/**
 * verify-pending-approvals-gl-linkage.mjs  (0280-15 — Rule 17 fail-closed)
 *
 * Freezes the Accounting Home pending-approvals ↔ JE/GL read model:
 *   - never reads/references nonexistent accounting.period_close_warnings
 *   - control_available / approval_control_unavailable when no migrated approval record
 *   - direct JE detail drill /accounting/journal-entries/${id}
 *   - rate-limit on the route
 *   - no invented Owner/Administrator/role-only approvers
 *
 * Usage:
 *   node scripts/verify-pending-approvals-gl-linkage.mjs
 *
 * Self-test (planted regressions must FAIL closed) is always run.
 *
 * Rule 17: do NOT edit package.json / locked-guards.yml / ci.yml.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

const paths = {
  service: "apps/backend/src/accounting/role-home/pending-approvals-gl.service.ts",
  homeService: "apps/backend/src/accounting/role-home/accounting-home.service.ts",
  routes: "apps/backend/src/accounting/role-home/routes.ts",
  index: "apps/backend/src/index.ts",
  api: "apps/frontend/src/api/accountingHome.ts",
  panel: "apps/frontend/src/components/home/AccountingPendingApprovalsPanel.tsx",
  tests: "apps/backend/src/accounting/role-home/__tests__/pending-approvals-gl.test.ts",
  aggregator: "apps/backend/src/owner/todays-attention/aggregator.service.ts",
  step: "scripts/verify-steps/914-verify-pending-approvals-gl-linkage.mjs",
};

function read(rel) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) return null;
  return fs.readFileSync(abs, "utf8");
}

function inspect(source) {
  const failures = [];

  for (const [key, rel] of Object.entries(paths)) {
    if (!source[key]) failures.push(`MISSING: ${rel}`);
  }
  if (failures.length) return failures;

  // Phantom source ban — no contiguous identifier in runtime sources (tests may
  // assemble the name via join for assertions; service/routes/home/api/panel/aggregator must not).
  for (const key of ["service", "homeService", "routes", "api", "panel", "aggregator"]) {
    if (/period_close_warnings/.test(source[key])) {
      failures.push(`${key} must not reference period_close_warnings (phantom table)`);
    }
  }
  if (/FROM\s+accounting\.period_close_warnings|JOIN\s+accounting\.period_close_warnings/i.test(source.tests)) {
    failures.push("tests must not SQL-read period_close_warnings");
  }

  if (!/export async function buildPendingApprovalsGl/.test(source.service)) {
    failures.push("service missing buildPendingApprovalsGl export");
  }
  if (!/export async function countPendingJournalApprovals/.test(source.service)) {
    failures.push("service missing countPendingJournalApprovals export");
  }
  if (!/control_available/.test(source.service)) {
    failures.push("service must expose control_available");
  }
  if (!/approval_control_unavailable/.test(source.service)) {
    failures.push("service must emit approval_control_unavailable when capability absent");
  }
  if (!/assignment_unresolved/.test(source.service)) {
    failures.push("service must emit assignment_unresolved when approver absent");
  }
  if (!/journalEntryDetailHref|\/accounting\/journal-entries\/\$\{/.test(source.service)) {
    failures.push("service must build direct /accounting/journal-entries/${id} drill");
  }
  if (!/isJeExcludedFromPendingQueue/.test(source.service)) {
    failures.push("service must exclude voided/reversed via isJeExcludedFromPendingQueue");
  }
  if (!/voided_at/.test(source.service) || !/reverses_je_id/.test(source.service) || !/reversed_by_je_id/.test(source.service)) {
    failures.push("service must consider voided_at + reverses_je_id + reversed_by_je_id");
  }
  if (!/created_at ASC NULLS LAST,\s*id ASC/.test(source.service)) {
    failures.push("service must order candidates by created_at ASC NULLS LAST, id ASC");
  }
  if (!/chart_of_accounts_roles/.test(source.service)) {
    failures.push("service must join governed CoA roles when loading postings");
  }
  if (!/debit_total_cents/.test(source.service) || !/credit_total_cents/.test(source.service)) {
    failures.push("service must expose integer-cent debit/credit totals");
  }
  if (/role-only/.test(source.service)) {
    failures.push("service must not invent role-only approver placeholders");
  }
  // Invented default Owner/Administrator checker (historical bug).
  if (/requiredRole\s*=\s*[^;]*["']Owner["']/.test(source.service)) {
    failures.push("service must not default required approver role to Owner");
  }
  if (/actor:\s*\{\s*user_id:\s*["']["']\s*,\s*role:\s*["']Administrator["']/.test(source.service)) {
    failures.push("service must not invent Administrator role-only actors");
  }
  if (/SELECT[\s\S]{0,120}email[\s\S]{0,80}FROM identity\.users/i.test(source.service)) {
    failures.push("service must not SELECT email from identity.users (PII)");
  }
  if (/SELECT[\s\S]{0,120}phone[\s\S]{0,80}FROM identity\.users/i.test(source.service)) {
    failures.push("service must not SELECT phone from identity.users (PII)");
  }

  if (!/countPendingJournalApprovals/.test(source.homeService)) {
    failures.push("accounting-home.service must use countPendingJournalApprovals");
  }

  if (!/\/api\/v1\/accounting\/role-home\/pending-approvals/.test(source.routes)) {
    failures.push("routes missing GET /api/v1/accounting/role-home/pending-approvals");
  }
  if (!/getPendingApprovalsGl/.test(source.routes)) {
    failures.push("routes must call getPendingApprovalsGl");
  }
  if (!/rateLimit:\s*\{\s*max:\s*120,\s*timeWindow:\s*["']1 minute["']\s*\}/.test(source.routes)) {
    failures.push("routes must configure rateLimit max:120 / 1 minute on pending-approvals");
  }
  if (!/registerAccountingRoleHomeRoutes/.test(source.index)) {
    failures.push("index.ts must register accounting role-home routes");
  }

  if (!/fetchPendingApprovalsGl/.test(source.api)) {
    failures.push("frontend API missing fetchPendingApprovalsGl");
  }
  if (!/control_available/.test(source.api)) {
    failures.push("frontend API must type control_available");
  }
  if (!/fetchPendingApprovalsGl/.test(source.panel)) {
    failures.push("panel must fetch pending-approvals GL list");
  }
  if (!/control_available|controlAvailable/.test(source.panel)) {
    failures.push("panel must surface control_available / unavailable state");
  }
  if (!/to=\{drillHref\}|to=\{item\.forward_drill\.href\}/.test(source.panel)) {
    failures.push("panel must Link to forward_drill.href when present");
  }

  if (
    !/control_available|approval_control_unavailable|assignment_unresolved|voided|revers|cross-entity|cross_entity|period_close_warnings|journal-entries\//i.test(
      source.tests
    )
  ) {
    failures.push(
      "behavioral tests must cover control unavailable / voided-reversed / null approver / detail route / phantom absence / cross-entity"
    );
  }

  if (!/verify-pending-approvals-gl-linkage\.mjs/.test(source.step)) {
    failures.push("verify-step must invoke verify-pending-approvals-gl-linkage.mjs");
  }

  return failures;
}

const source = Object.fromEntries(Object.entries(paths).map(([k, rel]) => [k, read(rel)]));
const failures = inspect(source);

// Planted regressions — fail closed.
const plantedPhantom = inspect({
  ...source,
  service: String(source.service) + "\n// FROM accounting.period_close_warnings\n",
});
if (!plantedPhantom.some((f) => /period_close_warnings/i.test(f))) {
  failures.push("self-test failed: planted period_close_warnings reference was not detected");
}

const plantedBareCount = inspect({
  ...source,
  homeService: String(source.homeService)
    .replace(
      /import \{ countPendingJournalApprovals \} from "\.\/pending-approvals-gl\.service\.js";\n/,
      ""
    )
    .replace(
      /const pendingJournalApprovals = await countPendingJournalApprovals\(client, input\.operating_company_id\);/,
      "const pendingJournalApprovals = 0;"
    ),
});
if (!plantedBareCount.some((f) => /countPendingJournalApprovals/i.test(f))) {
  failures.push("self-test failed: planted home-count regression was not detected");
}

const plantedRoute = inspect({
  ...source,
  routes: String(source.routes).replaceAll(
    "/api/v1/accounting/role-home/pending-approvals",
    "/api/v1/accounting/role-home/REMOVED"
  ),
});
if (!plantedRoute.some((f) => f.includes("pending-approvals"))) {
  failures.push("self-test failed: planted route regression was not detected");
}

const plantedRateLimit = inspect({
  ...source,
  routes: String(source.routes).replace(/rateLimit:\s*\{\s*max:\s*120,\s*timeWindow:\s*["']1 minute["']\s*\}/, ""),
});
if (!plantedRateLimit.some((f) => /rateLimit/i.test(f))) {
  failures.push("self-test failed: planted missing rateLimit was not detected");
}

const plantedPanel = inspect({
  ...source,
  panel: String(source.panel)
    .replaceAll("controlAvailable", "ALWAYS_TRUE")
    .replaceAll("control_available", "ALWAYS_TRUE"),
});
if (!plantedPanel.some((f) => /control_available|controlAvailable/i.test(f))) {
  failures.push("self-test failed: planted panel control_available regression was not detected");
}

if (failures.length) {
  console.error("verify:pending-approvals-gl-linkage — FAILED");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

const vitest = path.join(root, "node_modules/vitest/vitest.mjs");
const testRun = spawnSync(
  process.execPath,
  [
    vitest,
    "run",
    "--config",
    "apps/backend/vitest.config.ts",
    "apps/backend/src/accounting/role-home/__tests__/pending-approvals-gl.test.ts",
  ],
  { cwd: root, stdio: "inherit" }
);
if (testRun.status !== 0) process.exit(testRun.status ?? 1);

console.log("verify:pending-approvals-gl-linkage — OK");
