import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { enqueueOutboxEvent } from "../outbox/enqueue-outbox-event.js";
import { appendContractAuditLog, hashAttorneyReviewToken } from "./templates.service.js";

type QueryableClient = {
  query: <T = Record<string, unknown>>(query: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

type RequestAudit = {
  ipAddress: string | null;
  userAgent: string | null;
};

const attorneyDecisionSchema = z.object({
  attorney_name: z.string().trim().min(2).max(200),
  bar_number: z.string().trim().min(2).max(120),
  notes: z.string().trim().max(2000).optional(),
});

const attorneyFeedbackSchema = z.object({
  attorney_name: z.string().trim().min(2).max(200),
  bar_number: z.string().trim().min(2).max(120),
  comments: z.string().trim().min(1).max(8000),
});

async function lookupPrimaryNotifyEmail(client: QueryableClient, template: Record<string, unknown>): Promise<string | null> {
  const userId = template.updated_by_user_id ?? template.created_by_user_id;
  if (!userId || typeof userId !== "string") return null;
  const res = await client.query(
    `
      SELECT email::text AS email
      FROM identity.users
      WHERE id = $1::uuid
        AND deactivated_at IS NULL
      LIMIT 1
    `,
    [userId]
  );
  const email = res.rows[0]?.email;
  return email ? String(email) : null;
}

async function enqueueOfficeAttorneyDecision(client: QueryableClient, args: {
  template: Record<string, unknown>;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  eventClass: string;
}) {
  const to = await lookupPrimaryNotifyEmail(client, args.template);
  if (!to) return;
  const operatingCompanyId = String(args.template.operating_company_id);
  await enqueueOutboxEvent(
    client,
    "legal.attorney.decision_email",
    { aggregate_type: "legal.contract_templates", aggregate_id: String(args.template.id) },
    {
      operating_company_id: operatingCompanyId,
      to,
      subject: args.subject,
      body_text: args.bodyText,
      body_html: args.bodyHtml,
      event_class: args.eventClass,
    }
  );
}

async function withValidAttorneyReviewToken<T>(
  rawToken: string,
  fn: (
    client: QueryableClient,
    tokenRow: Record<string, unknown>,
    templateRow: Record<string, unknown>
  ) => Promise<T>
): Promise<T | null> {
  const tokenHash = hashAttorneyReviewToken(rawToken);
  return withLuciaBypass(async (client) => {
    const tokenRes = await client.query(
      `
        SELECT t.*
        FROM legal.contract_attorney_review_tokens t
        WHERE t.token_hash = $1
          AND t.consumed_at IS NULL
          AND t.expires_at > now()
        ORDER BY t.created_at DESC
        LIMIT 1
      `,
      [tokenHash]
    );
    const tokenRow = tokenRes.rows[0] ?? null;
    if (!tokenRow) return null;

    const templateRes = await client.query(
      `
        SELECT *
        FROM legal.contract_templates
        WHERE operating_company_id = $1::uuid
          AND id = $2
          AND status = 'pending_review'
        LIMIT 1
      `,
      [tokenRow.operating_company_id, tokenRow.contract_template_id]
    );
    const templateRow = templateRes.rows[0] ?? null;
    if (!templateRow) return null;

    return fn(client, tokenRow, templateRow);
  });
}

export async function getPublicAttorneyReviewDetails(rawToken: string, _audit: RequestAudit) {
  return withValidAttorneyReviewToken(rawToken, async (_client, _tokenRow, templateRow) => {
    return {
      template_id: String(templateRow.id),
      template_code: String(templateRow.template_code),
      version: Number(templateRow.version),
      display_name_en: String(templateRow.display_name_en),
      display_name_es: String(templateRow.display_name_es),
      category: String(templateRow.category),
      status: String(templateRow.status),
      submitted_for_review_at: templateRow.submitted_for_review_at
        ? new Date(String(templateRow.submitted_for_review_at)).toISOString()
        : null,
      content_html_en: String(templateRow.content_html_en),
      content_html_es: String(templateRow.content_html_es),
      requires_witness: Boolean(templateRow.requires_witness),
      variable_schema: templateRow.variable_schema,
    };
  });
}

export async function attorneyPortalApprove(
  rawToken: string,
  body: unknown,
  audit: RequestAudit
): Promise<{ ok: true } | { error: string }> {
  const parsed = attorneyDecisionSchema.safeParse(body ?? {});
  if (!parsed.success) return { error: "validation_error" };

  const updated = await withValidAttorneyReviewToken(rawToken, async (client, tokenRow, templateRow) => {
    const operatingCompanyId = String(templateRow.operating_company_id);
    const templateId = String(templateRow.id);
    const templateCode = String(templateRow.template_code);

    await client.query(
      `
        UPDATE legal.contract_templates
        SET
          status = 'retired',
          retired_at = now(),
          updated_by_user_id = NULL
        WHERE operating_company_id = $1::uuid
          AND template_code = $2
          AND status = 'active'
      `,
      [operatingCompanyId, templateCode]
    );

    const updateRes = await client.query(
      `
        UPDATE legal.contract_templates
        SET
          status = 'active',
          attorney_approved_by = $3,
          attorney_bar_number = $4,
          attorney_approved_at = now(),
          attorney_notes = $5,
          activated_at = now(),
          updated_by_user_id = NULL
        WHERE operating_company_id = $1::uuid
          AND id = $2
          AND status = 'pending_review'
        RETURNING *
      `,
      [
        operatingCompanyId,
        templateId,
        parsed.data.attorney_name,
        parsed.data.bar_number,
        parsed.data.notes ?? null,
      ]
    );
    const row = updateRes.rows[0] ?? null;
    if (!row) return null;

    await client.query(
      `
        UPDATE legal.contract_attorney_review_tokens
        SET
          consumed_at = now(),
          consumed_ip = CAST($2 AS inet),
          consumed_user_agent = $3
        WHERE id = $1::uuid
      `,
      [tokenRow.id, audit.ipAddress, audit.userAgent]
    );

    await appendContractAuditLog(client, {
      operatingCompanyId,
      contractTemplateId: templateId,
      eventType: "attorney_portal_approved_activated",
      eventPayload: {
        template_code: templateCode,
        version: templateRow.version,
        attorney_name: parsed.data.attorney_name,
        attorney_bar_number: parsed.data.bar_number,
        notes: parsed.data.notes ?? null,
      },
      actorUserId: null,
      actorName: parsed.data.attorney_name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    const code = String(row.template_code);
    const ver = String(row.version);
    const name = String(row.attorney_approved_by ?? "");
    await enqueueOfficeAttorneyDecision(client, {
      template: row,
      subject: `Legal template approved: ${code} v${ver}`,
      bodyText: `Attorney ${name} approved and activated template ${code} version ${ver} via the attorney review portal.`,
      bodyHtml: `<p>Attorney <strong>${name}</strong> approved and activated template <strong>${code}</strong> version <strong>${ver}</strong> via the attorney review portal.</p>`,
      eventClass: "legal.template.attorney_portal_approved",
    });

    return row;
  });

  if (!updated) return { error: "legal_attorney_review_token_invalid_or_expired" };

  return { ok: true };
}

export async function attorneyPortalRequestChanges(
  rawToken: string,
  body: unknown,
  audit: RequestAudit
): Promise<{ ok: true } | { error: string }> {
  const parsed = attorneyFeedbackSchema.safeParse(body ?? {});
  if (!parsed.success) return { error: "validation_error" };

  const updatedRow = await withValidAttorneyReviewToken(rawToken, async (client, tokenRow, templateRow) => {
    const operatingCompanyId = String(templateRow.operating_company_id);
    const templateId = String(templateRow.id);

    const updateRes = await client.query(
      `
        UPDATE legal.contract_templates
        SET
          status = 'draft',
          submitted_for_review_at = NULL,
          updated_by_user_id = NULL
        WHERE operating_company_id = $1::uuid
          AND id = $2
          AND status = 'pending_review'
        RETURNING *
      `,
      [operatingCompanyId, templateId]
    );
    const row = updateRes.rows[0] ?? null;
    if (!row) return null;

    await client.query(
      `
        UPDATE legal.contract_attorney_review_tokens
        SET
          consumed_at = now(),
          consumed_ip = CAST($2 AS inet),
          consumed_user_agent = $3
        WHERE id = $1::uuid
      `,
      [tokenRow.id, audit.ipAddress, audit.userAgent]
    );

    await appendContractAuditLog(client, {
      operatingCompanyId,
      contractTemplateId: templateId,
      eventType: "attorney_portal_changes_requested",
      eventPayload: {
        template_code: templateRow.template_code,
        version: templateRow.version,
        attorney_name: parsed.data.attorney_name,
        attorney_bar_number: parsed.data.bar_number,
        comments: parsed.data.comments,
      },
      actorUserId: null,
      actorName: parsed.data.attorney_name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    const code = String(row.template_code);
    const ver = String(row.version);
    await enqueueOfficeAttorneyDecision(client, {
      template: row,
      subject: `Revisions requested: ${code} v${ver}`,
      bodyText: `Attorney feedback on ${code} v${ver}:\n\n${parsed.data.comments}`,
      bodyHtml: `<p>Attorney feedback on <strong>${code}</strong> v<strong>${ver}</strong>:</p><pre style="white-space:pre-wrap">${parsed.data.comments}</pre>`,
      eventClass: "legal.template.attorney_portal_changes_requested",
    });

    return row;
  });

  if (!updatedRow) return { error: "legal_attorney_review_token_invalid_or_expired" };

  return { ok: true };
}

export async function attorneyPortalReject(
  rawToken: string,
  body: unknown,
  audit: RequestAudit
): Promise<{ ok: true } | { error: string }> {
  const parsed = attorneyFeedbackSchema.safeParse(body ?? {});
  if (!parsed.success) return { error: "validation_error" };

  const updatedRow = await withValidAttorneyReviewToken(rawToken, async (client, tokenRow, templateRow) => {
    const operatingCompanyId = String(templateRow.operating_company_id);
    const templateId = String(templateRow.id);

    const updateRes = await client.query(
      `
        UPDATE legal.contract_templates
        SET
          status = 'draft',
          submitted_for_review_at = NULL,
          updated_by_user_id = NULL
        WHERE operating_company_id = $1::uuid
          AND id = $2
          AND status = 'pending_review'
        RETURNING *
      `,
      [operatingCompanyId, templateId]
    );
    const row = updateRes.rows[0] ?? null;
    if (!row) return null;

    await client.query(
      `
        UPDATE legal.contract_attorney_review_tokens
        SET
          consumed_at = now(),
          consumed_ip = CAST($2 AS inet),
          consumed_user_agent = $3
        WHERE id = $1::uuid
      `,
      [tokenRow.id, audit.ipAddress, audit.userAgent]
    );

    await appendContractAuditLog(client, {
      operatingCompanyId,
      contractTemplateId: templateId,
      eventType: "attorney_portal_rejected",
      eventPayload: {
        template_code: templateRow.template_code,
        version: templateRow.version,
        attorney_name: parsed.data.attorney_name,
        attorney_bar_number: parsed.data.bar_number,
        reason: parsed.data.comments,
      },
      actorUserId: null,
      actorName: parsed.data.attorney_name,
      ipAddress: audit.ipAddress,
      userAgent: audit.userAgent,
    });

    const code = String(row.template_code);
    const ver = String(row.version);
    await enqueueOfficeAttorneyDecision(client, {
      template: row,
      subject: `Template review declined: ${code} v${ver}`,
      bodyText: `Attorney declined ${code} v${ver} with notes:\n\n${parsed.data.comments}`,
      bodyHtml: `<p>Attorney declined <strong>${code}</strong> v<strong>${ver}</strong> with notes:</p><pre style="white-space:pre-wrap">${parsed.data.comments}</pre>`,
      eventClass: "legal.template.attorney_portal_rejected",
    });

    return row;
  });

  if (!updatedRow) return { error: "legal_attorney_review_token_invalid_or_expired" };

  return { ok: true };
}
