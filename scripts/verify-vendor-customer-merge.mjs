#!/usr/bin/env node
/**
 * verify-vendor-customer-merge.mjs
 *
 * ROUND 16.21 (owner 2026-09-06, verbatim): "I NEED FOR YOU TO RECONCILE VENDORS AND CUSTOMERS,
 * SOME MIGHT BE DUPLICATES OR EVEN TRIPLICATED, ETC, AND MERGE AND CREATE ONE SINGLE VENDOR OF
 * THOSE THAT ARE DUPLICATED OR MORE."
 *
 * 2026-10-02 (CC-3 queue 2a): ONE merge engine. The /merge route keeps this file's evidence gate
 * (assertConfirmedDuplicate) and merges through the canonical engine (mdata/canonical/canonical-entities.service.ts):
 * every reference repointed, alias + snapshot kept (reversible), duplicate DELETED (owner law: no shell rows). The old
 * pairwise mergeVendors / mergeCustomers (hand list, deactivated shell) are gone and must not return.
 *
 * (history) Static check: apps/backend/src/mdata/vendor-customer-merge.service.ts exports real mergeVendors
 * / mergeCustomers functions that (1) repoint every live-verified FK column before (2) flagging
 * the duplicate row via is_duplicate/merge_target_id — never a bare flag with no repoint (the
 * pre-existing bug: reclassify.routes.ts's flag-duplicate endpoints only ever set the flag), and
 * (3) never issue a DELETE anywhere in the file (quarantine only, per standing law).
 *
 * Live check: re-derives the exact duplicate-detection query (same-entity normalized-name match)
 * independently in SQL and asserts ZERO same-company duplicate vendor groups remain unflagged —
 * the real, measurable outcome of the 19 merges this guard exists to lock in. Also confirms the
 * audit trail (mdata.entity_reclassification_log, action='merge') has at least 19 vendor rows.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB =
  "live-data guard; fails closed with no DATABASE_URL or an unreachable database (ROUND 29.9-B, E7 batch 2b)";
/** @matrix-built modules=vendors,customers cols=connectivity */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-customer-merge";
const SERVICE_FILE = "apps/backend/src/mdata/vendor-customer-merge.service.ts";
const ROUTES_FILE = "apps/backend/src/mdata/reclassify.routes.ts";
const CUSTOMER_ROUTES_FILE = "apps/backend/src/mdata/customers.routes.ts";
const VENDOR_ROUTES_FILE = "apps/backend/src/mdata/vendors.routes.ts";

function load(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const CANONICAL_FILE = "apps/backend/src/mdata/canonical/canonical-entities.service.ts";
const REQUIRED_MARKERS = [
  ["export async function assertConfirmedDuplicate", "the evidence gate is not exported for the merge route"],
  ["identical_legal_name_and_registered_address", "name+registered-address evidence is not enforced"],
  ["identical_tax_id", "tax-id evidence is not enforced"],
  ["if (row.identical_tax_id ||", "tax-id evidence result is not required before merge"],
  ["decrypt(row.source_tax_id_encrypted)", "encrypted customer tax IDs are not compared by plaintext"],
  ["if (row.identical_name_address)", "legal-name+registered-address result is not required before merge"],
];
const FORBIDDEN_MARKERS = [
  [/\bDELETE\s+FROM\b/i, "the evidence/registry file never deletes — only the canonical engine removes a merged duplicate"],
  [/export async function merge(Vendors|Customers)\b/, "the old pairwise merge engine is back — merges go through mergeIntoCanonical only"],
  [/SET is_duplicate = true/, "a merge must not leave a flagged shell row (owner law 2026-10-02) — the canonical engine deletes the duplicate"],
];
export function check({
  service = load(SERVICE_FILE), routes = load(ROUTES_FILE),
  customerRoutes = load(CUSTOMER_ROUTES_FILE), vendorRoutes = load(VENDOR_ROUTES_FILE), canonical = load(CANONICAL_FILE),
} = {}) {
  const f = [];
  for (const [marker, msg] of REQUIRED_MARKERS) {
    if (!service.includes(marker)) f.push(`${SERVICE_FILE}: ${msg}`);
  }
  for (const [re, msg] of FORBIDDEN_MARKERS) {
    if (re.test(service)) f.push(`${SERVICE_FILE}: ${msg}`);
  }
  for (const marker of [
    "/api/v1/${entity}/:id/merge",
    "await assertConfirmedDuplicate(client, kind,",
    "mergeIntoCanonical(client, body.data.operating_company_id, kind,",
    "Merge requires identical tax ID or identical legal name and registered address.",
  ]) {
    if (!routes.includes(marker)) f.push(`${ROUTES_FILE}: missing merge route contract: ${marker}`);
  }
  if (/mergeCustomers\(|mergeVendors\(/.test(routes)) f.push(`${ROUTES_FILE}: still calls the old pairwise merge engine`);
  const gateIdx = routes.indexOf("await assertConfirmedDuplicate(client, kind,"), mergeIdx = routes.indexOf("mergeIntoCanonical(client, body.data.operating_company_id, kind,");
  if (gateIdx === -1 || mergeIdx === -1 || gateIdx > mergeIdx) f.push(`${ROUTES_FILE}: the evidence gate must run BEFORE the canonical merge`);
  if (!canonical.includes("canonical_delete_blocked")) f.push(`${CANONICAL_FILE}: a duplicate DELETE that removes != 1 row must refuse (canonical_delete_blocked)`);
  if (!canonical.includes('input.evidence !== "identical_tax_id"')) f.push(`${CANONICAL_FILE}: only verified tax-id evidence may admit a pair whose names do not normalize equal`);
  if (!customerRoutes.includes("tax_id_encrypted") || !customerRoutes.includes('return "tax_id"')) {
    f.push(`${CUSTOMER_ROUTES_FILE}: customer creation/update does not reject an existing active tax ID`);
  }
  if (!vendorRoutes.includes("vendorTaxIdConflictExists") || !vendorRoutes.includes("mdata_vendor_tax_id_conflict")) {
    f.push(`${VENDOR_ROUTES_FILE}: vendor creation/update does not reject an existing active tax ID`);
  }
  return f;
}
function selftest() {
  const good = {
    service: load(SERVICE_FILE), routes: load(ROUTES_FILE),
    customerRoutes: load(CUSTOMER_ROUTES_FILE), vendorRoutes: load(VENDOR_ROUTES_FILE), canonical: load(CANONICAL_FILE),
  };
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixtures rejected: ${check(good).join(" | ")}`);
    process.exit(1);
  }

  let n = 0;
  const plants = [
    { name: "old mergeVendors engine returns", mutate: () => ({ ...good, service: good.service + "\nexport async function mergeVendors() {}\n" }) },
    { name: "route calls the old engine", mutate: () => ({ ...good, routes: good.routes.replace("mergeIntoCanonical(client, body.data.operating_company_id, kind,", "mergeVendors(client, kind,") }) },
    { name: "shell flag write returns", mutate: () => ({ ...good, service: good.service + "\n// UPDATE mdata.vendors SET is_duplicate = true\n" }) },
    { name: "a hard DELETE appears in the evidence file", mutate: () => ({ ...good, service: good.service + "\n// DELETE FROM mdata.vendors WHERE 1=0;\n" }) },
    { name: "duplicate evidence gate removed", mutate: () => ({ ...good, service: good.service.replace("if (row.identical_tax_id || (", "if (true || (") }) },
    { name: "merge route removed", mutate: () => ({ ...good, routes: good.routes.replace("/api/v1/${entity}/:id/merge", "/api/v1/${entity}/:id/no-merge") }) },
    { name: "evidence gate skipped by the route", mutate: () => ({ ...good, routes: good.routes.replace("await assertConfirmedDuplicate(client, kind,", "await Promise.resolve(client, kind,") }) },
    { name: "engine no longer refuses a no-op delete", mutate: () => ({ ...good, canonical: good.canonical.replaceAll("canonical_delete_blocked", "canonical_delete_ignored") }) },
    { name: "engine admits any name pair", mutate: () => ({ ...good, canonical: good.canonical.replace('input.evidence !== "identical_tax_id"', "false") }) },
    { name: "customer tax recurrence guard removed", mutate: () => ({ ...good, customerRoutes: good.customerRoutes.replace('return "tax_id"', 'return null') }) },
    { name: "vendor tax recurrence guard removed", mutate: () => ({ ...good, vendorRoutes: good.vendorRoutes.replaceAll("mdata_vendor_tax_id_conflict", "mdata_vendor_tax_id_allowed") }) },
  ];
  for (const plant of plants) {
    n++;
    const bad = plant.mutate();
    if (check(bad).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — plant "${plant.name}" was not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK — ${n}/${n} plants rejected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const findings = check();
  if (findings.length) {
    console.error(`${LABEL}: FAIL`);
    for (const e of findings) console.error("  ✗ " + e);
    process.exit(1);
  }
  console.log(`${LABEL}: static OK — one merge engine: evidence gate then the canonical engine (repoint all, alias + snapshot, duplicate deleted, reversible); old pairwise engine absent`);

  if (!process.env.DATABASE_URL && !process.env.DATABASE_DIRECT_URL) {
    console.error("verify-vendor-customer-merge: FAIL — DATABASE_URL not set or the database is unreachable. A live money guard that cannot connect is a FAIL, never a pass (ROUND 29.9-B).");
    process.exit(1);
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString: process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);

    const liveFindings = [];
    let counts = {};
    try {
      // Owner-confirmed merge evidence only: identical tax id, or identical legal name AND a
      // nonblank registered address. Name-only similarity is review evidence, never merge authority.
      const remaining = await client.query(`
        SELECT count(*)::int AS n FROM (
          SELECT 'vendor_tax' kind
            FROM mdata.vendors
           WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
             AND deactivated_at IS NULL AND is_duplicate IS NOT TRUE
             AND NULLIF(regexp_replace(lower(btrim(tax_id)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL
           GROUP BY regexp_replace(lower(btrim(tax_id)), '[^a-z0-9]', '', 'g') HAVING count(*) > 1
          UNION ALL
          SELECT 'vendor_name_address'
            FROM mdata.vendors
           WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
             AND deactivated_at IS NULL AND is_duplicate IS NOT TRUE
             AND NULLIF(regexp_replace(lower(btrim(address_line1)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL
           GROUP BY regexp_replace(lower(btrim(vendor_name)), '[^a-z0-9]', '', 'g'),
                    regexp_replace(lower(btrim(address_line1)), '[^a-z0-9]', '', 'g') HAVING count(*) > 1
          UNION ALL
          SELECT 'customer_tax'
            FROM mdata.customers
           WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
             AND deactivated_at IS NULL AND is_duplicate IS NOT TRUE AND tax_id_encrypted IS NOT NULL
           GROUP BY tax_id_encrypted HAVING count(*) > 1
          UNION ALL
          SELECT 'customer_name_address'
            FROM mdata.customers
           WHERE operating_company_id = '5c854333-6ea5-4faa-af31-67cb272fef80'::uuid
             AND deactivated_at IS NULL AND is_duplicate IS NOT TRUE
             AND NULLIF(regexp_replace(lower(btrim(billing_address_line1)), '[^a-z0-9]', '', 'g'), '') IS NOT NULL
           GROUP BY regexp_replace(lower(btrim(customer_name)), '[^a-z0-9]', '', 'g'),
                    regexp_replace(lower(btrim(billing_address_line1)), '[^a-z0-9]', '', 'g') HAVING count(*) > 1
        ) g
      `);
      counts.remaining_owner_confirmed_duplicate_groups = remaining.rows[0].n;
      if (remaining.rows[0].n > 0) {
        liveFindings.push(`${remaining.rows[0].n} USMCA owner-confirmed duplicate group(s) remain unmerged/unflagged`);
      }

      const mergeAudit = await client.query(`
        SELECT count(*)::int AS n FROM mdata.entity_reclassification_log
        WHERE entity_table = 'mdata.vendors' AND action = 'merge'
      `);
      counts.vendor_merge_audit_rows = mergeAudit.rows[0].n;
      if (mergeAudit.rows[0].n < 19) {
        liveFindings.push(`only ${mergeAudit.rows[0].n} vendor merge audit rows found, expected >= 19 (the ROUND 16.21 merges)`);
      }

      const flaggedCount = await client.query(`SELECT count(*)::int AS n FROM mdata.vendors WHERE is_duplicate = true`);
      counts.vendors_flagged_duplicate = flaggedCount.rows[0].n;
      if (flaggedCount.rows[0].n < 19) {
        liveFindings.push(`only ${flaggedCount.rows[0].n} vendors flagged is_duplicate=true, expected >= 19`);
      }
    } catch (err) {
      liveFindings.push(`live re-derivation query failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    await client.query("ROLLBACK");

    if (liveFindings.length) {
      console.error(`${LABEL}: LIVE FAIL`);
      for (const e of liveFindings) console.error("  ✗ " + e);
      process.exit(1);
    }
    console.log(`${LABEL}: LIVE OK — 0 USMCA owner-confirmed duplicate groups remain.`, counts);
  } finally {
    await client.end();
  }
}
