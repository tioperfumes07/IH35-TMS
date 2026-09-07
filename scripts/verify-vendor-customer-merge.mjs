#!/usr/bin/env node
/**
 * verify-vendor-customer-merge.mjs
 *
 * ROUND 16.21 (owner 2026-09-06, verbatim): "I NEED FOR YOU TO RECONCILE VENDORS AND CUSTOMERS,
 * SOME MIGHT BE DUPLICATES OR EVEN TRIPLICATED, ETC, AND MERGE AND CREATE ONE SINGLE VENDOR OF
 * THOSE THAT ARE DUPLICATED OR MORE."
 *
 * Static check: apps/backend/src/mdata/vendor-customer-merge.service.ts exports real mergeVendors
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-vendor-customer-merge";
const SERVICE_FILE = "apps/backend/src/mdata/vendor-customer-merge.service.ts";
const ROUTES_FILE = "apps/backend/src/mdata/reclassify.routes.ts";
const CUSTOMER_ROUTES_FILE = "apps/backend/src/mdata/customers.routes.ts";
const VENDOR_ROUTES_FILE = "apps/backend/src/mdata/vendors.routes.ts";

function load(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const REQUIRED_MARKERS = [
  ["export async function mergeVendors", "mergeVendors is not exported — no real vendor merge function exists"],
  ["export async function mergeCustomers", "mergeCustomers is not exported — no real customer merge function exists"],
  ["await repointColumns(client, VENDOR_REPOINT_COLUMNS, input.survivorId, input.duplicateId);", "mergeVendors does not repoint FKs — would regress to a bare flag with no real merge"],
  ["await repointColumns(client, CUSTOMER_REPOINT_COLUMNS, input.survivorId, input.duplicateId);", "mergeCustomers does not repoint FKs — would regress to a bare flag with no real merge"],
  ["SET is_duplicate = true, merge_target_id = $1,", "merge does not flag the duplicate row (is_duplicate/merge_target_id)"],
  ["deactivated_at = COALESCE(deactivated_at, now())", "merged duplicate remains selectable — deactivated_at is required"],
  ["assertConfirmedDuplicate", "merge has no evidence gate"],
  ["identical_legal_name_and_registered_address", "name+registered-address evidence is not enforced"],
  ["identical_tax_id", "tax-id evidence is not enforced"],
  ["if (row.identical_tax_id ||", "tax-id evidence result is not required before merge"],
  ["decrypt(row.source_tax_id_encrypted)", "encrypted customer tax IDs are not compared by plaintext"],
  ["if (row.identical_name_address)", "legal-name+registered-address result is not required before merge"],
];

const FORBIDDEN_MARKERS = [[/\bDELETE\s+FROM\b/i, "the merge service must never hard-delete a duplicate row — quarantine only, per standing law"]];

export function check({
  service = load(SERVICE_FILE), routes = load(ROUTES_FILE),
  customerRoutes = load(CUSTOMER_ROUTES_FILE), vendorRoutes = load(VENDOR_ROUTES_FILE),
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
    "mergeCustomers(client, input)",
    "mergeVendors(client, input)",
    "Merge requires identical tax ID or identical legal name and registered address.",
  ]) {
    if (!routes.includes(marker)) f.push(`${ROUTES_FILE}: missing audited merge route contract: ${marker}`);
  }
  if (!customerRoutes.includes("tax_id_encrypted") || !customerRoutes.includes('return "tax_id"')) {
    f.push(`${CUSTOMER_ROUTES_FILE}: customer creation/update does not reject an existing active tax ID`);
  }
  if (!vendorRoutes.includes("vendorTaxIdConflictExists") || !vendorRoutes.includes("mdata_vendor_tax_id_conflict")) {
    f.push(`${VENDOR_ROUTES_FILE}: vendor creation/update does not reject an existing active tax ID`);
  }
  // Ordering: the repoint call must run BEFORE the flag UPDATE in BOTH functions (so a crash
  // mid-merge never leaves a flagged-but-not-repointed duplicate).
  const vendorFnIdx = service.indexOf("export async function mergeVendors");
  const vendorFnBody = service.slice(vendorFnIdx, vendorFnIdx + 2000);
  const vendorRepointIdx = vendorFnBody.indexOf("await repointColumns(client, VENDOR_REPOINT_COLUMNS");
  const vendorFlagIdx = vendorFnBody.indexOf("SET is_duplicate = true");
  if (vendorRepointIdx === -1 || vendorFlagIdx === -1 || vendorRepointIdx > vendorFlagIdx) {
    f.push(`${SERVICE_FILE}: mergeVendors must repoint FKs BEFORE flagging the duplicate (atomic order)`);
  }
  const customerFnIdx = service.indexOf("export async function mergeCustomers");
  const customerFnBody = service.slice(customerFnIdx, customerFnIdx + 2000);
  const customerRepointIdx = customerFnBody.indexOf("await repointColumns(client, CUSTOMER_REPOINT_COLUMNS");
  const customerFlagIdx = customerFnBody.indexOf("SET is_duplicate = true");
  if (customerRepointIdx === -1 || customerFlagIdx === -1 || customerRepointIdx > customerFlagIdx) {
    f.push(`${SERVICE_FILE}: mergeCustomers must repoint FKs BEFORE flagging the duplicate (atomic order)`);
  }
  return f;
}

function selftest() {
  const good = {
    service: load(SERVICE_FILE), routes: load(ROUTES_FILE),
    customerRoutes: load(CUSTOMER_ROUTES_FILE), vendorRoutes: load(VENDOR_ROUTES_FILE),
  };
  if (check(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — good fixtures rejected: ${check(good).join(" | ")}`);
    process.exit(1);
  }

  let n = 0;
  const plants = [
    { name: "mergeVendors export removed", mutate: () => ({ ...good, service: good.service.replace("export async function mergeVendors", "async function mergeVendors") }) },
    { name: "mergeCustomers export removed", mutate: () => ({ ...good, service: good.service.replace("export async function mergeCustomers", "async function mergeCustomers") }) },
    {
      name: "vendor FK repoint call dropped (regresses to a bare flag)",
      mutate: () => ({ ...good, service: good.service.replace("await repointColumns(client, VENDOR_REPOINT_COLUMNS, input.survivorId, input.duplicateId);", "// stripped") }),
    },
    {
      name: "customer FK repoint call dropped (regresses to a bare flag)",
      mutate: () => ({ ...good, service: good.service.replace("await repointColumns(client, CUSTOMER_REPOINT_COLUMNS, input.survivorId, input.duplicateId);", "// stripped") }),
    },
    {
      name: "duplicate-row flag write dropped",
      mutate: () => ({ ...good, service: good.service.replaceAll("SET is_duplicate = true, merge_target_id = $1,", "SET updated_at = now(),") }),
    },
    {
      name: "a hard DELETE is introduced (violates never-hard-delete law)",
      mutate: () => ({ ...good, service: good.service.replace("export async function mergeVendors", "// DELETE FROM mdata.vendors WHERE 1=0;\nexport async function mergeVendors") }),
    },
    {
      name: "mergeVendors flags BEFORE repointing (unsafe ordering)",
      mutate: () => ({
        ...good,
        service: good.service.replace(
          '  const repointed = await repointColumns(client, VENDOR_REPOINT_COLUMNS, input.survivorId, input.duplicateId);\n\n  const flagRes = await client.query(',
          '  const flagRes = await client.query('
        ).replace(
          '  if (!flagRes.rows.length) throw new Error("vendor_merge_duplicate_not_found");\n\n  const totalRows',
          '  if (!flagRes.rows.length) throw new Error("vendor_merge_duplicate_not_found");\n  const repointed = await repointColumns(client, VENDOR_REPOINT_COLUMNS, input.survivorId, input.duplicateId);\n\n  const totalRows'
        ),
      }),
    },
    {
      name: "duplicate evidence gate removed",
      mutate: () => ({ ...good, service: good.service.replace("if (row.identical_tax_id || (", "if (true || (") }),
    },
    {
      name: "merge route removed",
      mutate: () => ({ ...good, routes: good.routes.replace("/api/v1/${entity}/:id/merge", "/api/v1/${entity}/:id/no-merge") }),
    },
    {
      name: "merged row remains active",
      mutate: () => ({ ...good, service: good.service.replaceAll("deactivated_at = COALESCE(deactivated_at, now())", "deactivated_at = deactivated_at") }),
    },
    {
      name: "customer tax recurrence guard removed",
      mutate: () => ({ ...good, customerRoutes: good.customerRoutes.replace('return "tax_id"', 'return null') }),
    },
    {
      name: "vendor tax recurrence guard removed",
      mutate: () => ({ ...good, vendorRoutes: good.vendorRoutes.replaceAll("mdata_vendor_tax_id_conflict", "mdata_vendor_tax_id_allowed") }),
    },
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
  console.log(`${LABEL}: static OK — real, audited, repoint-then-flag, never-hard-delete merge functions exist for both vendors and customers`);

  if (!process.env.DATABASE_URL && !process.env.DATABASE_DIRECT_URL) {
    console.log(`${LABEL}: DATABASE_URL not set — skipping the live re-check (static check above still ran).`);
    process.exit(0);
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
