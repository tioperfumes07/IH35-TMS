#!/usr/bin/env node
/** @matrix-built {"modules":["settlements","safety","factoring"],"cols":["liability"],"leafRe":"^(settlements\\.list|pre_settlements|settlements\\.panel\\.pre_settlements|settlement_close|safety\\.modal\\.escrow_forfeit|safety\\.parity\\.escrow_forfeit|settlements\\.panel\\.pay_run_close|accounting\\.factor_recon)$","task":"LINK-F5187-LIABILITY-COLUMN-HONESTY-CLUSTER-A-GENUINE"} */
/**
 * LINK-F5187 — liability Required-column honesty audit, cluster A genuine-gap batch
 * (settlements/safety/factoring, CC-1's own core money lane). Four real fixes, sharing one
 * root cause: a real driver_finance.driver_liabilities id was already fetched server- or
 * client-side and discarded before reaching an EntityLink.
 *
 *   settlements.list (SettlementsTable.tsx Debt Flag column) + pre_settlements /
 *     settlements.panel.pre_settlements (PreSettlementsPanel.tsx, shared by both leaves and
 *     4 mount sites): the settlements list endpoints (/api/v1/driver-finance/settlements and
 *     /api/v1/drivers/:id/settlements, settlements.routes.ts) already call
 *     recompute_driver_debt() per row for live_debt_flag's dollar total; the SQL function's
 *     source_liabilities jsonb (real ids, db/migrations/202612471500) was computed and
 *     discarded. Now threaded through as SettlementListRow.liability_ids[], rendered as
 *     EntityLink kind="liability" chips in both consumers.
 *   settlement_close (SettlementCloseArrivalPage.tsx): its debtQuery already fetches the same
 *     DebtSummary (source_liabilities included) to compute the escrow-cap indicator; now
 *     renders an "Open liabilities" EntityLink strip alongside it.
 *   safety.modal.escrow_forfeit / safety.parity.escrow_forfeit (EscrowForfeitModal.tsx, one
 *     file, both leaves): the modal already fetches real liabilities via getLiabilitiesByDriver
 *     and lets the operator pick one (linkedLiabilityId) inside a native <option> -- no drill
 *     target possible inside an <option>. Now renders a real EntityLink once one is selected.
 *
 * Two leaves in the same investigated set are RECLASSIFIED false-required (dropped, not
 * force-built) -- see this commit's honesty_audit entries for full reasoning:
 *   settlements.panel.pay_run_close -- the escrow liability this panel deals with is a GL
 *     liability SUB-ACCOUNT (accounting.escrow_accounts), not a driver_finance.driver_liabilities
 *     row; escrow-resolver.service.ts / settlement-payrun-close.routes.ts never touch
 *     driver_liabilities at all. Already honestly linked via kind="account" on its JE legs.
 *   factoring:accounting.factor_recon -- FactorReconciliationItem carries no liability-shaped
 *     field at all; it reconciles invoice amounts vs factor statement, not a single owning
 *     liability record.
 *
 * A third finding, settlements.modal.hold_deduction, is a CONFIRMED functional bug (wrong PATCH
 * target id -- 404s on every real submission) requiring a write-path trace before any fix is
 * safe; filed OPEN in GUARD-WORKORDERS.md (HOLD-DEDUCTION-MODAL-WRONG-PATCH-TARGET-ID), left
 * Required, not touched by this guard.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SETTLEMENTS_ROUTES = "apps/backend/src/driver-finance/settlements.routes.ts";
const DRIVER_FINANCE_API = "apps/frontend/src/api/driverFinance.ts";
const SETTLEMENTS_TABLE = "apps/frontend/src/pages/driver-finance/components/SettlementsTable.tsx";
const PRE_SETTLEMENTS_PANEL = "apps/frontend/src/components/driver-finance/PreSettlementsPanel.tsx";
const SETTLEMENT_CLOSE_PAGE = "apps/frontend/src/pages/driver-finance/SettlementCloseArrivalPage.tsx";
const ESCROW_FORFEIT_MODAL = "apps/frontend/src/pages/safety/components/EscrowForfeitModal.tsx";
const FILES = [
  SETTLEMENTS_ROUTES,
  DRIVER_FINANCE_API,
  SETTLEMENTS_TABLE,
  PRE_SETTLEMENTS_PANEL,
  SETTLEMENT_CLOSE_PAGE,
  ESCROW_FORFEIT_MODAL,
];
const LABEL = "verify-liability-required-honest-cluster-a-genuine";
const SELFTEST = process.argv.includes("--selftest");

const REQUIRED_FILES = {
  settlements: "docs/specs/scoreboard/modules/settlements.required.json",
  factoring: "docs/specs/scoreboard/modules/factoring.required.json",
};

const DROPPED = [
  ["settlements", "settlements.panel.pay_run_close"],
  ["factoring", "accounting.factor_recon"],
];

const KEEP_REQUIRED = [
  ["settlements", "settlements.list"],
  ["settlements", "pre_settlements"],
  ["settlements", "settlements.panel.pre_settlements"],
  ["settlements", "settlement_close"],
  ["settlements", "settlements.modal.hold_deduction"],
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertClusterAGenuine(sources, docs) {
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
    if (!(leaf.required || []).includes("liability")) problems.push(`${mod}:${id} must keep liability`);
  }

  const routes = src[SETTLEMENTS_ROUTES];
  const api = src[DRIVER_FINANCE_API];
  const table = src[SETTLEMENTS_TABLE];
  const panel = src[PRE_SETTLEMENTS_PANEL];
  const closePage = src[SETTLEMENT_CLOSE_PAGE];
  const forfeitModal = src[ESCROW_FORFEIT_MODAL];

  const liabilityIdsOccurrences = (routes.match(/liability_ids:/g) || []).length;
  if (liabilityIdsOccurrences < 2) {
    problems.push(`${SETTLEMENTS_ROUTES}: both settlements list endpoints must thread liability_ids through`);
  }
  if (!/source_liabilities/.test(routes)) problems.push(`${SETTLEMENTS_ROUTES}: must read debt.source_liabilities`);
  if (!/liability_ids\?:\s*string\[\]/.test(api)) problems.push(`${DRIVER_FINANCE_API}: SettlementListRow must type liability_ids`);
  if (!/kind="liability"/.test(table)) problems.push(`${SETTLEMENTS_TABLE}: Debt Flag column must EntityLink kind=liability`);
  if (!/row\.liability_ids/.test(table)) problems.push(`${SETTLEMENTS_TABLE}: must read row.liability_ids`);
  if (!/kind="liability"/.test(panel)) problems.push(`${PRE_SETTLEMENTS_PANEL}: must EntityLink kind=liability per settlement.liability_ids`);
  if (!/settlement\.liability_ids/.test(panel)) problems.push(`${PRE_SETTLEMENTS_PANEL}: must read settlement.liability_ids`);
  if (!/kind="liability"/.test(closePage)) problems.push(`${SETTLEMENT_CLOSE_PAGE}: must EntityLink kind=liability for open liabilities`);
  if (!/source_liabilities/.test(closePage)) problems.push(`${SETTLEMENT_CLOSE_PAGE}: must read debtQuery.data.source_liabilities`);
  if (!/kind="liability"/.test(forfeitModal)) problems.push(`${ESCROW_FORFEIT_MODAL}: must EntityLink kind=liability once linkedLiabilityId is picked`);
  if (!/linkedLiabilityId\s*\?/.test(forfeitModal)) problems.push(`${ESCROW_FORFEIT_MODAL}: EntityLink must be gated on linkedLiabilityId`);

  return problems;
}

function selftest() {
  const good = {
    [SETTLEMENTS_ROUTES]: `
      liability_ids: Array.isArray(debt?.source_liabilities) ? debt.source_liabilities.map(s => String(s?.id ?? "")) : [],
      liability_ids: Array.isArray(debt?.source_liabilities) ? debt.source_liabilities.map(s => String(s?.id ?? "")) : [],
    `,
    [DRIVER_FINANCE_API]: `
      export type SettlementListRow = {
        liability_ids?: string[];
      };
    `,
    [SETTLEMENTS_TABLE]: `
      {(row.liability_ids ?? []).map((id) => (
        <EntityLink kind="liability" id={id} label="view" />
      ))}
    `,
    [PRE_SETTLEMENTS_PANEL]: `
      {(settlement.liability_ids ?? []).map((id) => (
        <EntityLink kind="liability" id={id} label="debt" />
      ))}
    `,
    [SETTLEMENT_CLOSE_PAGE]: `
      {(debtQuery.data?.source_liabilities ?? []).map((liability) => (
        <EntityLink kind="liability" id={String(liability.id)} label="x" />
      ))}
    `,
    [ESCROW_FORFEIT_MODAL]: `
      {linkedLiabilityId ? (
        <EntityLink kind="liability" id={linkedLiabilityId} label="View liability" />
      ) : null}
    `,
  };
  const docs = {};
  for (const [mod, rel] of Object.entries(REQUIRED_FILES)) docs[mod] = readJson(rel);

  const goodProblems = assertClusterAGenuine(good, docs);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  let mutationCount = 0;
  const sourceMutations = [
    { ...good, [SETTLEMENTS_ROUTES]: good[SETTLEMENTS_ROUTES].replace("liability_ids: Array.isArray(debt?.source_liabilities) ? debt.source_liabilities.map(s => String(s?.id ?? \"\")) : [],\n      liability_ids:", "liability_ids:") },
    { ...good, [SETTLEMENTS_ROUTES]: good[SETTLEMENTS_ROUTES].replace(/source_liabilities/g, "xxx") },
    { ...good, [DRIVER_FINANCE_API]: good[DRIVER_FINANCE_API].replace("liability_ids?: string[];", "") },
    { ...good, [SETTLEMENTS_TABLE]: good[SETTLEMENTS_TABLE].replace('kind="liability"', "") },
    { ...good, [SETTLEMENTS_TABLE]: good[SETTLEMENTS_TABLE].replace("row.liability_ids", "row.xxx") },
    { ...good, [PRE_SETTLEMENTS_PANEL]: good[PRE_SETTLEMENTS_PANEL].replace('kind="liability"', "") },
    { ...good, [PRE_SETTLEMENTS_PANEL]: good[PRE_SETTLEMENTS_PANEL].replace("settlement.liability_ids", "settlement.xxx") },
    { ...good, [SETTLEMENT_CLOSE_PAGE]: good[SETTLEMENT_CLOSE_PAGE].replace('kind="liability"', "") },
    { ...good, [SETTLEMENT_CLOSE_PAGE]: good[SETTLEMENT_CLOSE_PAGE].replace("source_liabilities", "xxx") },
    { ...good, [ESCROW_FORFEIT_MODAL]: good[ESCROW_FORFEIT_MODAL].replace('kind="liability"', "") },
    { ...good, [ESCROW_FORFEIT_MODAL]: good[ESCROW_FORFEIT_MODAL].replace("linkedLiabilityId ?", "linkedLiabilityId &&") },
  ];
  for (const mutated of sourceMutations) {
    mutationCount++;
    if (assertClusterAGenuine(mutated, docs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — source mutation ${mutationCount} escaped detection`);
      process.exit(1);
    }
  }
  for (const [mod, id] of DROPPED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = [...new Set([...(leaf.required || []), "liability"])];
    if (assertClusterAGenuine(good, mutatedDocs).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped detection: re-add liability to ${mod}:${id}`);
      process.exit(1);
    }
  }
  for (const [mod, id] of KEEP_REQUIRED) {
    mutationCount++;
    const mutatedDocs = structuredClone(docs);
    const leaf = mutatedDocs[mod].leaves.find((l) => l.id === id);
    leaf.required = (leaf.required || []).filter((c) => c !== "liability");
    if (assertClusterAGenuine(good, mutatedDocs).length === 0) {
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
const failures = assertClusterAGenuine(undefined, liveDocs);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
