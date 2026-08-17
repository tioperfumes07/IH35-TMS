#!/usr/bin/env node
/**
 * FINDING: LV-LIABILITIES-DASHBOARD-KPIS-EMPTY-STUB (carries ACCT-F5400) — found live 2026-08-17
 * while performing the assigned settlements Wave D1 live-verify of the `liabilities.list` leaf.
 * Selected-USMCA `/liabilities` simultaneously showed "TOTAL ACTIVE DEBT: 0" / "DRIVERS W/ DEBT: 0"
 * in the KPI strip directly above a table listing 2 real active liabilities ($350.00 combined) — the
 * same self-contradictory KPI-disagrees-with-its-own-list shape as ACCT-F5399 (factoring), one layer
 * upstream: the DB view.
 *
 * ROOT CAUSE: migration 0045_p3_t11_10_safety_liabilities.sql wrapped views.liabilities_dashboard_kpis
 * in a guard requiring driver_finance.driver_liabilities.acknowledgment_uuid to exist; prod never had
 * that column, so the view fell into an empty "WHERE false" ELSE stub forever. Sibling view
 * liabilities_active_with_context had the identical stub shape and was already fixed for the same
 * reason by migration 202612440000 (ACCT-F272/FAIL-DD2) — this migration applies the same fix pattern
 * to the un-patched sibling.
 *
 * FIX: db/migrations/202612730000_liabilities_dashboard_kpis_real_view.sql DROP+CREATEs
 * views.liabilities_dashboard_kpis selecting real aggregates from driver_finance.driver_liabilities
 * (current_balance, driver_id, type, original_amount, created_at), grouped by operating_company_id.
 * pending_acks is honestly emitted as NULL (unrecorded, not fabricated) — matching the honesty policy
 * 202612440000 already established.
 *
 * Static check (always runs): the migration file exists, selects FROM driver_finance.driver_liabilities
 * (not a WHERE-false stub), aggregates current_balance/driver_id for the real KPIs, and does not
 * hardcode total_active_debt/drivers_with_debt to a bare 0 literal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-liabilities-dashboard-kpis-not-empty-stub";
const TARGET_REL = "db/migrations/202612730000_liabilities_dashboard_kpis_real_view.sql";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** Pure so the selftest can run it against a mutated in-memory copy. */
export function assertLiabilitiesDashboardKpisReal(source) {
  const errors = [];

  // Scope the WHERE-false check to the actual CREATE VIEW body (delimited by the $VIEW$ dollar-quote),
  // not the whole file — the header comment prose legitimately mentions "WHERE false" while describing
  // the OLD stub this migration replaces.
  const viewBodyMatch = source.match(/\$VIEW\$([\s\S]*?)\$VIEW\$/);
  const viewBody = viewBodyMatch ? viewBodyMatch[1] : source;

  if (!/CREATE VIEW views\.liabilities_dashboard_kpis/.test(source)) {
    errors.push("migration does not CREATE VIEW views.liabilities_dashboard_kpis");
  }
  if (!/FROM driver_finance\.driver_liabilities/.test(viewBody)) {
    errors.push("view is not selecting FROM driver_finance.driver_liabilities");
  }
  if (/WHERE\s+false/i.test(viewBody)) {
    errors.push("view still contains a WHERE false empty stub");
  }
  if (!/SUM\(current_balance\)/.test(viewBody)) {
    errors.push("total_active_debt is not aggregated from current_balance");
  }
  if (!/COUNT\(DISTINCT driver_id\)/.test(viewBody)) {
    errors.push("drivers_with_debt is not aggregated from DISTINCT driver_id");
  }
  if (/total_active_debt\s*[,:]?\s*0\b/i.test(viewBody) && !/SUM\(current_balance\)/.test(viewBody)) {
    errors.push("total_active_debt hardcoded to a bare 0 literal");
  }

  return errors;
}

function selftest() {
  const problems = [];
  const live = read(TARGET_REL);

  const liveErrors = assertLiabilitiesDashboardKpisReal(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    [
      "view reverted to WHERE false stub",
      live.replace(
        /SELECT\s+operating_company_id,[\s\S]*?FROM driver_finance\.driver_liabilities\s+GROUP BY operating_company_id/,
        "SELECT operating_company_id, NULL::numeric AS total_active_debt, NULL::bigint AS drivers_with_debt, NULL::bigint AS pending_acks, NULL::numeric AS equipment_loss_ytd, NULL::numeric AS civil_fines_ytd FROM driver_finance.driver_liabilities WHERE false GROUP BY operating_company_id",
      ),
      "WHERE false",
    ],
    [
      "FROM clause pointed away from driver_liabilities",
      live.replace(/FROM driver_finance\.driver_liabilities/, "FROM (SELECT 1) AS empty_stub"),
      "not selecting FROM",
    ],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertLiabilitiesDashboardKpisReal(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }

  const errors = assertLiabilitiesDashboardKpisReal(read(TARGET_REL));
  if (errors.length) {
    console.error(`${LABEL} FAILED\n- ${errors.join("\n- ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}

main();
