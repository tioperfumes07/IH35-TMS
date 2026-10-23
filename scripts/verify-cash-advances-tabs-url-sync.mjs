#!/usr/bin/env node
/**
 * verify-cash-advances-tabs-url-sync.mjs — Ops F: Cash Advances tabs use ?tab=.
 *
 * ROUND 443.250 — also asserts Settlements-CashAdvances V3 KPI strip on CashAdvancesKpiRow
 * (V3KpiTile + data-cash-advances-v3-kpis + board labels). Piggyback EVEN step 990; no new claim.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advances-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/cash-advances/CashAdvancesHome.tsx";
const KPI_ROW = "apps/frontend/src/pages/cash-advances/components/CashAdvancesKpiRow.tsx";

function failures(source) {
  const errors = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseCashAdvancesTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<(typeof SUBNAV)[number][1]>("all")')) {
    errors.push("local tab useState still present");
  }
  for (const needle of [
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

/** ROUND 443.250 Settlements CashAdvances V3 board chrome. */
function kpiV3Failures(source) {
  const errors = [];
  if (!source.includes("V3KpiTile")) {
    errors.push("CashAdvancesKpiRow must render V3KpiTile (ROUND 443.250 CashAdvances V3)");
  }
  if (!source.includes("data-cash-advances-v3-kpis")) {
    errors.push("CashAdvancesKpiRow must mark data-cash-advances-v3-kpis for the V3 board strip");
  }
  for (const label of [
    "Advances on file",
    "Requests awaiting owner",
    "Outstanding to recover",
    "Recovered this period",
  ]) {
    if (!new RegExp(`label=["']${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["']`).test(source)) {
      errors.push(`CashAdvancesKpiRow V3 strip must include board label "${label}"`);
    }
  }
  if (!source.includes('amount(kpis, "total_outstanding")')) {
    errors.push('CashAdvancesKpiRow must keep total_outstanding (liability KPI; engine unchanged)');
  }
  if (!source.includes('amount(kpis, "pending_approval")')) {
    errors.push('CashAdvancesKpiRow must keep pending_approval (Requests awaiting owner)');
  }
  if (!source.includes('amount(kpis, "advances_on_file")')) {
    errors.push('CashAdvancesKpiRow must read advances_on_file (Advances on file count)');
  }
  return errors;
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = failures(source);
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")} in ${PAGE}`);
  const kpiSource = fs.readFileSync(path.join(ROOT, KPI_ROW), "utf8");
  const kpiErrors = kpiV3Failures(kpiSource);
  if (kpiErrors.length) throw new Error(`${LABEL}: ${kpiErrors.join("; ")} in ${KPI_ROW}`);
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const good = `useSearchParams searchParams.get("tab") parseCashAdvancesTab params.set("tab", next)
    title="Couldn't load cash advance totals" onRetry={() => void kpisQuery.refetch()}
    title="Couldn't load cash advances" onRetry={() => void listQuery.refetch()} listQuery.isError ? (
    title="Couldn't load cash advance details" onRetry={() => void detailQuery.refetch()}`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed: ${failures(good).join("; ")}`);
  const mutations = [
    "useSearchParams",
    'title="Couldn\'t load cash advance totals"',
    "onRetry={() => void kpisQuery.refetch()}",
    'title="Couldn\'t load cash advances"',
    "onRetry={() => void listQuery.refetch()}",
    'title="Couldn\'t load cash advance details"',
    "onRetry={() => void detailQuery.refetch()}",
    "listQuery.isError ? (",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  const goodKpi = `
    import { V3KpiTile } from "../../../components/v3/V3KpiTile";
    data-cash-advances-v3-kpis="1"
    <V3KpiTile label="Advances on file" value="12" />
    <V3KpiTile label="Requests awaiting owner" value="0" />
    <V3KpiTile label="Outstanding to recover" value="$0.00" />
    <V3KpiTile label="Recovered this period" value="—" />
    amount(kpis, "total_outstanding")
    amount(kpis, "pending_approval")
    amount(kpis, "advances_on_file")
  `;
  if (kpiV3Failures(goodKpi).length) {
    throw new Error(`${LABEL}: good KPI fixture failed: ${kpiV3Failures(goodKpi).join("; ")}`);
  }
  const v3Stripped = goodKpi.replace(/V3KpiTile/g, "LegacyKpi").replace(/data-cash-advances-v3-kpis/g, "data-legacy");
  if (!kpiV3Failures(v3Stripped).some((e) => e.includes("V3KpiTile"))) {
    throw new Error(`${LABEL}: V3KpiTile removal should fail`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} tab mutations + V3 KPI markers caught)`);
} else run();
