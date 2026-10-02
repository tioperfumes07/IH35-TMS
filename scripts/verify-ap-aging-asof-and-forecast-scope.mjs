#!/usr/bin/env node
// CC-3 handoff to CC-1 (2026-10-02): (1) the FIN-20 A/P aging "as of" read excluded bills only by revoked_at, so a bill
// voided by status / voided_at (or a draft) still aged as owed; (2) the manual cash-forecast routes read and wrote
// forecast.cash_entries without naming the company — LAW 4: RLS is not a backstop for an Owner session.
// Fails if the FIN-20 as-of bills query drops its voided_at / status predicates, or if any SELECT / UPDATE / DELETE on
// forecast.cash_entries in the manual routes stops naming operating_company_id.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-ap-aging-asof-and-forecast-scope";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const AGING = "apps/backend/src/accounting/fin20-aging.service.ts";
const FORECAST = "apps/backend/src/forecast/cash-forecast-manual.routes.ts";

export function problems(aging, forecast) {
  const p = [];
  const asOf = aging.slice(aging.indexOf("AND b.bill_date <= $3::date"), aging.indexOf("AND b.bill_date <= $3::date") + 900);
  if (!/AND \(b\.voided_at IS NULL OR b\.voided_at::date > \$3::date\)/.test(asOf) || !/AND b\.status NOT IN \('void', 'voided', 'draft'\)/.test(asOf)) p.push(`${AGING}: the as-of bills read must exclude voided (status / voided_at) and draft bills`);
  const updates = (forecast.match(/UPDATE forecast\.cash_entries/g) ?? []).length;
  if (updates !== 2) p.push(`${FORECAST}: expected exactly 2 UPDATE forecast.cash_entries statements (edit, deactivate), found ${updates} — scope any new one and update this guard`);
  if (!forecast.includes("AND operating_company_id = $${values.length - 1}::uuid AND deactivated_at IS NULL RETURNING *")) p.push(`${FORECAST}: the edit UPDATE must name the company`);
  if (!forecast.includes("WHERE id = $1 AND operating_company_id = $3::uuid AND deactivated_at IS NULL RETURNING id")) p.push(`${FORECAST}: the deactivate UPDATE must name the company`);
  if (/DELETE FROM forecast\.cash_entries/.test(forecast)) p.push(`${FORECAST}: hard DELETE of forecast entries`);
  if (!/const filters = \["deactivated_at IS NULL", "operating_company_id = \$1::uuid"\]/.test(forecast)) p.push(`${FORECAST}: the list filters must start with the company`);
  return p;
}

export function run() { return problems(readFileSync(path.join(ROOT, AGING), "utf8"), readFileSync(path.join(ROOT, FORECAST), "utf8")); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const aging = readFileSync(path.join(ROOT, AGING), "utf8");
  const forecast = readFileSync(path.join(ROOT, FORECAST), "utf8");
  const own = problems(aging, forecast);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["aging voided back", aging.replace("AND b.status NOT IN ('void', 'voided', 'draft')", ""), forecast],
      ["forecast delete unscoped", aging, forecast.replace("WHERE id = $1 AND operating_company_id = $3::uuid AND deactivated_at IS NULL RETURNING id", "WHERE id = $1 AND deactivated_at IS NULL RETURNING id")],
    ];
    for (const [name, a, f] of plants) if (!problems(a, f).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — A/P aging as-of excludes voided / draft bills; every manual forecast statement names its company.`);
}
