#!/usr/bin/env node
/** @matrix-built {"modules":["cash-flow","drivers"],"cols":["liability"],"leafRe":"^(tab\\.daily_prediction|cash_advances)$","task":"LINK-F5187-LIABILITY-COLUMN-HONESTY-GENUINE-GAPS"} */
/**
 * LINK-F5187 — liability Required-column honesty audit, genuine-gap builds. Both leaves shared the
 * same root cause: a real id was already selected/fetched server- or client-side and discarded
 * before reaching the render.
 *
 *   cash-flow:tab.daily_prediction (DailyPredictionTab.tsx): cash-flow.service.ts's SQL already
 *     selected s.id (driver_finance.driver_settlements) and bill.id (accounting.bills) for its
 *     driver_pay/bill_due expense items; ExpenseLineItem never carried either id to the frontend.
 *     Now typed as settlement_id/bill_id and rendered as EntityLink kind="settlement"/"bill" when
 *     no load_id is present (the common case for driver-pay/bill-due rows).
 *   drivers:cash_advances (Drivers.tsx's Debt Alert panel, both mounts): liabilitiesQuery already
 *     fetched real driver_finance.driver_liabilities rows (each with a real id) and discarded the
 *     id during per-driver aggregation, keeping only the summed dollar total. Now carried through
 *     via a new liabilityIds[] accumulator and rendered as EntityLink kind="liability" per row.
 *
 * The remaining 17 leaves audited alongside these 2 were false-positive Required flags (pure
 * create-forms, categorical rollups, chrome-only surfaces, or capability-only unrouted FKs) and
 * were corrected directly in the required.json files -- see this commit's honesty_audit entries
 * (key liability_2026_08_15, with _v2.._v7 for later files in the same commit) for the full
 * per-leaf reasoning; not re-asserted here since drops don't need a source-code regression guard
 * the way real fixes do.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CASH_FLOW_SERVICE = "apps/backend/src/cash-flow/cash-flow.service.ts";
const CASH_FLOW_API = "apps/frontend/src/api/cashFlow.ts";
const DAILY_PREDICTION_TAB = "apps/frontend/src/pages/cash-flow/tabs/DailyPredictionTab.tsx";
const DRIVERS_PAGE = "apps/frontend/src/pages/Drivers.tsx";
const FILES = [CASH_FLOW_SERVICE, CASH_FLOW_API, DAILY_PREDICTION_TAB, DRIVERS_PAGE];
const LABEL = "verify-liability-required-honest-cluster-b";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  fleet: "docs/specs/scoreboard/modules/fleet.required.json",
  finance: "docs/specs/scoreboard/modules/finance.required.json",
  insurance: "docs/specs/scoreboard/modules/insurance.required.json",
  "cash-flow": "docs/specs/scoreboard/modules/cash-flow.required.json",
  accounting: "docs/specs/scoreboard/modules/accounting.required.json",
  legal: "docs/specs/scoreboard/modules/legal.required.json",
  reports: "docs/specs/scoreboard/modules/reports.required.json",
  drivers: "docs/specs/scoreboard/modules/drivers.required.json",
};

const DROPPED = [
  ["fleet", "unit.profile.insurance_summary"],
  ["fleet", "unit.profile.insurance_claims_reverse"],
  ["fleet", "unit.edit.insurance"],
  ["fleet", "trailer.profile.insurance_claims_reverse"],
  ["finance", "nav.statements"],
  ["finance", "statements.pl"],
  ["finance", "statements.bs"],
  ["finance", "statements.tb"],
  ["insurance", "policies.create"],
  ["insurance", "claims.create"],
  ["insurance", "lawsuits.create"],
  ["cash-flow", "home"],
  ["cash-flow", "tab.actual_vs_projected"],
  ["accounting", "accounting.modal.decide"],
  ["legal", "matters.create"],
  ["legal", "matters.detail"],
  ["reports", "report.settlement_summary"],
];

const KEEP_REQUIRED = [
  ["cash-flow", "tab.daily_prediction"],
  ["drivers", "cash_advances"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertLiabilityClusterB(sources, docs) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];

  for (const [mod, id] of DROPPED) {
    const doc = docs[mod];
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if ((leaf.required || []).includes("liability")) problems.push(`${mod}:${id} must not require liability`);
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    const doc = docs[mod];
    const leaf = (doc.leaves || []).find((l) => l.id === id);
    if (!leaf) { problems.push(`${mod}:${id} missing from required.json`); continue; }
    if (!(leaf.required || []).includes("liability")) problems.push(`${mod}:${id} must keep liability (real fix built)`);
  }
  const service = src[CASH_FLOW_SERVICE];
  const api = src[CASH_FLOW_API];
  const tab = src[DAILY_PREDICTION_TAB];
  const drivers = src[DRIVERS_PAGE];

  if (!/settlement_id:\s*row\.id/.test(service)) problems.push(`${CASH_FLOW_SERVICE}: driver_pay items must carry settlement_id`);
  if (!/bill_id:\s*bill\.id/.test(service)) problems.push(`${CASH_FLOW_SERVICE}: bill_due items must carry bill_id`);
  if (!/settlement_id\?:\s*string/.test(api) || !/bill_id\?:\s*string/.test(api)) {
    problems.push(`${CASH_FLOW_API}: ExpenseLineItem must type settlement_id/bill_id`);
  }
  if (!/kind="settlement"/.test(tab)) problems.push(`${DAILY_PREDICTION_TAB}: must EntityLink kind=settlement for driver_pay rows without a load_id`);
  if (!/kind="bill"/.test(tab)) problems.push(`${DAILY_PREDICTION_TAB}: must EntityLink kind=bill for bill_due rows`);

  if (!/liabilityIds:\s*string\[\]/.test(drivers)) problems.push(`${DRIVERS_PAGE}: debtAlertRows aggregate must carry liabilityIds`);
  if (!/current\.liabilityIds\.push\(liabilityId\)/.test(drivers)) problems.push(`${DRIVERS_PAGE}: upsertDebt must push the real liability id`);
  if (!/kind="liability"/.test(drivers)) problems.push(`${DRIVERS_PAGE}: Debt Alert rows must EntityLink kind=liability per liabilityId`);

  return problems;
}

function selftest() {
  const good = {
    [CASH_FLOW_SERVICE]: `
      expenseItems.push({ kind: "driver_pay", settlement_id: row.id });
      expenseItems.push({ kind: "bill_due", bill_id: bill.id });
    `,
    [CASH_FLOW_API]: `
      export type ExpenseLineItem = {
        settlement_id?: string;
        bill_id?: string;
      };
    `,
    [DAILY_PREDICTION_TAB]: `
      <EntityLink kind="settlement" id={item.settlement_id} label={item.label} />
      <EntityLink kind="bill" id={item.bill_id} label={item.label} />
    `,
    [DRIVERS_PAGE]: `
      const aggregates = new Map<string, { liabilityIds: string[] }>();
      const upsertDebt = (driverId, driverName, amount, reason, liabilityId) => {
        if (liabilityId) current.liabilityIds.push(liabilityId);
      };
      <EntityLink kind="liability" id={id} label={\`#\${idx + 1}\`} />
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertLiabilityClusterB(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [CASH_FLOW_SERVICE]: good[CASH_FLOW_SERVICE].replace("settlement_id: row.id", "") },
    { ...good, [CASH_FLOW_SERVICE]: good[CASH_FLOW_SERVICE].replace("bill_id: bill.id", "") },
    { ...good, [CASH_FLOW_API]: good[CASH_FLOW_API].replace("settlement_id?: string;", "") },
    { ...good, [CASH_FLOW_API]: good[CASH_FLOW_API].replace("bill_id?: string;", "") },
    { ...good, [DAILY_PREDICTION_TAB]: good[DAILY_PREDICTION_TAB].replace('kind="settlement"', "") },
    { ...good, [DAILY_PREDICTION_TAB]: good[DAILY_PREDICTION_TAB].replace('kind="bill"', "") },
    { ...good, [DRIVERS_PAGE]: good[DRIVERS_PAGE].replace("liabilityIds: string[]", "") },
    { ...good, [DRIVERS_PAGE]: good[DRIVERS_PAGE].replace("current.liabilityIds.push(liabilityId);", "") },
    { ...good, [DRIVERS_PAGE]: good[DRIVERS_PAGE].replace('kind="liability"', "") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertLiabilityClusterB(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "liability"])];
    if (assertLiabilityClusterB(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add liability to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "liability");
    if (assertLiabilityClusterB(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: drop liability from ${mod}:${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutationCount} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const liveDocs = {};
for (const [mod, rel] of Object.entries(REQUIRED_FILES)) liveDocs[mod] = readJson(rel);
const failures = assertLiabilityClusterB(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
