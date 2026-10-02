#!/usr/bin/env node
/**
 * ROUND 326 item 2: one canonical record per real vendor per company (mdata.vendors canonical; mdata.qbo_vendors never written).
 *   static -- the engine reads the live FK catalog (never a hand list only), keeps an alias + snapshot + repoint log,
 *             deletes the duplicate (no shells), and can reverse a merge;
 *   live   -- duplicate normalized-name groups in mdata.vendors per company must not exceed the baseline
 *             (shrink-only; scripts/verify-canonical-vendors.baseline.json). Fails closed without DATABASE_URL.
 *   profile -- GET /api/v1/vendors/:id/profile returns all nine blocks, each a value or a named empty reason, never
 *             touching mdata.qbo_vendors, and the vendor page mounts every block; live: open bills that resolve to no
 *             same-company mdata.vendors row (their A/P is missing from every profile) must not exceed the baseline.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
const svc = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.service.ts", "utf8");
const fails = [];
if (!/k\.confrelid = \$1::regclass/.test(svc)) fails.push("engine must discover repoint targets from the live FK catalog");
if (!/INSERT INTO \$\{q\(cfg\.aliasTable\)\}/.test(svc) || !/snapshot/.test(svc)) fails.push("engine must keep an alias with the deleted row's snapshot");
if (!/DELETE FROM \$\{q\(cfg\.table\)\} WHERE id = \$1::uuid/.test(svc)) fails.push("engine must delete the merged duplicate (no cancelled shells)");
if (!/export async function reverseCanonicalMerge/.test(svc)) fails.push("merges must be reversible");
if (!/vendor_\(id\|uuid\)\$/.test(svc)) fails.push("engine must discover loose vendor_id / vendor_uuid columns at run time (no stale hand list)");
if (!/key: "LOVESTRAVELSTOPS", joins: "LOVES"/.test(svc)) fails.push("owner exception LOVES = LOVES TRAVEL STOPS (00-OWNER-DECISION-2026-10-02) must be in OWNER_SAME_PARTY_EXCEPTIONS");
if (!/groupKeySql\(kind,/.test(svc)) fails.push("plan and merge must group by groupKeySql (normalized name + named owner exceptions)");
if (!/table_name !~ '\^qbo_'/.test(svc)) fails.push("engine must never write a qbo_* mirror table (mdata.qbo_vendors is not canonical)");
const prof = readFileSync("apps/backend/src/mdata/canonical/vendor-profile.service.ts", "utf8");
const ui = readFileSync("apps/frontend/src/components/vendors/VendorProfileOverview.tsx", "utf8");
const routes = readFileSync("apps/backend/src/mdata/canonical/canonical-entities.routes.ts", "utf8");
const page = readFileSync("apps/frontend/src/pages/VendorDetail.tsx", "utf8");
const BLOCKS = { ap_aging: "ap-aging", open_bills: "open-bills", form_1099: "1099", insurance_authority: "insurance-authority", work_orders: "work-orders", fuel: "fuel", lanes: "lanes", terms: "terms", history: "history" };
if (!/"\/api\/v1\/vendors\/:id\/profile"/.test(routes)) fails.push("profile route GET /api/v1/vendors/:id/profile is not registered");
for (const [key, tid] of Object.entries(BLOCKS)) {
  if (!new RegExp(`\\b${key}: block\\(`).test(prof)) fails.push(`profile service must return block ${key} as block(value, reason)`);
  if (!ui.includes(`testId="vendor-profile-${tid}"`)) fails.push(`profile UI must render block ${key} (vendor-profile-${tid})`);
}
if (/qbo_vendors/.test(prof.replace(/\/\*[\s\S]*?\*\//g, ""))) fails.push("vendor profile must not read mdata.qbo_vendors (mdata.vendors is canonical)");
if (!/<VendorProfileOverview /.test(page)) fails.push("VendorDetail must mount VendorProfileOverview");
if (/coming soon|placeholder panel/i.test(ui)) fails.push("profile UI must not carry placeholder panels");
const baseline = JSON.parse(readFileSync("scripts/verify-canonical-vendors.baseline.json", "utf8"));
if (!process.env.DATABASE_URL) { console.error("verify-canonical-vendors: FAIL — DATABASE_URL not set (live guard fails closed)."); process.exit(1); }
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  const r = await c.query(`SELECT operating_company_id::text oc, count(*)::int groups FROM (
      SELECT operating_company_id, upper(regexp_replace(vendor_name,'[^A-Za-z0-9]','','g')) k FROM mdata.vendors
       GROUP BY 1, 2 HAVING count(*) > 1 AND upper(regexp_replace(vendor_name,'[^A-Za-z0-9]','','g')) <> '') g GROUP BY 1`);
  for (const x of r.rows) {
    const allowed = baseline.duplicate_groups[x.oc] ?? 0;
    if (x.groups > allowed) fails.push(`company ${x.oc}: ${x.groups} duplicate vendor groups > baseline ${allowed}`);
    console.log(`company ${x.oc}: duplicate vendor groups ${x.groups} (baseline ${allowed})`);
  }
  const orphan = await c.query(`SELECT count(*)::int n FROM accounting.bills b
      WHERE b.voided_at IS NULL AND b.revoked_at IS NULL AND b.status <> 'void' AND b.amount_cents - coalesce(b.paid_cents, 0) > 0
        AND NOT EXISTS (SELECT 1 FROM mdata.vendors v WHERE v.operating_company_id = b.operating_company_id
                         AND (v.id = b.mdata_vendor_id OR v.id::text = b.vendor_uuid OR v.id::text = b.vendor_id))`);
  const allowedOrphans = baseline.open_bills_without_vendor ?? 0;
  console.log(`open bills without a same-company vendor row: ${orphan.rows[0].n} (baseline ${allowedOrphans})`);
  if (orphan.rows[0].n > allowedOrphans) fails.push(`${orphan.rows[0].n} open bills have no same-company vendor > baseline ${allowedOrphans}`);
  await c.query("ROLLBACK");
} finally { await c.end(); }
if (fails.length) { console.error("verify-canonical-vendors: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log("verify-canonical-vendors: OK");
