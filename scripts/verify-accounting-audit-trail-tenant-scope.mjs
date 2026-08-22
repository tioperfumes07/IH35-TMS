#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/routes.ts");
const servicePath = path.join(process.cwd(), "apps/backend/src/accounting/audit-trail/service.ts");
const LABEL = "verify:accounting-audit-trail-tenant-scope";

for (const file of [routePath, servicePath]) {
  if (!fs.existsSync(file)) {
    console.error(`${LABEL} — FAILED\n- missing required file: ${file}`);
    process.exit(1);
  }
}

const routeSource = fs.readFileSync(routePath, "utf8");
const serviceSource = fs.readFileSync(servicePath, "utf8");

function between(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

function replaceLast(source, needle, replacement) {
  const at = source.lastIndexOf(needle);
  return at < 0 ? source : source.slice(0, at) + replacement + source.slice(at + needle.length);
}

function audit(routes, service) {
  const failures = [];
  const listRoute = between(routes, 'app.get("/api/v1/accounting/audit-trail"', 'app.get("/api/v1/accounting/audit-trail/source-lineage"');
  const lineageRoute = between(routes, 'app.get("/api/v1/accounting/audit-trail/source-lineage"', "\n  });\n}");
  const listService = between(service, "export async function listAccountingAuditTrail(", "export async function listAccountingSourceLineage(");
  const lineageService = between(service, "export async function listAccountingSourceLineage(", "\n}");

  for (const [name, block, call] of [
    ["audit-trail list route", listRoute, "listAccountingAuditTrail"],
    ["source-lineage route", lineageRoute, "listAccountingSourceLineage"],
  ]) {
    if (!block) failures.push(`${name} is not mounted`);
    if (!block.includes("withCompanyScope(user.uuid, query.data.operating_company_id")) {
      failures.push(`${name} must execute inside withCompanyScope for the selected company`);
    }
    if (!block.includes(`${call}(client, {`) || !block.includes("operating_company_id: query.data.operating_company_id")) {
      failures.push(`${name} must pass the selected operating_company_id into its service`);
    }
  }
  if (!/listQuerySchema = z\.object\(\{\s*operating_company_id: z\.string\(\)\.uuid\(\)/.test(routes)) {
    failures.push("audit-trail list schema must require operating_company_id UUID");
  }
  if (!/lineageQuerySchema = z\.object\(\{\s*operating_company_id: z\.string\(\)\.uuid\(\)/.test(routes)) {
    failures.push("source-lineage schema must require operating_company_id UUID");
  }
  if (!/const where = \["jp\.operating_company_id = \$1::uuid"\]/.test(listService)) {
    failures.push("audit-trail list query must independently filter postings by operating_company_id");
  }
  if (!/JOIN accounting\.journal_entries je[\s\S]*?je\.operating_company_id = jp\.operating_company_id/.test(listService)) {
    failures.push("audit-trail list must same-company join journal entries");
  }
  const lineageCompanyPredicates = lineageService.match(/jp\.operating_company_id = \$1::uuid/g)?.length ?? 0;
  if (lineageCompanyPredicates < 2) {
    failures.push("source-lineage query must company-scope both direct and payment-alias branches");
  }
  if (!/JOIN accounting\.journal_entries je[\s\S]*?je\.operating_company_id = jp\.operating_company_id/.test(lineageService)) {
    failures.push("source-lineage must same-company join journal entries");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const wrapper = "withCompanyScope(user.uuid, query.data.operating_company_id";
  const companyPredicate = "jp.operating_company_id = $1::uuid";
  const plants = [
    ["list route company wrapper", routeSource.replace(wrapper, "UNSCOPED_LIST(user.uuid, query.data.operating_company_id"), serviceSource],
    ["lineage route company wrapper", replaceLast(routeSource, wrapper, "UNSCOPED_LINEAGE(user.uuid, query.data.operating_company_id"), serviceSource],
    ["list posting predicate", routeSource, serviceSource.replace('const where = ["jp.operating_company_id = $1::uuid"]', "const where = []")],
    ["list JE company join", routeSource, serviceSource.replace("AND je.operating_company_id = jp.operating_company_id", "AND true")],
    ["lineage direct company predicate", routeSource, serviceSource.replace(companyPredicate, "true")],
    ["lineage alias company predicate", routeSource, replaceLast(serviceSource, companyPredicate, "true")],
  ];
  let caught = 0;
  for (const [name, routes, service] of plants) {
    if (!audit(routes, service).length) {
      console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} --selftest PASS — ${caught}/${plants.length} independent tenant-scope mutations caught`);
  process.exit(0);
}

const failures = audit(routeSource, serviceSource);
if (failures.length) {
  console.error(`${LABEL} — FAILED\n${failures.map((message) => `- ${message}`).join("\n")}`);
  process.exit(1);
}

console.log(`${LABEL} — OK — list + source-lineage routes and queries are independently company-scoped`);
