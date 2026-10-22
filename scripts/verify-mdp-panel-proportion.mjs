#!/usr/bin/env node
// MDP-PANEL-PROPORTION — equal-height income/expense panels + KPI row + shared totals wiring.
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = process.argv.find(arg => arg.startsWith("--root="))?.slice(7) ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const tabPath = join(root, "apps/frontend/src/pages/cash-flow/tabs/ManualDailyProjectionsTab.tsx");
const tab = readFileSync(tabPath, "utf8");
const optional = file => existsSync(join(root,file)) ? readFileSync(join(root,file),"utf8") : "";
const pull = optional("apps/backend/src/cash-flow/manual-pull.service.ts");
const writer = optional("apps/backend/src/forecast/cash-forecast-entry.service.ts");
const route = readFileSync(join(root,"apps/backend/src/cash-flow/cash-flow.routes.ts"),"utf8");
const fail = (m) => {
  console.error(`FAIL verify-mdp-panel-proportion: ${m}`);
  process.exit(1);
};

// Equal-height side-by-side panels.
if (!/lg:grid-cols-2[\s\S]{0,40}items-stretch|items-stretch[\s\S]{0,40}lg:grid-cols-2/.test(tab)) {
  fail("panel grid must use lg:grid-cols-2 with items-stretch");
}
if (!/data-mdp-panels="equal-height"/.test(tab)) fail('must declare data-mdp-panels="equal-height"');
if (!/min-h-\[24rem\][\s\S]{0,40}flex-col/.test(tab) || !/h-full[\s\S]{0,60}min-h-\[24rem\]/.test(tab)) {
  fail("ProjectionPanel root must be h-full min-h-[24rem] flex flex-col");
}
if (!/data-mdp-panel-list=\{direction\}[\s\S]{0,80}flex-1 overflow-auto/.test(tab) &&
    !/flex-1 overflow-auto[\s\S]{0,80}data-mdp-panel-list=\{direction\}/.test(tab)) {
  fail("panel list area must be flex-1 overflow-auto (data-mdp-panel-list)");
}

// KPI row — uniform card height + slate tokens only (no amber/emerald).
if (!/data-mdp-kpi-row="true"/.test(tab)) fail('KPI row must declare data-mdp-kpi-row="true"');
if (!/min-h-\[5\.5rem\][\s\S]{0,120}data-mdp-kpi="income"/.test(tab) &&
    !/data-mdp-kpi="income"[\s\S]{0,120}min-h-\[5\.5rem\]/.test(tab)) {
  fail("KPI cards must use min-h-[5.5rem] uniform height");
}
if (/\b(text|bg|border)-(amber|emerald|yellow)-/.test(tab)) {
  fail("MDP KPI row must not introduce amber/emerald/yellow palette tokens");
}
if (!/data-mdp-kpi-total="income"[\s\S]{0,120}totalIncome/.test(tab) &&
    !/totalIncome[\s\S]{0,120}data-mdp-kpi-total="income"/.test(tab)) {
  fail("Expected Income KPI must render totalIncome from computeProjectionTotals");
}

// Shared totals wiring — KPI + panel header/footer all from parent computeProjectionTotals.
if (!/computeProjectionTotals\(entries\)/.test(tab)) fail("tab must compute totals via computeProjectionTotals(entries)");
if (!/panelTotalCents=\{totalIncome\}/.test(tab) || !/panelTotalCents=\{totalExpense\}/.test(tab)) {
  fail("panels must receive panelTotalCents from computeProjectionTotals destructuring");
}
if (!/data-mdp-header-total=\{direction\}[\s\S]{0,60}panelTotalCents/.test(tab)) {
  fail("panel header total must display panelTotalCents (same source as KPI)");
}
if (!/data-mdp-footer-total=\{direction\}[\s\S]{0,60}panelTotalCents/.test(tab)) {
  fail("panel footer total must display panelTotalCents (same source as KPI)");
}

// Pull/create must invalidate entries cache so both panels refresh together.
if (!/invalidateQueries\(\{ queryKey: \["forecast", "entries"/.test(tab)) {
  fail("must invalidate forecast entries query after mutations");
}
if (!/pullMutation = useMutation\([\s\S]*onSuccess:[\s\S]*invalidateQueries[\s\S]*onError:[\s\S]*invalidateQueries/.test(tab)) {
  fail("pullMutation must invalidate entries on both onSuccess and onError (GO-0042)");
}

function layoutProblems(src) {
  const problems = [];
  if (!/items-stretch/.test(src)) problems.push("missing items-stretch");
  if (!/panelTotalCents=\{totalIncome\}/.test(src)) problems.push("missing panelTotalCents wiring");
  if (!/data-mdp-kpi-row="true"/.test(src)) problems.push("missing kpi row marker");
  return problems;
}

function pullProblems(frontend, engine, snapshotWriter, routes) {
  const problems=[];
  if (!frontend.includes("return pullManualTransactions(operatingCompanyId, projectionDate)")) problems.push("one atomic pull API required");
  if (/list(?:Bills|Expenses|Invoices|BillPayments)\(/.test(frontend)) problems.push("paged register is not a pull source");
  const sql=engine.split("export const MANUAL_PULL_SOURCES_SQL = `")[1]?.split("`;\n")[0] ?? "";
  if (!sql || /\b(?:LIMIT|OFFSET)\b/.test(sql)) problems.push("pull source must be uncapped");
  for(const contract of ['${openBill("b", BILL_OPEN_BALANCE_SQL)}','${liveExpense("e")}','${openArInvoiceConditions("i").join(" AND ")}','bp.settlement_deduction_noncash IS NOT TRUE']) {
    if(!sql.includes(contract))problems.push(`missing source contract ${contract}`);
  }
  for(const alias of ["b","e","bp","i"])if(!sql.includes(`${alias}.operating_company_id=$1::uuid`))problems.push(`unscoped ${alias}`);
  for(const contract of ["pg_advisory_xact_lock", "await createCashForecastEntry(client,userId", "planManualPull(sources,existing)", "[transaction:${source.kind}:${source.id}]"]) {
    if(!engine.includes(contract))problems.push(`missing retry/writer contract ${contract}`);
  }
  if(/(?:DELETE FROM|UPDATE) forecast\.cash_entries/.test(engine))problems.push("old snapshot must remain untouched");
  if(!snapshotWriter.includes("INSERT INTO forecast.cash_entries") || !snapshotWriter.includes("await appendCrudAudit"))problems.push("canonical writer must audit snapshot");
  if(!routes.includes("withOperatingCompanyScope(user.uuid,body.data.operating_company_id"))problems.push("pull requires one scoped transaction");
  return problems;
}
const pullFailures=pullProblems(tab,pull,writer,route);
if(pullFailures.length)fail(pullFailures.join("; "));

if (process.argv.includes("--selftest")) {
  const good={tab,pull,writer,route};
  const plants=[
    ["tab","return pullManualTransactions(operatingCompanyId, projectionDate)","return listInvoices(operatingCompanyId, {limit:100})"],
    ["pull","ORDER BY kind,id","ORDER BY kind,id LIMIT 100"],
    ["pull",'${openBill("b", BILL_OPEN_BALANCE_SQL)}',"b.status='unpaid'"],
    ["pull",'${liveExpense("e")}',"TRUE"],
    ["pull",'${openArInvoiceConditions("i").join(" AND ")}',"TRUE"],
    ["pull","bp.settlement_deduction_noncash IS NOT TRUE","TRUE"],
    ["pull","pg_advisory_xact_lock","no_lock"],
    ["pull","await createCashForecastEntry(client,userId","await otherWriter(client,userId"],
    ["writer","await appendCrudAudit","await ignoredAudit"],
    ["route","withOperatingCompanyScope(user.uuid,body.data.operating_company_id","unscoped(user.uuid,body.data.operating_company_id"],
  ];
  for(const [key,from,to] of plants){
    if(!good[key].includes(from))fail(`inert plant ${from}`);
    const mutated={...good,[key]:good[key].replaceAll(from,to)};
    if(!pullProblems(mutated.tab,mutated.pull,mutated.writer,mutated.route).length)fail(`escaped plant ${from}`);
  }
  console.log(`manual pull selftest PASS ${plants.length}/${plants.length}`);
  const broken = tab
    .replace(/items-stretch/g, "")
    .replace(/panelTotalCents=\{totalIncome\}/g, "entries={income}")
    .replace(/data-mdp-kpi-row="true"/g, "");
  const planted = layoutProblems(broken);
  if (planted.length < 3) {
    console.error(`FAIL verify-mdp-panel-proportion SELFTEST: expected ≥3 planted problems, got ${planted.length}: ${planted.join("; ")}`);
    process.exit(1);
  }
  const live = layoutProblems(tab);
  if (live.length) {
    console.error(`FAIL verify-mdp-panel-proportion SELFTEST: live file missing: ${live.join("; ")}`);
    process.exit(1);
  }
  console.log("PASS verify-mdp-panel-proportion --selftest");
  process.exit(0);
}

console.log("PASS verify-mdp-panel-proportion");
