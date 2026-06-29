// Legal Template Library — idempotent seed of the 7 owner-activated templates
// (4 lease versions + 3 NDA variants) from the verbatim source docx.
//
// Owner directive (Jorge): KEEP all 19 existing templates untouched; ADD these 7
// under DISTINCT codes; MAKE them active so the creator works now. Activation is
// pre-attorney-review per owner directive — each carries the in-document DRAFT
// banner + attorney_notes='Owner-activated; pending Carl Barto review'; clear the
// banner via the lifecycle 'approve' step when Carl signs off.
//
// Idempotent: ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
// → re-running adds zero duplicates and NEVER mutates an existing row's status
// (the CI guard verify-legal-template-seed-no-status-flip.mjs enforces this).

import { LEGAL_TEMPLATE_LIBRARY } from "./templates/legal-template-library.generated.js";
import { appendContractAuditLog } from "./templates.service.js";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const OWNER_ACTIVATION_NOTE = "Owner-activated; pending Carl Barto review";

export async function ensureLegalTemplateLibrary(
  client: QueryableClient,
  args: { operatingCompanyId: string; actorUserId: string }
) {
  const results: Array<{ template_code: string; version: number; inserted: boolean }> = [];

  for (const tpl of LEGAL_TEMPLATE_LIBRARY) {
    const res = await client.query(
      `
        INSERT INTO legal.contract_templates (
          operating_company_id,
          template_code,
          version,
          display_name_en,
          display_name_es,
          category,
          content_html_en,
          content_html_es,
          variable_schema,
          requires_witness,
          status,
          activated_at,
          attorney_notes,
          created_by_user_id,
          updated_by_user_id
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'active',now(),$11,$12,$12
        )
        ON CONFLICT (operating_company_id, template_code, version) DO NOTHING
        RETURNING id, template_code, version, status
      `,
      [
        args.operatingCompanyId,
        tpl.template_code,
        tpl.version,
        tpl.display_name_en,
        tpl.display_name_es,
        tpl.category,
        tpl.content_html_en,
        tpl.content_html_es,
        JSON.stringify(tpl.variable_schema),
        tpl.requires_witness,
        OWNER_ACTIVATION_NOTE,
        args.actorUserId,
      ]
    );

    const inserted = Boolean(res.rows[0]);
    if (inserted) {
      await appendContractAuditLog(client, {
        operatingCompanyId: args.operatingCompanyId,
        contractTemplateId: String(res.rows[0].id),
        eventType: "template_library_seeded",
        eventPayload: {
          template_code: tpl.template_code,
          version: tpl.version,
          status: "active",
          owner_activated: true,
        },
        actorUserId: args.actorUserId,
      });
    }
    results.push({ template_code: tpl.template_code, version: tpl.version, inserted });
  }

  return {
    total: LEGAL_TEMPLATE_LIBRARY.length,
    inserted: results.filter((r) => r.inserted).length,
    already_present: results.filter((r) => !r.inserted).length,
    results,
  };
}
