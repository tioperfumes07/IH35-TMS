#!/usr/bin/env node
/**
 * verify-da-pool-compliance — SM2 Drug & Alcohol random-pool guard.
 *
 * Locks two compliance invariants so they cannot silently regress:
 *
 *  1. FMCSA 49 CFR 382.305 quarterly draw rates. A carrier drawing 4×/year must
 *     select 50% ÷ 4 = 12.5% (drug) and 10% ÷ 4 = 2.5% (alcohol) per quarter to
 *     attain the annual minimums. Every `targetDrugPct = <n>` default in the random
 *     pool service must be >= 12.5 (annualized under-testing = FMCSA audit failure),
 *     and the pre-fix 10 default must not reappear. Alcohol defaults must be >= 2.5.
 *
 *  2. The bulk pool-enrollment action (root-cause fix for the empty-pool defect)
 *     must exist in the Drug & Alcohol tab — an empty consortium pool means the
 *     random draw has no population.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const failures = [];

const drawRel = "apps/backend/src/compliance/drug-alcohol-pool.ts";
const routeRel = "apps/backend/src/compliance/drug-alcohol.routes.ts";
const noticesRel = "apps/backend/src/outbox/handlers/operational-notice.routes.ts";

export function notificationProblems({ draw = "", route = "", notices = "" }) {
  const issues = [];
  const eventType = "compliance.drug_alcohol.random_selections_drawn";
  if (!draw.includes('enqueueOutboxEvent(\n    client,\n    "compliance.drug_alcohol.random_selections_drawn"')) {
    issues.push("random draw must enqueue its alert on the scoped transaction client");
  }
  if (draw.includes("notifyRandomSelections") || route.includes("notifyRandomSelections")) {
    issues.push("post-transaction best-effort random-selection notification must not exist");
  }
  if (/drug_alcohol_random_selections[\s\S]{0,180}?notified_at[\s\S]{0,120}?now\(\)/.test(draw)) {
    issues.push("selection.notified_at must not be stamped before a selected driver is actually notified");
  }
  if (!notices.includes(`eventType: "${eventType}"`)) {
    issues.push("random-draw event needs a registered operational-notice consumer");
  }
  if (!notices.includes('audience: { kind: "roles", roles: ["Owner", "Administrator", "Safety", "Manager"] }')) {
    issues.push("random-draw notice must reach the compliance operations audience");
  }
  if (!notices.includes('actionLink: () => "/safety/drug-alcohol"')) {
    issues.push("random-draw notice must drill into the mounted Drug & Alcohol surface");
  }
  return issues;
}

const notificationSources = {
  draw: fs.readFileSync(path.join(repoRoot, drawRel), "utf8"),
  route: fs.readFileSync(path.join(repoRoot, routeRel), "utf8"),
  notices: fs.readFileSync(path.join(repoRoot, noticesRel), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["transactional enqueue", { ...notificationSources, draw: notificationSources.draw.replace('"compliance.drug_alcohol.random_selections_drawn"', '"compliance.drug_alcohol.random_draw_REMOVED"') }],
    ["post-transaction notifier", { ...notificationSources, route: `${notificationSources.route}\nnotifyRandomSelections(company, selections);` }],
    ["premature notified timestamp", { ...notificationSources, draw: `${notificationSources.draw}\n/* drug_alcohol_random_selections notified_at now() */` }],
    ["registered consumer", { ...notificationSources, notices: notificationSources.notices.replace('eventType: "compliance.drug_alcohol.random_selections_drawn"', 'eventType: "compliance.drug_alcohol.random_draw_REMOVED"') }],
    ["mounted drill", { ...notificationSources, notices: notificationSources.notices.replace('actionLink: () => "/safety/drug-alcohol"', 'actionLink: () => "/missing"') }],
  ];
  const missed = mutations.filter(([, fixture]) => notificationProblems(fixture).length === 0);
  if (missed.length) {
    console.error(`[verify-da-pool-compliance] SELFTEST FAIL: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`[verify-da-pool-compliance] selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

failures.push(...notificationProblems(notificationSources));

// ── 1. Draw-rate defaults ──────────────────────────────────────────────────────
const serviceRel = "apps/backend/src/safety/drug-alcohol/random-pool.service.ts";
const servicePath = path.join(repoRoot, serviceRel);
if (!fs.existsSync(servicePath)) {
  failures.push(`${serviceRel} (missing — cannot verify draw rates)`);
} else {
  const src = fs.readFileSync(servicePath, "utf8");

  const drugDefaults = [...src.matchAll(/targetDrugPct\s*=\s*([\d.]+)/g)].map((m) => Number(m[1]));
  const alcoholDefaults = [...src.matchAll(/targetAlcoholPct\s*=\s*([\d.]+)/g)].map((m) => Number(m[1]));

  if (drugDefaults.length === 0) {
    failures.push(`${serviceRel} (no targetDrugPct default found)`);
  }
  for (const pct of drugDefaults) {
    if (pct < 12.5) {
      failures.push(
        `${serviceRel} (targetDrugPct default ${pct} < 12.5 — annualized ${pct * 4}% is under the 50% federal minimum, 49 CFR 382.305(b)(2))`
      );
    }
  }
  // Negative test against the pre-fix 10/10 defaults.
  if (drugDefaults.includes(10)) {
    failures.push(`${serviceRel} (pre-fix targetDrugPct = 10 default reintroduced)`);
  }
  for (const pct of alcoholDefaults) {
    if (pct < 2.5) {
      failures.push(
        `${serviceRel} (targetAlcoholPct default ${pct} < 2.5 — under the 10% annual alcohol minimum, 49 CFR 382.305(b)(1))`
      );
    }
  }
}

// ── 2. Bulk enrollment action in the tab ───────────────────────────────────────
const tabRel = "apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx";
const tabPath = path.join(repoRoot, tabRel);
if (!fs.existsSync(tabPath)) {
  failures.push(`${tabRel} (missing — cannot verify bulk enrollment)`);
} else {
  const tab = fs.readFileSync(tabPath, "utf8");
  if (!tab.includes("bulkEnrollRandomPool")) {
    failures.push(`${tabRel} (missing bulkEnrollRandomPool wiring — empty-pool defect can recur)`);
  }
  if (!/Enroll all/.test(tab)) {
    failures.push(`${tabRel} (missing the bulk "Enroll all … active CDL drivers" action)`);
  }
}

if (failures.length > 0) {
  console.error("[verify-da-pool-compliance] FAIL:");
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}

console.log("[verify-da-pool-compliance] OK (draw rates, enrollment, and durable handled draw alerts)");
