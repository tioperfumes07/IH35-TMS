#!/usr/bin/env node
import fs from "node:fs";

const routesFile = "apps/backend/src/integrations/integrity-monitors/driver-vendor-mapping.routes.ts";
const pageFile = "apps/frontend/src/pages/safety/integrity-reports/DriverVendorMappingTab.tsx";
const routes = fs.readFileSync(routesFile, "utf8");
const page = fs.readFileSync(pageFile, "utf8");

function audit(routeText, pageText) {
  const failures = [];
  const need = (ok, message) => { if (!ok) failures.push(message); };
  need(routeText.includes("latestSnapshotsByCompany = new Map<string, MappingSnapshot>()"), "backend snapshots are not company-keyed");
  need(/app\.get\("\/api\/integrations\/integrity\/driver-vendor-mapping"[\s\S]{0,700}operating_company_id: z\.string\(\)\.uuid\(\)[\s\S]{0,700}setScopedCompanyContext\(client, user\.uuid, query\.data\.operating_company_id\)/.test(routeText), "GET does not validate and authorize requested company");
  need(routeText.includes("latestSnapshotsByCompany.get(query.data.operating_company_id) ?? null"), "GET does not return only requested company snapshot");
  need(routeText.includes("latestSnapshotsByCompany.set(body.data.operating_company_id"), "scan does not persist snapshot under submitting company");
  need(!/let latestSnapshot\b/.test(routeText), "legacy process-global snapshot remains");
  need(/fetchSnapshot\(operatingCompanyId: string\)[\s\S]{0,260}operating_company_id: operatingCompanyId/.test(pageText), "frontend GET is not company-scoped");
  need(pageText.includes('["integrity", "driver-vendor-mapping", companyId]'), "frontend cache is not company-keyed");
  need(/mutationFn: \(input: \{ companyId: string; generation: number \}\) => triggerScan\(input\.companyId\)/.test(pageText), "scan does not submit immutable company context");
  need(/input\.generation !== actionGenerationRef\.current[\s\S]{0,180}\["integrity", "driver-vendor-mapping", input\.companyId\]/.test(pageText), "stale scan success is not rejected or exact company cache not refreshed");
  need(/input\.generation === actionGenerationRef\.current[\s\S]{0,100}setScanError/.test(pageText), "stale scan error is not rejected");
  need(/scanMutation\.mutate\(\{ companyId, generation: actionGenerationRef\.current \}\)/.test(pageText), "scan button does not capture company lifecycle");
  need(pageText.includes("@matrix-built modules=safety cols=driver,vendor,connectivity,reverse_link"), "leaf annotation missing");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [routes, page, /latestSnapshotsByCompany = new Map<string, MappingSnapshot>\(\)/, "latestSnapshot = null"],
    [routes, page, /setScopedCompanyContext\(client, user\.uuid, query\.data\.operating_company_id\)/, "void client"],
    [routes, page, /latestSnapshotsByCompany\.get\(query\.data\.operating_company_id\) \?\? null/, "null"],
    [routes, page, /latestSnapshotsByCompany\.set\(body\.data\.operating_company_id/, "latestSnapshotsByCompany.set('all'"],
    [routes, page, /operating_company_id: operatingCompanyId/, "operating_company_id: ''"],
    [routes, page, /\["integrity", "driver-vendor-mapping", companyId\]/, '["integrity", "driver-vendor-mapping"]'],
    [routes, page, /triggerScan\(input\.companyId\)/, "triggerScan(companyId)"],
    [routes, page, /input\.generation !== actionGenerationRef\.current/, "false"],
    [routes, page, /input\.generation === actionGenerationRef\.current/, "true"],
  ];
  for (const [index, [routeSource, pageSource, pattern, replacement]] of mutations.entries()) {
    const inRoutes = pattern.test(routeSource);
    pattern.lastIndex = 0;
    const mutatedRoutes = inRoutes ? routeSource.replace(pattern, replacement) : routeSource;
    const mutatedPage = inRoutes ? pageSource : pageSource.replace(pattern, replacement);
    if ((mutatedRoutes === routeSource && mutatedPage === pageSource) || audit(mutatedRoutes, mutatedPage).length === 0) throw new Error(`mutation ${index + 1} escaped`);
  }
  console.log(`verify-driver-vendor-snapshot-company-isolation selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const failures = audit(routes, page);
if (failures.length) {
  console.error(`verify-driver-vendor-snapshot-company-isolation FAIL — ${failures.join("; ")}`);
  process.exit(1);
}
console.log("verify-driver-vendor-snapshot-company-isolation PASS — GET/cache/scan snapshots are company-isolated end to end");
