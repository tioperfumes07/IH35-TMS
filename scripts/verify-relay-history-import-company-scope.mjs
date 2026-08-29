#!/usr/bin/env node
/**
 * @matrix-built {"modules":["fuel"],"cols":["connectivity"],"leaves":["home.kpi"],"task":"CLASS-F6532-RELAY-HISTORY-IMPORT-COMPANY-SCOPE","vertical":"class-sweep"}
 * The owner-triggered Relay history import must operate on exactly the selected,
 * membership-validated company rather than every flag-enabled operating company.
 */
import fs from "node:fs";
import process from "node:process";

const FILES = {
  home: "apps/frontend/src/pages/fuel/FuelHome.tsx",
  control: "apps/frontend/src/pages/fuel/components/RelayHistoryImport.tsx",
  api: "apps/frontend/src/api/relayDeposits.ts",
  route: "apps/backend/src/integrations/relay-payments/relay-fuel-backfill.routes.ts",
  cron: "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts",
};

function inspect(parts) {
  const errors = [];
  if (!parts.home.includes("<RelayHistoryImport operatingCompanyId={companyId} />")) errors.push("Fuel home does not forward selected company");
  if (!/const request = \{\s*companyId: operatingCompanyId,\s*months,\s*generation: lifecycleGenerationRef\.current/.test(parts.control) || !parts.control.includes("runRelayFuelBackfill(request.companyId, request.months)")) errors.push("control does not snapshot and submit selected company/months");
  if (!/useEffect\(\(\) => \{\s*lifecycleGenerationRef\.current \+= 1;\s*setMonths\(24\);\s*setState\("idle"\);\s*setMsg\(""\);\s*\}, \[operatingCompanyId\]\)/.test(parts.control)) errors.push("company transition does not retire request and reset control");
  if ((parts.control.match(/request\.generation !== lifecycleGenerationRef\.current/g)?.length ?? 0) !== 2) errors.push("success and failure do not reject stale company generation");
  if (!/body: \{ operating_company_id: operatingCompanyId, months \}/.test(parts.api)) errors.push("API client omits operating_company_id");
  if (!parts.route.includes("operating_company_id_required")) errors.push("route does not require explicit company");
  if ((parts.route.match(/resolveOperatingCompanyId\(client, userId, requestedCompanyId\)/g)?.length ?? 0) !== 2) errors.push("status and start routes do not both membership-validate company");
  if (!parts.route.includes("{ months, operatingCompanyId, runId }")) errors.push("route does not constrain backfill target and run identity");
  if (!parts.route.includes('/api/integrations/relay/fuel/backfill/status')) errors.push("route does not expose durable status query-back");
  if (!parts.route.includes("integrations.relay_fuel_ingest_backfill_started")) errors.push("route does not append started evidence");
  if (!parts.cron.includes("integrations.relay_fuel_ingest_backfill_completed") || (parts.route.match(/integrations\.relay_fuel_ingest_backfill_failed/g)?.length ?? 0) !== 2) errors.push("backfill does not append and query terminal evidence on success and every rejected run");
  if (!parts.cron.includes("totalPulled") || !parts.cron.includes("totalUpserted") || !parts.cron.includes("totalSkipped")) errors.push("terminal evidence omits durable result totals");
  if (!parts.control.includes("getRelayFuelBackfillStatus") || !parts.control.includes('data-testid="relay-backfill-status"')) errors.push("control does not render durable status query-back");
  if (!parts.control.includes("refetchInterval")) errors.push("control does not recompute running status");
  if (!parts.control.includes('statusQuery.data?.run?.status === "running"')) errors.push("control permits duplicate launch while canonical run is active");
  if (!/opts\?: \{ months\?: number; operatingCompanyId\?: string; runId\?: string \}/.test(parts.cron)) errors.push("backfill has no company/run target option");
  if (!/activeCompanyIds\.filter\(\(\{ id \}\) => id === opts\.operatingCompanyId\)/.test(parts.cron)) errors.push("backfill does not narrow active companies to target");
  if (!parts.cron.includes("relay_fuel_ingest_backfill_company_not_active")) errors.push("inactive target is not rejected");
  return errors;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const source = read();
  const mutations = [
    ["API company", { ...source, api: source.api.replace("body: { operating_company_id: operatingCompanyId, months }", "body: { months }") }],
    ["membership", { ...source, route: source.route.replaceAll("resolveOperatingCompanyId(client, userId, requestedCompanyId)", "requestedCompanyId") }],
    ["company target", { ...source, cron: source.cron.replace("activeCompanyIds.filter(({ id }) => id === opts.operatingCompanyId)", "activeCompanyIds") }],
    ["control snapshot", { ...source, control: source.control.replace("companyId: operatingCompanyId", "companyId: ''") }],
    ["generation reset", { ...source, control: source.control.replace("lifecycleGenerationRef.current += 1;", "void operatingCompanyId;") }],
    ["stale response", { ...source, control: source.control.replace("request.generation !== lifecycleGenerationRef.current", "false") }],
    ["status route", { ...source, route: source.route.replace('/api/integrations/relay/fuel/backfill/status', '/api/integrations/relay/fuel/backfill/stale') }],
    ["status polling", { ...source, control: source.control.replace("refetchInterval:", "staleInterval:") }],
    ["terminal event", { ...source, cron: source.cron.replace("integrations.relay_fuel_ingest_backfill_completed", "integrations.relay_fuel_ingest_backfill_snapshot") }],
    ["failure event", { ...source, route: source.route.replaceAll("integrations.relay_fuel_ingest_backfill_failed", "integrations.relay_fuel_ingest_backfill_lost") }],
    ["duplicate launch", { ...source, control: source.control.replaceAll('statusQuery.data?.run?.status === "running"', "false") }],
  ];
  const missed = mutations.filter(([, candidate]) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-relay-history-import-company-scope SELFTEST FAIL — ${missed.length}/${mutations.length} mutation(s) survived: ${missed.map(([name]) => name).join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-relay-history-import-company-scope selftest PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const errors = inspect(read());
if (errors.length) {
  console.error("verify-relay-history-import-company-scope FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-relay-history-import-company-scope PASS — selected company is required, validated, and exclusively backfilled");
