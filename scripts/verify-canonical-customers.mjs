#!/usr/bin/env node
/**
 * ROUND 326 item 1: one canonical record per real customer per company.
 *   static -- the engine reads the live FK catalog (never a hand list only), keeps an alias + snapshot + repoint log,
 *             deletes the duplicate (no shells), and can reverse a merge;
 *   live   -- duplicate normalized-name groups in mdata.customers per company must not exceed the baseline
 *             (shrink-only; scripts/verify-canonical-customers.baseline.json). Fails closed without DATABASE_URL.
 *   profile -- (item 1B) GET /api/v1/customers/:id/profile returns all eight blocks, each a value or a named
 *             empty reason, and the customer page mounts every block; live: every open invoice belongs to a
 *             customer row in its own company, so the profile's AR ties to the company's AR to the cent.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
const svc = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.service.ts", "utf8");
const fails = [];
if (!/k\.confrelid = \$1::regclass/.test(svc)) fails.push("engine must discover repoint targets from the live FK catalog");
if (!/INSERT INTO \$\{q\(cfg\.aliasTable\)\}/.test(svc) || !/snapshot/.test(svc)) fails.push("engine must keep an alias with the deleted row's snapshot");
if (!/DELETE FROM \$\{q\(cfg\.table\)\} WHERE id = \$1::uuid/.test(svc)) fails.push("engine must delete the merged duplicate (no cancelled shells)");
if (!/export async function reverseCanonicalMerge/.test(svc)) fails.push("merges must be reversible");
const prof = readFileSync("apps/backend/src/mdata/canonical/customer-profile.service.ts", "utf8");
const ui = readFileSync("apps/frontend/src/components/customers/CustomerProfileOverview.tsx", "utf8");
const routes = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.routes.ts", "utf8");
const page = readFileSync("apps/frontend/src/pages/CustomerDetail.tsx", "utf8");
const BLOCKS = { ar_aging: "ar-aging", credit: "credit", open_loads: "open-loads", payment_history: "payments", factoring: "factoring", documents: "documents", contacts: "contacts", rate_history: "rate-history" };
if (!/"\/api\/v1\/customers\/:id\/profile"/.test(routes)) fails.push("profile route GET /api/v1/customers/:id/profile is not registered");
for (const [key, tid] of Object.entries(BLOCKS)) {
  if (!new RegExp(`\\b${key}: block\\(`).test(prof)) fails.push(`profile service must return block ${key} as block(value, reason)`);
  if (!ui.includes(`testId="customer-profile-${tid}"`)) fails.push(`profile UI must render block ${key} (customer-profile-${tid})`);
}
if (!/<CustomerProfileOverview /.test(page)) fails.push("CustomerDetail must mount CustomerProfileOverview");
if (/coming soon|placeholder panel/i.test(ui)) fails.push("profile UI must not carry placeholder panels");
const baseline = JSON.parse(readFileSync("scripts/verify-canonical-customers.baseline.json", "utf8"));
if (!process.env.DATABASE_URL) { console.error("verify-canonical-customers: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const r = await c.query(`SELECT operating_company_id::text oc, count(*)::int groups FROM (
      SELECT operating_company_id, upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) k FROM mdata.customers
       GROUP BY 1, 2 HAVING count(*) > 1 AND upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) <> '') g GROUP BY 1`);
  for (const x of r.rows) {
    const allowed = baseline.duplicate_groups[x.oc] ?? 0;
    if (x.groups > allowed) fails.push(`company ${x.oc}: ${x.groups} duplicate customer groups > baseline ${allowed}`);
    console.log(`company ${x.oc}: duplicate customer groups ${x.groups} (baseline ${allowed})`);
  }
  const orphan = await c.query(`SELECT count(*)::int n FROM accounting.invoices i
      WHERE i.voided_at IS NULL AND i.amount_open_cents > 0
        AND NOT EXISTS (SELECT 1 FROM mdata.customers c WHERE c.id = i.customer_id AND c.operating_company_id = i.operating_company_id)`);
  console.log(`open invoices without a same-company customer row: ${orphan.rows[0].n}`);
  if (orphan.rows[0].n > 0) fails.push(`${orphan.rows[0].n} open invoices have no same-company customer — their AR is missing from every profile`);
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-canonical-customers: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-canonical-customers: OK");
