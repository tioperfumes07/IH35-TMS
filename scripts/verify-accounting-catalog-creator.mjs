#!/usr/bin/env node
/** Shared Accounting catalog creator: mounted modal → company-scoped POST → canonical table. */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:accounting-catalog-creator";
const FILES = {
  modal: "apps/frontend/src/pages/lists/accounting/AccountingCatalogModal.tsx",
  list: "apps/frontend/src/pages/lists/accounting/AccountingCatalogListPage.tsx",
  api: "apps/frontend/src/api/catalogs-accounting.ts",
  factory: "apps/backend/src/catalogs/fuel/factory.ts",
  index: "apps/backend/src/catalogs/accounting/index.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function between(source, start, end) {
  const from = source.indexOf(start);
  if (from < 0) return "";
  const to = source.indexOf(end, from + start.length);
  return to < 0 ? source.slice(from) : source.slice(from, to);
}

function audit(source) {
  const failures = [];
  const apiCreate = between(source.api, "create(operating_company_id:", "\n    update(");
  const factoryPost = between(source.factory, "app.post(basePath", "app.patch(`${basePath}/:id`");
  const canonicalInsert = between(factoryPost, "const res = await client.query(", "const row = res.rows[0]");
  if (!/nextSortOrder/.test(source.modal) || !/sort_order/.test(source.modal)) failures.push("modal must expose Sort order wired to nextSortOrder");
  if (!/disabled=\{readOnly \|\| mode === "edit"\}/.test(source.modal)) failures.push("modal must keep Code immutable in edit mode");
  if (!/const canSubmit\b/.test(source.modal) || !/disabled=\{isSaving \|\| !canSubmit\}/.test(source.modal)) failures.push("modal submit must be disabled until valid");
  if (!/Created \{new Date\(row\.created_at\)/.test(source.modal)) failures.push("modal edit view must surface audit metadata");
  if (!/const created = await client\.create\(operatingCompanyId, body\)/.test(source.modal)) failures.push("modal create must pass selected company and body to canonical client");
  if (!/onSaved\(\{ id: String\(created\.id\), label: form\.display_name\.trim\(\) \}\)/.test(source.modal)) failures.push("modal must return created canonical id to nested picker/list caller");

  if (!/nextSortOrder = rows\.length \? Math\.max/.test(source.list)) failures.push("list must compute nextSortOrder=max+1");
  if (!/nextSortOrder=\{nextSortOrder\}/.test(source.list)) failures.push("list must pass nextSortOrder to modal");

  if (!/const basePath = `\/api\/v1\/catalogs\/accounting\/\$\{urlSegment\}`/.test(source.api)) failures.push("client must target canonical Accounting catalog base route");
  if (!/encodeURIComponent\(operating_company_id\)/.test(apiCreate) || !/method: "POST"/.test(apiCreate) || !/\bbody\b/.test(apiCreate)) failures.push("client create must POST body with selected operating_company_id");

  if (!factoryPost) failures.push("shared factory must mount POST on the same base path");
  if (!/companyQuerySchema\.safeParse\(req\.query/.test(factoryPost)) failures.push("shared factory POST must validate selected company query");
  if (!/const created = await withCompanyScope\(authUser\.uuid, parsedQuery\.data\.operating_company_id/.test(factoryPost)) failures.push("shared factory POST must run inside selected company scope");
  if (!/INSERT INTO catalogs\.\$\{config\.tableName\} \([\s\S]*?operating_company_id, code, display_name/.test(canonicalInsert)) failures.push("shared factory POST must insert selected company into canonical configured table");
  if (!/\[\s*parsedQuery\.data\.operating_company_id,\s*b\.code/.test(canonicalInsert)) failures.push("canonical INSERT values must bind selected company first");

  const expected = [
    ["chart_of_accounts_seeds", "chart-of-accounts-seeds"],
    ["expense_categories", "expense-categories"],
    ["payment_methods", "payment-methods"],
    ["tax_codes", "tax-codes"],
    ["currency_codes", "currency-codes"],
  ];
  for (const [table, segment] of expected) {
    const registration = new RegExp(`createCompanyScopedCatalogRoutes\\(app, \\{[\\s\\S]{0,180}?tableName: "${table}"[\\s\\S]{0,180}?urlSegment: "${segment}"`);
    if (!registration.test(source.index)) failures.push(`${segment} must register canonical catalogs.${table} company-scoped creator`);
  }
  return failures;
}

const source = Object.fromEntries(Object.entries(FILES).map(([key, rel]) => [key, read(rel)]));

if (process.argv.includes("--selftest")) {
  const plants = [
    ["modal selected company", "modal", "client.create(operatingCompanyId, body)", "client.create('', body)"],
    ["created id return", "modal", "id: String(created.id)", "id: ''"],
    ["client POST", "api", 'method: "POST"', 'method: "GET"'],
    ["client company query", "api", "create(operating_company_id: string, body: AccountingCatalogCreateBody) {\n      return apiRequest<{ id: string }>(`${basePath}?operating_company_id=${encodeURIComponent(operating_company_id)}`", "create(operating_company_id: string, body: AccountingCatalogCreateBody) {\n      return apiRequest<{ id: string }>(`${basePath}?operating_company_id=`"],
    ["factory POST mount", "factory", "app.post(basePath", "app.get(basePath"],
    ["factory company scope", "factory", "const created = await withCompanyScope(authUser.uuid, parsedQuery.data.operating_company_id", "const created = await UNSCOPED(authUser.uuid, parsedQuery.data.operating_company_id"],
    ["canonical company column", "factory", "operating_company_id, code, display_name", "code, display_name"],
    ["canonical company value", "factory", "parsedQuery.data.operating_company_id,\n          b.code", "b.code"],
    ["expense-category registration", "index", 'tableName: "expense_categories"', 'tableName: "removed_expense_categories"'],
    ["payment-method registration", "index", 'urlSegment: "payment-methods"', 'urlSegment: "removed-payment-methods"'],
  ];
  let caught = 0;
  for (const [name, key, needle, replacement] of plants) {
    if (!source[key].includes(needle)) {
      console.error(`${LABEL} --selftest FAIL — plant missing: ${name}`);
      process.exit(1);
    }
    const fixture = { ...source, [key]: source[key].replace(needle, replacement) };
    if (!audit(fixture).length) {
      console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`${LABEL} --selftest PASS — ${caught}/${plants.length} independent create-path mutations caught`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} — FAILED\n${failures.map((failure) => `- ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} — OK — 5 shared Accounting catalogs Save→scoped POST→canonical table + created id ratcheted`);
