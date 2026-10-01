// ROUND 316 — idempotent seed of a contract type's template (same pattern as ensureTruckLeaseTemplate), for the
// types in templates/contract-type-library.ts (trailer lease, transportation services agreement).
import { CONTRACT_TYPE_TEMPLATES } from "./templates/contract-type-library.js";
import { appendCrudAudit } from "../audit/crud-audit.js";

type QueryableClient = { query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> };

export const ENSURABLE_CONTRACT_TYPES = Object.keys(CONTRACT_TYPE_TEMPLATES);

export async function ensureContractTypeTemplate(client: QueryableClient, operatingCompanyId: string, actorUserId: string, code: string) {
  const def = CONTRACT_TYPE_TEMPLATES[code];
  if (!def) throw new Error("legal_unknown_contract_type");
  const active = async () =>
    (await client.query(
      `SELECT id::text, version FROM legal.contract_templates
        WHERE operating_company_id = $1::uuid AND template_code = $2 AND status = 'active' ORDER BY version DESC LIMIT 1`,
      [operatingCompanyId, def.code]
    )).rows[0] as { id: string; version: number } | undefined;
  const existing = await active();
  if (existing) return { ...existing, seeded: false };
  const ins = await client.query(
    `INSERT INTO legal.contract_templates (
        operating_company_id, template_code, version, display_name_en, display_name_es, category,
        content_html_en, content_html_es, variable_schema, requires_witness, status, created_by_user_id, updated_by_user_id
     ) VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8::jsonb,true,'active',$9,$9)
     ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
     RETURNING id::text, version`,
    [operatingCompanyId, def.code, def.nameEn, def.nameEs, def.category, def.htmlEn, def.htmlEs, JSON.stringify(def.schema), actorUserId]
  );
  if (ins.rows[0]) {
    await appendCrudAudit(client as never, actorUserId, "legal.contract_type_template.seeded", {
      template_id: ins.rows[0].id, version: ins.rows[0].version, operating_company_id: operatingCompanyId, template_code: def.code,
    });
    return { id: ins.rows[0].id as string, version: ins.rows[0].version as number, seeded: true };
  }
  const reread = await active();
  if (reread) return { ...reread, seeded: false };
  throw new Error("legal_contract_type_template_seed_failed");
}
