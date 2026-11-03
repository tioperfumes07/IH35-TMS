#!/usr/bin/env node
/**
 * CC-1 rows 198 / 203 / 222 (LEAD 11-03).
 * 198 (D020) GET /api/v1/accounting/expense-category-map took 8,831 ms; its SQL is 0.67 ms on prod (EXPLAIN ANALYZE as
 *   ih35_app). The time was pool wait: accounting withCompanyScope checked membership through the (userId, opco)
 *   overload = a SECOND pool checkout per request, and the Fuel board fired 7 queries on every tab into a 5-connection
 *   pool. Locked: one checkout (membership on the scoped client, before the GUC) + Fuel board queries gated by tab.
 * 203 (D027) Load Costs Settlement/Tour links: the API returns the settlement's own status/open flag and the page labels
 *   every settlement link through ONE helper (number, else PENDING) — never the load's status, never "—"/"Settlement".
 * 222 (D046) Banking drift alerts: API resolves display_name → account_name → ledger account name; the UI never falls
 *   back to the generic word "Account".
 * --selftest plants each defect back in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cc1-rows-198-203-222";
const F = {
  scope: "apps/backend/src/accounting/db-scope.ts",
  fuel: "apps/frontend/src/pages/fuel/FuelPlannerHome.tsx",
  boardApi: "apps/backend/src/accounting/load-costs-board.routes.ts",
  board: "apps/frontend/src/pages/accounting/LoadCostsBoardPage.tsx",
  driftApi: "apps/backend/src/banking/drift-alerts.routes.ts",
  driftHome: "apps/frontend/src/pages/banking/components/BankingHomeBoard.tsx",
  driftPanel: "apps/frontend/src/pages/banking/components/DriftAlertsPanel.tsx",
};

function between(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = end ? src.indexOf(end, i + start.length) : -1;
  return src.slice(i, j < 0 ? undefined : j);
}

export function findDefects(s) {
  const out = [];
  // 198 — one pool checkout per scoped request.
  const scope = between(s.scope, "export async function withCompanyScope", "\n}\n");
  const wcu = scope.indexOf("withCurrentUser(");
  const assertAt = scope.indexOf("assertCompanyMembership(");
  if (wcu < 0 || assertAt < 0 || assertAt < wcu) out.push("198: withCompanyScope checks membership outside the scoped transaction (second pool checkout)");
  if (!/assertCompanyMembership\(client, userId, operatingCompanyId\)/.test(scope)) out.push("198: membership probe does not run on the scoped client");
  if (scope.indexOf("set_config('app.operating_company_id'") < assertAt) out.push("198: tenant GUC set before the membership assert");
  // 198 — Fuel board queries fetch only on the tab that renders them.
  for (const fn of ["getFuelDashboard", "getLovesSyncStatus", "getFuelActiveRoutes", "getFuelPlannerSettings", "getFuelComplianceSummary", "getFuelSavingsSummary"]) {
    const block = between(s.fuel, `queryFn: () => ${fn}(`, "});");
    if (!block) { out.push(`198: ${fn} query missing`); continue; }
    const enabled = (block.match(/enabled:\s*([^\n]+)/) || [])[1] || "";
    if (!/onPlanner|tab ===/.test(enabled)) out.push(`198: ${fn} fires on every Fuel tab (enabled not gated by tab)`);
  }
  // 203 — settlement state at the source + one label helper.
  const si = between(s.boardApi, "settlement_info AS (", "driver_pay_amounts AS (");
  if (!/ds\.status::text AS settlement_status/.test(si) || !/AS settlement_is_open/.test(si)) out.push("203: load-costs-board settlement_info omits the settlement's own status/open flag");
  if (!/si\.settlement_status, si\.settlement_is_open/.test(s.boardApi)) out.push("203: load-costs-board does not return settlement_status/settlement_is_open");
  if (/label=\{[^}]*\?\? "Settlement"\}/.test(s.board)) out.push('203: a Load Costs settlement link falls back to the generic "Settlement" label');
  if (/settlementLabel\(\{[^}]*status: r\.status/.test(s.board)) out.push("203: board settlement label derived from the LOAD status");
  const links = s.board.match(/<EntityLink kind="settlement"[^>]*>/g) || [];
  if (!links.length || links.some((l) => !/settlementLinkLabel\(/.test(l))) out.push("203: a settlement EntityLink is not labelled by settlementLinkLabel()");
  const helper = between(s.board, "function settlementLinkLabel(", "\n}\n");
  if (!/lbl === DASH \?/.test(helper)) out.push("203: settlementLinkLabel can return a bare em dash for a linked settlement");
  // 222 — drift account names.
  if (!/NULLIF\(btrim\(gl\.account_name\), ''\)/.test(s.driftApi) || !/LEFT JOIN catalogs\.accounts gl ON gl\.id = ba\.ledger_account_id/.test(s.driftApi)) out.push("222: drift-alerts API does not resolve the ledger account name fallback");
  if (/"Account"\s*;/.test(between(s.driftHome, "const driftRows = useMemo", "}, ["))) out.push('222: Banking Home drift label falls back to generic "Account"');
  if (!/accountNameById\.get\(alert\.bank_account_id\)/.test(s.driftHome)) out.push("222: Banking Home drift label ignores the accounts list the page already loads");
  if (/\?\? "Account"/.test(s.driftPanel) || /\|\| "Account"/.test(s.driftPanel)) out.push('222: DriftAlertsPanel falls back to generic "Account"');
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => ({ ...src, [key]: src[key].replace(from, to) });
  const plants = [
    ["198 double checkout", plant("scope", /return withCurrentUser\(userId, async \(client\) => \{\n    await assertCompanyMembership\(client, userId, operatingCompanyId\);/, "await assertCompanyMembership(userId, operatingCompanyId);\n  return withCurrentUser(userId, async (client) => {")],
    ["198 fuel dashboard on every tab", plant("fuel", "enabled: Boolean(companyId) && onPlanner,", "enabled: Boolean(companyId),")],
    ["198 savings on every tab", plant("fuel", 'enabled: Boolean(companyId) && (onPlanner || tab === "history"),', "enabled: Boolean(companyId),")],
    ["203 API drops settlement status", plant("boardApi", "si.settlement_display_id, si.settlement_id, si.settlement_status, si.settlement_is_open,", "si.settlement_display_id, si.settlement_id,")],
    ["203 generic Settlement label", plant("board", "label={settlementLinkLabel(settlement)}", 'label={settlement.number ?? "Settlement"}')],
    ["203 label from load status", plant("board", "settlementLinkLabel({ number: r.settlement_display_id, status: r.settlement_status, is_open: r.settlement_is_open })", "settlementLabel({ source_document_ref: r.settlement_display_id, status: r.status, is_presettlement: !!(r.settlement_id && !r.settlement_display_id) })")],
    ["203 helper returns dash", plant("board", "return lbl === DASH ? (s.status ? s.status.toUpperCase() : \"PENDING\") : lbl;", "return lbl;")],
    ["222 API no ledger fallback", plant("driftApi", ", NULLIF(btrim(gl.account_name), '')", "")],
    ["222 home generic Account", plant("driftHome", /`Bank account \$\{String\(alert\.bank_account_id\)\.slice\(0, 8\)\}`;/, '"Account";')],
    ["222 panel generic Account", plant("driftPanel", "label={driftAccountLabel(alert)}", 'label={alert.account_name ?? alert.institution_name ?? "Account"}')],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(src).some((k) => planted[k] !== src[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(src);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — one pool checkout + tab-gated Fuel queries (198); settlement links labelled from the settlement (203); drift alerts carry the account name (222)`);
