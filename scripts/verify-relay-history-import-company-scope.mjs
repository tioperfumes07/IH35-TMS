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
  if (!parts.control.includes("runRelayFuelBackfill(operatingCompanyId, months)")) errors.push("control does not submit selected company");
  if (!/body: \{ operating_company_id: operatingCompanyId, months \}/.test(parts.api)) errors.push("API client omits operating_company_id");
  if (!parts.route.includes("operating_company_id_required")) errors.push("route does not require explicit company");
  if (!parts.route.includes("resolveOperatingCompanyId(client, userId, requestedCompanyId)")) errors.push("route does not membership-validate company");
  if (!parts.route.includes("{ months, operatingCompanyId }")) errors.push("route does not constrain backfill target");
  if (!/opts\?: \{ months\?: number; operatingCompanyId\?: string \}/.test(parts.cron)) errors.push("backfill has no company target option");
  if (!/activeCompanyIds\.filter\(\(\{ id \}\) => id === opts\.operatingCompanyId\)/.test(parts.cron)) errors.push("backfill does not narrow active companies to target");
  if (!parts.cron.includes("relay_fuel_ingest_backfill_company_not_active")) errors.push("inactive target is not rejected");
  return errors;
}

const read = () => Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

if (process.argv.includes("--selftest")) {
  const source = read();
  const mutations = [
    { ...source, api: source.api.replace("body: { operating_company_id: operatingCompanyId, months }", "body: { months }") },
    { ...source, route: source.route.replace("resolveOperatingCompanyId(client, userId, requestedCompanyId)", "requestedCompanyId") },
    { ...source, cron: source.cron.replace("activeCompanyIds.filter(({ id }) => id === opts.operatingCompanyId)", "activeCompanyIds") },
  ];
  const missed = mutations.filter((candidate) => inspect(candidate).length === 0);
  if (missed.length) {
    console.error(`verify-relay-history-import-company-scope SELFTEST FAIL — ${missed.length}/3 mutation(s) survived`);
    process.exit(1);
  }
  console.log("verify-relay-history-import-company-scope selftest PASS — 3/3 planted defects rejected");
  process.exit(0);
}

const errors = inspect(read());
if (errors.length) {
  console.error("verify-relay-history-import-company-scope FAIL:\n" + errors.map((error) => `  - ${error}`).join("\n"));
  process.exit(1);
}
console.log("verify-relay-history-import-company-scope PASS — selected company is required, validated, and exclusively backfilled");
