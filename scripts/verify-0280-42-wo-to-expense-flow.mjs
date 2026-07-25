#!/usr/bin/env node
/**
 * verify-0280-42-wo-to-expense-flow — ACCT-R-07
 *
 * The Home WO status-count widget (`/api/v1/home/wo-status-counts`) counted
 * maintenance.work_orders rows only — it had no join to the accounting side, so a user could not
 * tell whether the work orders driving a status bucket had actually produced a bill/expense. This
 * guard locks:
 *
 *  1. Backend: the route verifies maintenance.work_orders / accounting.bills / accounting.expenses
 *     exist via to_regclass (never assumed), verifies linked_work_order_uuid + the amount column
 *     exist via information_schema (never an invented column name), and — only once verified —
 *     runs a real GROUP BY join keyed on the canonical `linked_work_order_uuid` FK (migration
 *     202607050810_wo_bill_expense_hard_fk_link.sql), scoped by operating_company_id on BOTH sides
 *     of the join, excluding voided/reversed documents. A query failure must surface as a named
 *     `unverifiable` reason — never a silently fabricated $0.
 *  2. Frontend: the response's additive `linked_economics` field is typed, coerced defensively
 *     (unknown/malformed shapes fall back to `unverifiable`, never thrown or fabricated), and
 *     rendered in the WO status pie chart widget so the join is not built-but-unwired.
 *
 * The pre-existing { draft, open, in_progress, awaiting_parts, completed, cancelled, unknown }
 * count shape is untouched — `linked_economics` is additive only (Rule 07 / additive-only law).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-0280-42-wo-to-expense-flow";
const ROUTES = "apps/backend/src/home/home-widgets.routes.ts";
const API = "apps/frontend/src/api/home.ts";
const CHART = "apps/frontend/src/pages/home/charts/WOStatusPieChart.tsx";

function assertBackend(src) {
  const errors = [];
  if (!/computeWoLinkedEconomics/.test(src)) {
    errors.push(`${ROUTES}: missing computeWoLinkedEconomics (the WO→bill/expense join)`);
  }
  if (!/linked_economics/.test(src)) {
    errors.push(`${ROUTES}: wo-status-counts response must include additive linked_economics field`);
  }
  // Never invent a Neon column/table — every relation and every joined column must be verified
  // (to_regclass / information_schema) before the SELECT that depends on it runs.
  if (!/to_regclass/.test(src)) {
    errors.push(`${ROUTES}: must verify relations exist via to_regclass before joining (never assume)`);
  }
  if (!/information_schema\.columns/.test(src)) {
    errors.push(`${ROUTES}: must verify linked_work_order_uuid / amount columns via information_schema before joining`);
  }
  if (!/linked_work_order_uuid/.test(src)) {
    errors.push(`${ROUTES}: join must key on the canonical linked_work_order_uuid FK (202607050810 hard FK link)`);
  }
  if (!/JOIN maintenance\.work_orders/.test(src)) {
    errors.push(`${ROUTES}: must JOIN maintenance.work_orders (not a memo-only / display-string link)`);
  }
  if (!/accounting\.bills/.test(src) || !/accounting\.expenses/.test(src)) {
    errors.push(`${ROUTES}: must consider both accounting.bills and accounting.expenses`);
  }
  // Entity scope on both sides of the join — cross-entity FK is a defect (Rule 14).
  if (!/b\.operating_company_id = \$1::uuid[\s\S]{0,120}wo\.operating_company_id = \$1::uuid/.test(src)) {
    errors.push(`${ROUTES}: bills join must scope operating_company_id on BOTH sides (entity-isolation)`);
  }
  if (!/e\.operating_company_id = \$1::uuid[\s\S]{0,120}wo\.operating_company_id = \$1::uuid/.test(src)) {
    errors.push(`${ROUTES}: expenses join must scope operating_company_id on BOTH sides (entity-isolation)`);
  }
  // Voided/reversed documents are not live economics.
  if (!/revoked_at IS NULL/.test(src)) {
    errors.push(`${ROUTES}: bills join must exclude revoked_at (reversed bills are not live economics)`);
  }
  if (!/voided_at IS NULL/.test(src)) {
    errors.push(`${ROUTES}: expenses join must exclude voided_at (voided expenses are not live economics)`);
  }
  // Honesty law: a query failure must be a named unverifiable reason, never a fabricated $0.
  if (!/unverifiable_reason/.test(src)) {
    errors.push(`${ROUTES}: must surface a named unverifiable_reason on gap/failure — never a silent $0`);
  }
  if (/catch\s*\([^)]*\)\s*\{\s*return\s*\{\s*status:\s*"ok"/.test(src)) {
    errors.push(`${ROUTES}: must not fabricate status:"ok" inside a catch block`);
  }
  return errors;
}

function assertFrontendApi(src) {
  const errors = [];
  if (!/HomeWoLinkedEconomics/.test(src)) {
    errors.push(`${API}: missing HomeWoLinkedEconomics type`);
  }
  if (!/fetchHomeWoStatusCountsDetailed/.test(src)) {
    errors.push(`${API}: missing fetchHomeWoStatusCountsDetailed (counts + linked_economics in one fetch)`);
  }
  if (!/coerceWoLinkedEconomics/.test(src)) {
    errors.push(`${API}: missing coerceWoLinkedEconomics (defensive shape coercion — never trust raw JSON)`);
  }
  if (!/"unverifiable"/.test(src)) {
    errors.push(`${API}: coercion must have an "unverifiable" fallback path for malformed/missing data`);
  }
  return errors;
}

function assertChartWired(src) {
  const errors = [];
  if (!/fetchHomeWoStatusCountsDetailed/.test(src)) {
    errors.push(`${CHART}: must call fetchHomeWoStatusCountsDetailed (built-but-unwired join is a defect)`);
  }
  if (!/linked_economics|linkedEconomics/.test(src)) {
    errors.push(`${CHART}: must read linked_economics from the response`);
  }
  if (!/unverifiable_reason/.test(src)) {
    errors.push(`${CHART}: must render the unverifiable reason (honesty — no silent gap)`);
  }
  if (!/total_linked_bill_amount_cents/.test(src) || !/total_linked_expense_amount_cents/.test(src)) {
    errors.push(`${CHART}: must render linked bill AND expense totals`);
  }
  return errors;
}

function selftest() {
  const goodBackend = `
    async function computeWoLinkedEconomics(client, operatingCompanyId) {
      await client.query(\`SELECT to_regclass('x')\`);
      await client.query(\`SELECT 1 FROM information_schema.columns WHERE 1=0\`);
      const res = await client.query(\`
        SELECT wo.status::text AS status
        FROM accounting.bills b
        JOIN maintenance.work_orders wo ON wo.id = b.linked_work_order_uuid
        WHERE b.operating_company_id = $1::uuid
          AND wo.operating_company_id = $1::uuid
          AND b.revoked_at IS NULL
      \`);
      const res2 = await client.query(\`
        SELECT wo.status::text AS status
        FROM accounting.expenses e
        JOIN maintenance.work_orders wo ON wo.id = e.linked_work_order_uuid
        WHERE e.operating_company_id = $1::uuid
          AND wo.operating_company_id = $1::uuid
          AND e.voided_at IS NULL
      \`);
      return { status: "ok", unverifiable_reason: undefined };
    }
    return { ...out, linked_economics };
  `;
  const badBackend = `
    async function wo() {
      return out;
    }
  `;
  const goodApi = `
    export type HomeWoLinkedEconomics = { status: "ok" } | { status: "unverifiable" };
    function coerceWoLinkedEconomics(raw) { return { status: "unverifiable" }; }
    export async function fetchHomeWoStatusCountsDetailed(id) { return {}; }
  `;
  const badApi = `export async function fetchHomeWoStatusCounts(id) { return []; }`;
  const goodChart = `
    fetchHomeWoStatusCountsDetailed(cid);
    const linkedEconomics = query.data?.linked_economics;
    linkedEconomics.unverifiable_reason
    linkedEconomics.total_linked_bill_amount_cents
    linkedEconomics.total_linked_expense_amount_cents
  `;
  const badChart = `fetchHomeWoStatusCounts(cid);`;

  const errs = [
    ...assertBackend(goodBackend),
    ...assertFrontendApi(goodApi),
    ...assertChartWired(goodChart),
  ];
  const badErrs = [
    ...assertBackend(badBackend),
    ...assertFrontendApi(badApi),
    ...assertChartWired(badChart),
  ];
  if (errs.length) {
    console.error(`${LABEL} --selftest FAIL good fixtures:`, errs);
    process.exit(1);
  }
  if (badErrs.length < 5) {
    console.error(`${LABEL} --selftest FAIL bad fixtures should fail hard:`, badErrs);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const routesSrc = fs.readFileSync(path.join(ROOT, ROUTES), "utf8");
  const apiSrc = fs.readFileSync(path.join(ROOT, API), "utf8");
  const chartSrc = fs.readFileSync(path.join(ROOT, CHART), "utf8");
  const errors = [
    ...assertBackend(routesSrc),
    ...assertFrontendApi(apiSrc),
    ...assertChartWired(chartSrc),
  ];
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(
    `OK ${LABEL}: wo-status-counts joins accounting.bills/accounting.expenses via linked_work_order_uuid; frontend renders linked totals or a named unverifiable reason.`,
  );
}

main();
