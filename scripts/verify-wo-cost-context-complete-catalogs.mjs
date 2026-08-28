import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/maintenance/wo-cost-context.routes.ts", "utf8");
const consumers = [
  "apps/frontend/src/components/expenses/RecordExpenseForm.tsx",
  "apps/frontend/src/components/forms/TwoSectionLineEditor.tsx",
  "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  "apps/frontend/src/pages/banking/components/forms/CreateExpenseForm.tsx",
  "apps/frontend/src/pages/banking/components/forms/ApplyToBillForm.tsx",
].map((file) => [file, fs.readFileSync(file, "utf8")]);

function problems(b = backend, cs = consumers) {
  const detail = cs.find(([file]) => file.endsWith("WorkOrderDetailPage.tsx"))?.[1] ?? "";
  const checks = [
    [!b.match(/LIMIT\s+(200|500)\b/), "all silent catalog caps removed"],
    [b.includes("ORDER BY account_name ASC, id ASC"), "account stable order"],
    [b.includes("ORDER BY name ASC, id ASC"), "item stable order"],
    [b.includes("ORDER BY updated_at DESC NULLS LAST, id ASC") && b.includes("ORDER BY updated_at DESC, id ASC"), "both parts sources stable"],
    [b.match(/ORDER BY rate_name ASC(?: NULLS LAST)?, id ASC/g)?.length === 2, "both labor sources stable"],
    [(b.match(/operating_company_id = \$1::uuid/g) ?? []).length >= 6, "every catalog query company-scoped"],
    [cs.every(([, source]) => source.includes("getWoCostContext")), "all five mounted consumers use canonical context"],
    [/costQ\.isError \? \([\s\S]{0,260}title="Couldn't load work order cost context"[\s\S]{0,220}costQ\.refetch\(\)/.test(detail), "WO detail cost context exposes exact recovery"],
    [/!costQ\.isError && costQ\.data \? \(/.test(detail), "WO detail failed read suppresses retained cost context"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("ORDER BY account_name ASC, id ASC", "ORDER BY account_name ASC LIMIT 500"), consumers],
    [backend.replace("ORDER BY name ASC, id ASC", "ORDER BY name ASC LIMIT 500"), consumers],
    [backend.replace("ORDER BY updated_at DESC NULLS LAST, id ASC", "ORDER BY updated_at DESC LIMIT 500"), consumers],
    [backend.replace("ORDER BY updated_at DESC, id ASC", "ORDER BY updated_at DESC LIMIT 500"), consumers],
    [backend.replace("ORDER BY rate_name ASC NULLS LAST, id ASC", "ORDER BY rate_name ASC LIMIT 200"), consumers],
    [backend.replace("ORDER BY rate_name ASC, id ASC", "ORDER BY rate_name ASC LIMIT 200"), consumers],
    [backend.replace("operating_company_id = $1::uuid", "TRUE"), consumers],
    [backend, consumers.map(([file, source], index) => [file, index === 0 ? source.replaceAll("getWoCostContext", "getLegacyContext") : source])],
    [backend, consumers.map(([file, source]) => [file, file.endsWith("WorkOrderDetailPage.tsx") ? source.replace("costQ.refetch()", "/* planted defect */") : source])],
    [backend, consumers.map(([file, source]) => [file, file.endsWith("WorkOrderDetailPage.tsx") ? source.replace("!costQ.isError && costQ.data", "costQ.data") : source])],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-wo-cost-context-complete-catalogs selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-wo-cost-context-complete-catalogs FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-wo-cost-context-complete-catalogs PASS — expense/item/parts/labor catalogs are complete, stable, company-scoped across five mounted consumers");
