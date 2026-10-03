#!/usr/bin/env node
// ROUND 367.1 / LAW 368.3 (CC-2) — two readers on one page agree, or the page does not ship. Measured 2026-10-03: the
// Expenses grid rendered "0 rows" while its duplicate banner counted 22 rows. NOT the pooler: the server returned every
// live expense for the default filter status=active, and the page then re-filtered the rows with
// statusFilter.includes(r.status) — "active" is a pseudo-status (= not void) that no row ever carries, so all 550 USMCA
// expenses were dropped in the browser.
// Static: the Expenses list's client filter treats "active" as not-void.
// Live (DATABASE_URL, direct endpoint), every non-frozen company: every expense the duplicate banner counts (same vendor +
// date + amount, live) is one the default grid returns (live, not void) — the banner can never count a row the grid hides.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "the Expenses grid returns every row its duplicate banner counts";

const LABEL = "verify-list-count-matches-its-own-banner-count";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/accounting/ExpensesListPage.tsx";

export function check(page) {
  const f = [];
  const m = page.match(/const rows = useMemo\([\s\S]*?\[query\.data\?\.rows, statusFilter\]/);
  if (!m) f.push(`${PAGE}: the grid's row filter was not found — repoint this guard`);
  else if (!/statusFilter\.includes\("active"\) && r\.status !== "void"/.test(m[0])) f.push(`${PAGE}: the grid's client filter must treat "active" as not-void — matching it literally empties the grid`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const planted = real.replace(` || (statusFilter.includes("active") && r.status !== "void")`, "");
  if (planted === real) fails.push("plant did not change the source"); else if (!check(planted).length) fails.push("plant escaped: literal 'active' match restored");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 2/2`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c) => {
  const rows = (await c.query(`
    WITH e AS (SELECT x.* FROM accounting.expenses x WHERE ${NOT_FROZEN_SQL("x.operating_company_id")}),
    dup AS (SELECT e.id, e.status::text AS status, e.voided_at FROM e
             JOIN (SELECT operating_company_id, vendor_uuid, transaction_date, total_amount_cents FROM e WHERE voided_at IS NULL
                    GROUP BY 1, 2, 3, 4 HAVING count(*) > 1) g
               ON g.operating_company_id = e.operating_company_id AND g.vendor_uuid IS NOT DISTINCT FROM e.vendor_uuid
              AND g.transaction_date = e.transaction_date AND g.total_amount_cents = e.total_amount_cents
            WHERE e.voided_at IS NULL)
    SELECT (SELECT count(*) FROM e WHERE e.voided_at IS NULL AND e.status::text <> 'void')::int AS grid_default,
           (SELECT count(*) FROM dup)::int AS banner_rows,
           (SELECT count(*) FROM dup WHERE dup.status = 'void' OR dup.voided_at IS NOT NULL)::int AS banner_rows_grid_hides`)).rows[0];
  return rows;
});
const fails = [];
if (r.banner_rows_grid_hides > 0) fails.push(`${r.banner_rows_grid_hides} duplicate-banner row(s) the default grid would not show`);
if (r.banner_rows > 0 && r.grid_default === 0) fails.push(`the banner counts ${r.banner_rows} rows while the default grid set is empty`);
report(LABEL, fails, `default grid set ${r.grid_default} live expenses; banner ${r.banner_rows} rows, every one inside the grid (every non-frozen company, bypass=${r.bypass})`);
