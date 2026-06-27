// LEGAL-TRUCK-LEASE-01 — truck lease backend service.
// Mirrors the lease-to-own pattern: idempotent seed → active template on first call.

import {
  TRUCK_LEASE_TEMPLATE_CODE,
  TRUCK_LEASE_DISPLAY_NAME_EN,
  TRUCK_LEASE_DISPLAY_NAME_ES,
  TRUCK_LEASE_CATEGORY,
  TRUCK_LEASE_CONTENT_HTML_EN,
  TRUCK_LEASE_CONTENT_HTML_ES,
  TRUCK_LEASE_VARIABLE_SCHEMA,
} from "./templates/truck-lease.template.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type QueryableClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export function truckLeaseEnabled(): boolean {
  return (process.env.LEGAL_CONTRACTS_ENABLED ?? "false") === "true";
}

/**
 * Seed the canonical truck_lease template (status='active', version 1) for the entity
 * if no active one exists. Idempotent: returns the existing active template when present.
 */
export async function ensureTruckLeaseTemplate(
  client: QueryableClient,
  operatingCompanyId: string,
  actorUserId: string,
): Promise<{ id: string; version: number; seeded: boolean }> {
  const existing = await client.query(
    `SELECT id::text, version FROM legal.contract_templates
      WHERE operating_company_id = $1 AND template_code = $2 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [operatingCompanyId, TRUCK_LEASE_TEMPLATE_CODE],
  );
  if (existing.rows[0]) {
    return { id: existing.rows[0].id, version: existing.rows[0].version, seeded: false };
  }

  const ins = await client.query(
    `INSERT INTO legal.contract_templates (
        operating_company_id, template_code, version,
        display_name_en, display_name_es, category,
        content_html_en, content_html_es, variable_schema,
        requires_witness, status, created_by_user_id, updated_by_user_id
     ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true,'active',$9,$9)
     ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
     RETURNING id::text, version`,
    [
      operatingCompanyId, TRUCK_LEASE_TEMPLATE_CODE,
      TRUCK_LEASE_DISPLAY_NAME_EN, TRUCK_LEASE_DISPLAY_NAME_ES, TRUCK_LEASE_CATEGORY,
      TRUCK_LEASE_CONTENT_HTML_EN, TRUCK_LEASE_CONTENT_HTML_ES, JSON.stringify(TRUCK_LEASE_VARIABLE_SCHEMA),
      actorUserId,
    ],
  );

  if (ins.rows[0]) {
    await appendCrudAudit(client, actorUserId, "legal.truck_lease_template.seeded", {
      template_id: ins.rows[0].id,
      version: ins.rows[0].version,
      operating_company_id: operatingCompanyId,
      template_code: TRUCK_LEASE_TEMPLATE_CODE,
    });
    return { id: ins.rows[0].id, version: ins.rows[0].version, seeded: true };
  }

  // Lost race — re-read the active one.
  const reread = await client.query(
    `SELECT id::text, version FROM legal.contract_templates
      WHERE operating_company_id = $1 AND template_code = $2 AND status = 'active'
      ORDER BY version DESC LIMIT 1`,
    [operatingCompanyId, TRUCK_LEASE_TEMPLATE_CODE],
  );
  if (reread.rows[0]) return { id: reread.rows[0].id, version: reread.rows[0].version, seeded: false };
  throw new Error("truck_lease_template_seed_failed");
}
