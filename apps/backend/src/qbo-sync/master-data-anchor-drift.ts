// AF-2 — QBO master-data anchor-drift DETECTOR (read-only, DETECT-ONLY per the locked decision —
// "AF-2 qbo-drift: detect only, write stays OFF", docs/LOCKED-DECISIONS-2026-07-05-ENTERPRISE.md line 31).
//
// This is the safety valve for {vendors,customers,chart-of-accounts}-reconciler.ts: those files each carry
// a `healFieldDrift()` step that silently overwrites local mdata.vendors / mdata.customers /
// catalogs.accounts business fields from the QBO mirror whenever they differ — no exception row, no
// maker/checker, no flag. That is a write-back, and the locked decision says write-back stays OFF. This
// module gives the reconcilers a DETECT-ONLY alternative: instead of mutating the source table, it
// records the SAME drift as a read-only accounting.recon_exceptions row (ANCHOR_DRIFT class) for a human
// to review — reusing RECON-01's existing audited recon_runs/recon_exceptions tables (insertRun /
// insertExceptions / finalizeRun from recon-engine.service.ts) rather than a new parallel table. Whether
// each reconciler calls this function or the old healFieldDrift() is decided by the
// QBO_MASTER_DATA_HEAL_ENABLED flag (default OFF — see migration 202607110300).
//
// NEVER writes to mdata.vendors / mdata.customers / catalogs.accounts. Only reads them (alongside their
// mdata.qbo_* mirror) and writes to accounting.recon_runs / recon_exceptions.
import type { PoolClient } from "pg";
import { insertRun, insertExceptions, finalizeRun, type PendingException } from "../accounting/recon/recon-engine.service.js";

export type MasterDataEntityKind = "vendors" | "customers" | "accounts";

type DriftRow = {
  local_id: string;
  local_display: string;
  qbo_id: string;
  fields: { field: string; tms_value: string | null; qbo_value: string | null }[];
};

async function readVendorDrift(client: PoolClient, opco: string): Promise<DriftRow[]> {
  const res = await client.query<{
    id: string; vendor_name: string; phone: string | null; email: string | null;
    qbo_id: string; display_name: string; primary_phone: string | null; primary_email: string | null;
  }>(
    `
      SELECT v.id::text, v.vendor_name, v.phone, v.email,
             qv.qbo_id, qv.display_name, qv.primary_phone, qv.primary_email
      FROM mdata.vendors v
      JOIN accounting.qbo_vendors qv
        ON qv.qbo_id = v.qbo_vendor_id AND qv.operating_company_id = v.operating_company_id
      WHERE v.operating_company_id = $1::uuid
        AND (
          v.vendor_name IS DISTINCT FROM qv.display_name
          OR v.phone IS DISTINCT FROM qv.primary_phone
          OR v.email IS DISTINCT FROM qv.primary_email
        )
    `,
    [opco]
  );
  return res.rows.map((r) => {
    const fields: DriftRow["fields"] = [];
    if (r.vendor_name !== r.display_name) fields.push({ field: "vendor_name", tms_value: r.vendor_name, qbo_value: r.display_name });
    if (r.phone !== r.primary_phone) fields.push({ field: "phone", tms_value: r.phone, qbo_value: r.primary_phone });
    if (r.email !== r.primary_email) fields.push({ field: "email", tms_value: r.email, qbo_value: r.primary_email });
    return { local_id: r.id, local_display: r.vendor_name, qbo_id: r.qbo_id, fields };
  });
}

async function readCustomerDrift(client: PoolClient, opco: string): Promise<DriftRow[]> {
  const res = await client.query<{
    id: string; customer_name: string; billing_email: string | null; billing_phone: string | null;
    qbo_id: string; display_name: string; primary_email: string | null; primary_phone: string | null;
  }>(
    `
      SELECT c.id::text, c.customer_name, c.billing_email, c.billing_phone,
             qc.qbo_id, qc.display_name, qc.primary_email, qc.primary_phone
      FROM mdata.customers c
      JOIN mdata.qbo_customers qc
        ON qc.qbo_id = c.qbo_customer_id AND qc.operating_company_id = c.operating_company_id
      WHERE c.operating_company_id = $1::uuid
        AND (
          c.customer_name IS DISTINCT FROM qc.display_name
          OR c.billing_email IS DISTINCT FROM qc.primary_email
          OR c.billing_phone IS DISTINCT FROM qc.primary_phone
        )
    `,
    [opco]
  );
  return res.rows.map((r) => {
    const fields: DriftRow["fields"] = [];
    if (r.customer_name !== r.display_name) fields.push({ field: "customer_name", tms_value: r.customer_name, qbo_value: r.display_name });
    if (r.billing_email !== r.primary_email) fields.push({ field: "billing_email", tms_value: r.billing_email, qbo_value: r.primary_email });
    if (r.billing_phone !== r.primary_phone) fields.push({ field: "billing_phone", tms_value: r.billing_phone, qbo_value: r.primary_phone });
    return { local_id: r.id, local_display: r.customer_name, qbo_id: r.qbo_id, fields };
  });
}

async function readAccountDrift(client: PoolClient, opco: string): Promise<DriftRow[]> {
  const res = await client.query<{
    id: string; account_name: string; account_subtype: string | null;
    qbo_id: string; name: string; account_sub_type: string | null;
  }>(
    `
      SELECT ca.id::text, ca.account_name, ca.account_subtype,
             qa.qbo_id, qa.name, qa.account_sub_type
      FROM catalogs.accounts ca
      JOIN mdata.qbo_accounts qa
        ON qa.qbo_id = ca.qbo_account_id AND qa.operating_company_id = ca.operating_company_id
      WHERE ca.operating_company_id = $1::uuid
        AND (
          ca.account_name IS DISTINCT FROM qa.name
          OR ca.account_subtype IS DISTINCT FROM qa.account_sub_type
        )
    `,
    [opco]
  );
  return res.rows.map((r) => {
    const fields: DriftRow["fields"] = [];
    if (r.account_name !== r.name) fields.push({ field: "account_name", tms_value: r.account_name, qbo_value: r.name });
    if (r.account_subtype !== r.account_sub_type) fields.push({ field: "account_subtype", tms_value: r.account_subtype, qbo_value: r.account_sub_type });
    return { local_id: r.id, local_display: r.account_name, qbo_id: r.qbo_id, fields };
  });
}

const READERS: Record<MasterDataEntityKind, (client: PoolClient, opco: string) => Promise<DriftRow[]>> = {
  vendors: readVendorDrift,
  customers: readCustomerDrift,
  accounts: readAccountDrift,
};

const SOURCE_KIND: Record<MasterDataEntityKind, "vendor" | "customer" | "account"> = {
  vendors: "vendor",
  customers: "customer",
  accounts: "account",
};

/**
 * DETECT-ONLY drift pass for one master-data entity kind. Reads local vs QBO-mirror, records one
 * accounting.recon_exceptions row (ANCHOR_DRIFT) per drifted field, and NEVER mutates the source table.
 * Reuses the RECON-01 recon_runs/recon_exceptions audit tables (same as the bank-recon passes).
 */
export async function detectAnchorDrift(
  client: PoolClient,
  opco: string,
  kind: MasterDataEntityKind,
  preparer: string | null = null
): Promise<{ run_id: string; drifted_rows: number; exceptions: number }> {
  const nowIso = new Date().toISOString();
  const runType = `master_data_drift_${kind}` as const;
  const runId = await insertRun(client, opco, runType, nowIso, nowIso, preparer);

  const rows = await READERS[kind](client, opco);
  const sourceKind = SOURCE_KIND[kind];
  const ex: PendingException[] = rows.flatMap((row) =>
    row.fields.map((f) => ({
      exception_class: "ANCHOR_DRIFT" as const,
      source_ref: { kind: sourceKind, id: row.local_id, display: row.local_display },
      qbo_ref: { qbo_id: row.qbo_id },
      field: f.field,
      tms_value: f.tms_value,
      qbo_value: f.qbo_value,
      severity: "medium" as const,
    }))
  );

  await insertExceptions(client, opco, runId, ex);
  await finalizeRun(client, opco, runId, { entity_kind: kind, drifted_rows: rows.length, exceptions: ex.length });

  return { run_id: runId, drifted_rows: rows.length, exceptions: ex.length };
}
