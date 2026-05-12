import crypto from "node:crypto";
import { z } from "zod";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const templateStatusSchema = z.enum(["draft", "pending_review", "approved", "active", "retired"]);

const variableDefinitionSchema = z.object({
  type: z.enum(["text", "date", "number", "boolean"]),
  required: z.boolean(),
  description: z.string().trim().max(500).optional(),
});

const variableSchemaSchema = z.object({
  fields: z.record(z.string().trim().min(1).max(120), variableDefinitionSchema),
});

export const legalTemplateDraftSchema = z.object({
  template_code: z.string().trim().min(2).max(120),
  display_name_en: z.string().trim().min(2).max(240),
  display_name_es: z.string().trim().min(2).max(240),
  category: z.string().trim().min(2).max(120),
  content_html_en: z.string().trim().min(1),
  content_html_es: z.string().trim().min(1),
  variable_schema: variableSchemaSchema,
  requires_witness: z.boolean().default(false),
});

export const legalTemplateUpdateSchema = legalTemplateDraftSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: "at least one field is required",
});

function normalizeTemplateCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

function assertStatus(status: unknown): z.infer<typeof templateStatusSchema> {
  return templateStatusSchema.parse(status);
}

export function hashAttorneyReviewToken(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

export function resolveAttorneyReviewUrl(rawToken: string) {
  const base = (
    process.env.SIGNER_APP_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    "https://ih35-tms-web.onrender.com"
  ).replace(/\/$/, "");
  return `${base}/attorney-review/${rawToken}`;
}

const ATTORNEY_REVIEW_TOKEN_TTL_HOURS = 30 * 24;

export async function appendContractAuditLog(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    contractTemplateId?: string | null;
    contractInstanceId?: string | null;
    eventType: string;
    eventPayload?: Record<string, unknown>;
    actorUserId?: string | null;
    actorName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  }
) {
  await client.query(
    `
      INSERT INTO legal.contract_audit_log (
        operating_company_id,
        contract_template_id,
        contract_instance_id,
        event_type,
        event_payload,
        actor_user_id,
        actor_name,
        ip_address,
        user_agent
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
    `,
    [
      args.operatingCompanyId,
      args.contractTemplateId ?? null,
      args.contractInstanceId ?? null,
      args.eventType,
      JSON.stringify(args.eventPayload ?? {}),
      args.actorUserId ?? null,
      args.actorName ?? null,
      args.ipAddress ?? null,
      args.userAgent ?? null,
    ]
  );
}

async function mintAttorneyReviewToken(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    contractTemplateId: string;
    actorUserId: string;
  }
) {
  await client.query(
    `
      UPDATE legal.contract_attorney_review_tokens
      SET consumed_at = now()
      WHERE operating_company_id = $1
        AND contract_template_id = $2
        AND consumed_at IS NULL
    `,
    [args.operatingCompanyId, args.contractTemplateId]
  );

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = hashAttorneyReviewToken(rawToken);

  await client.query(
    `
      INSERT INTO legal.contract_attorney_review_tokens (
        operating_company_id,
        contract_template_id,
        token_hash,
        expires_at,
        created_by_user_id
      )
      VALUES (
        $1,
        $2,
        $3,
        now() + ($4::text || ' hours')::interval,
        $5
      )
    `,
    [args.operatingCompanyId, args.contractTemplateId, tokenHash, String(ATTORNEY_REVIEW_TOKEN_TTL_HOURS), args.actorUserId]
  );

  return { rawToken, attorney_review_url: resolveAttorneyReviewUrl(rawToken) };
}

export async function remintAttorneyReviewLink(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
  }
) {
  const res = await client.query(
    `
      SELECT id, status
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.id]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;
  if (row.status !== "pending_review") return { error: "legal_template_remint_requires_pending_review" as const };

  const minted = await mintAttorneyReviewToken(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    actorUserId: args.actorUserId,
  });

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    eventType: "attorney_review_token_reminted",
    eventPayload: { ttl_hours: ATTORNEY_REVIEW_TOKEN_TTL_HOURS },
    actorUserId: args.actorUserId,
  });

  return { attorney_review_url: minted.attorney_review_url };
}

export async function listTemplates(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    category?: string;
    language?: "en" | "es" | "bilingual";
    status?: z.infer<typeof templateStatusSchema>;
    search?: string;
  }
) {
  const values: unknown[] = [args.operatingCompanyId];
  const where: string[] = ["operating_company_id = $1"];

  if (args.category) {
    values.push(args.category.trim());
    where.push(`category = $${values.length}`);
  }
  if (args.status) {
    values.push(assertStatus(args.status));
    where.push(`status = $${values.length}::legal.contract_template_status`);
  }
  if (args.language) {
    if (args.language === "en") where.push("length(content_html_en) > 0");
    if (args.language === "es") where.push("length(content_html_es) > 0");
    if (args.language === "bilingual") where.push("length(content_html_en) > 0 AND length(content_html_es) > 0");
  }
  if (args.search) {
    values.push(`%${args.search.trim()}%`);
    where.push(`(template_code ILIKE $${values.length} OR display_name_en ILIKE $${values.length} OR display_name_es ILIKE $${values.length})`);
  }

  const res = await client.query(
    `
      SELECT
        id,
        template_code,
        version,
        display_name_en,
        display_name_es,
        category,
        requires_witness,
        status,
        submitted_for_review_at,
        attorney_approved_by,
        attorney_bar_number,
        attorney_approved_at,
        activated_at,
        retired_at,
        created_at,
        updated_at
      FROM legal.contract_templates
      WHERE ${where.join(" AND ")}
      ORDER BY template_code ASC, version DESC
    `,
    values
  );
  return res.rows;
}

export async function getTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    id: string;
    version?: number;
  }
) {
  if (!args.version) {
    const detail = await client.query(
      `
        SELECT
          id,
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
          submitted_for_review_at,
          attorney_approved_by,
          attorney_bar_number,
          attorney_approved_at,
          attorney_notes,
          activated_at,
          retired_at,
          created_by_user_id,
          updated_by_user_id,
          created_at,
          updated_at
        FROM legal.contract_templates
        WHERE operating_company_id = $1
          AND id = $2
        LIMIT 1
      `,
      [args.operatingCompanyId, args.id]
    );
    const template = detail.rows[0] ?? null;
    if (!template) return null;

    const versions = await client.query(
      `
        SELECT
          id,
          template_code,
          version,
          status,
          created_at,
          updated_at,
          attorney_approved_by,
          attorney_approved_at
        FROM legal.contract_templates
        WHERE operating_company_id = $1
          AND template_code = $2
        ORDER BY version DESC
      `,
      [args.operatingCompanyId, template.template_code]
    );

    const auditLog = await client.query(
      `
        SELECT
          id,
          event_type,
          event_payload,
          actor_user_id,
          actor_name,
          ip_address,
          user_agent,
          created_at
        FROM legal.contract_audit_log
        WHERE operating_company_id = $1
          AND contract_template_id = $2
        ORDER BY id DESC
        LIMIT 200
      `,
      [args.operatingCompanyId, args.id]
    );

    return {
      ...template,
      versions: versions.rows,
      audit_log: auditLog.rows,
    };
  }

  const res = await client.query(
    `
      SELECT
        id,
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
        submitted_for_review_at,
        attorney_approved_by,
        attorney_bar_number,
        attorney_approved_at,
        attorney_notes,
        activated_at,
        retired_at,
        created_by_user_id,
        updated_by_user_id,
        created_at,
        updated_at
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND id = $2
        AND version = $3
      LIMIT 1
    `,
    [args.operatingCompanyId, args.id, args.version]
  );
  return res.rows[0] ?? null;
}

export async function listVersions(
  client: QueryableClient,
  args: { operatingCompanyId: string; templateCode: string }
) {
  const res = await client.query(
    `
      SELECT
        id,
        template_code,
        version,
        status,
        created_at,
        updated_at,
        attorney_approved_by,
        attorney_approved_at
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND template_code = $2
      ORDER BY version DESC
    `,
    [args.operatingCompanyId, normalizeTemplateCode(args.templateCode)]
  );
  return res.rows;
}

export async function createTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    draft: z.infer<typeof legalTemplateDraftSchema>;
  }
) {
  const parsed = legalTemplateDraftSchema.parse(args.draft);
  const templateCode = normalizeTemplateCode(parsed.template_code);
  const variableSchema = variableSchemaSchema.parse(parsed.variable_schema);

  const versionRes = await client.query(
    `
      SELECT COALESCE(MAX(version), 0) + 1 AS next_version
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND template_code = $2
    `,
    [args.operatingCompanyId, templateCode]
  );
  const nextVersion = Number(versionRes.rows[0]?.next_version ?? 1);

  const insertRes = await client.query(
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
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,'draft',$11,$11
      )
      RETURNING
        id,
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
        created_at,
        updated_at
    `,
    [
      args.operatingCompanyId,
      templateCode,
      nextVersion,
      parsed.display_name_en,
      parsed.display_name_es,
      parsed.category,
      parsed.content_html_en,
      parsed.content_html_es,
      JSON.stringify(variableSchema),
      parsed.requires_witness,
      args.actorUserId,
    ]
  );
  const created = insertRes.rows[0];

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(created.id),
    eventType: "template_created",
    eventPayload: {
      template_code: created.template_code,
      version: created.version,
      status: created.status,
    },
    actorUserId: args.actorUserId,
  });

  return created;
}

export async function updateTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
    changes: z.infer<typeof legalTemplateUpdateSchema>;
  }
) {
  const parsed = legalTemplateUpdateSchema.parse(args.changes);
  const currentRes = await client.query(
    `
      SELECT *
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.id]
  );
  const current = currentRes.rows[0] ?? null;
  if (!current) return { error: "legal_template_not_found" as const };
  if (current.status !== "draft") return { error: "legal_template_edit_requires_draft_status" as const };

  const setParts: string[] = [];
  const values: unknown[] = [];
  const add = (column: string, value: unknown) => {
    values.push(value);
    setParts.push(`${column} = $${values.length}`);
  };

  if (parsed.template_code) add("template_code", normalizeTemplateCode(parsed.template_code));
  if (parsed.display_name_en) add("display_name_en", parsed.display_name_en);
  if (parsed.display_name_es) add("display_name_es", parsed.display_name_es);
  if (parsed.category) add("category", parsed.category);
  if (parsed.content_html_en) add("content_html_en", parsed.content_html_en);
  if (parsed.content_html_es) add("content_html_es", parsed.content_html_es);
  if (parsed.variable_schema) add("variable_schema", JSON.stringify(variableSchemaSchema.parse(parsed.variable_schema)));
  if (typeof parsed.requires_witness === "boolean") add("requires_witness", parsed.requires_witness);

  add("updated_by_user_id", args.actorUserId);
  values.push(args.operatingCompanyId, args.id);

  const updateRes = await client.query(
    `
      UPDATE legal.contract_templates
      SET ${setParts.join(", ")}
      WHERE operating_company_id = $${values.length - 1}
        AND id = $${values.length}
      RETURNING
        id,
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
        created_at,
        updated_at
    `,
    values
  );
  const updated = updateRes.rows[0];

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(updated.id),
    eventType: "template_updated",
    eventPayload: { changes: parsed },
    actorUserId: args.actorUserId,
  });

  return { row: updated };
}

export async function submitForAttorneyReview(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
  }
) {
  const res = await client.query(
    `
      UPDATE legal.contract_templates
      SET
        status = 'pending_review',
        submitted_for_review_at = now(),
        updated_by_user_id = $3
      WHERE operating_company_id = $1
        AND id = $2
        AND status = 'draft'
      RETURNING id, template_code, version, status, submitted_for_review_at
    `,
    [args.operatingCompanyId, args.id, args.actorUserId]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    eventType: "template_submitted_for_review",
    eventPayload: { template_code: row.template_code, version: row.version },
    actorUserId: args.actorUserId,
  });

  const minted = await mintAttorneyReviewToken(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    actorUserId: args.actorUserId,
  });

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    eventType: "attorney_review_token_minted",
    eventPayload: { template_code: row.template_code, version: row.version, ttl_hours: ATTORNEY_REVIEW_TOKEN_TTL_HOURS },
    actorUserId: args.actorUserId,
  });

  return { ...row, attorney_review_url: minted.attorney_review_url };
}

export async function approveTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
    attorneyName: string;
    barNumber: string;
    notes?: string;
  }
) {
  const res = await client.query(
    `
      UPDATE legal.contract_templates
      SET
        status = 'approved',
        attorney_approved_by = $3,
        attorney_bar_number = $4,
        attorney_approved_at = now(),
        attorney_notes = $5,
        updated_by_user_id = $6
      WHERE operating_company_id = $1
        AND id = $2
        AND status = 'pending_review'
      RETURNING
        id, template_code, version, status,
        attorney_approved_by, attorney_bar_number, attorney_approved_at, attorney_notes
    `,
    [args.operatingCompanyId, args.id, args.attorneyName, args.barNumber, args.notes ?? null, args.actorUserId]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    eventType: "template_approved",
    eventPayload: {
      template_code: row.template_code,
      version: row.version,
      attorney_name: row.attorney_approved_by,
      attorney_bar_number: row.attorney_bar_number,
    },
    actorUserId: args.actorUserId,
  });
  return row;
}

export async function activateTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
  }
) {
  const targetRes = await client.query(
    `
      SELECT id, template_code, version, status
      FROM legal.contract_templates
      WHERE operating_company_id = $1
        AND id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.id]
  );
  const target = targetRes.rows[0] ?? null;
  if (!target) return { error: "legal_template_not_found" as const };
  if (target.status !== "approved") return { error: "legal_template_activate_requires_approved_status" as const };

  await client.query(
    `
      UPDATE legal.contract_templates
      SET
        status = 'retired',
        retired_at = now(),
        updated_by_user_id = $3
      WHERE operating_company_id = $1
        AND template_code = $2
        AND status = 'active'
    `,
    [args.operatingCompanyId, target.template_code, args.actorUserId]
  );

  const activateRes = await client.query(
    `
      UPDATE legal.contract_templates
      SET
        status = 'active',
        activated_at = now(),
        updated_by_user_id = $3
      WHERE operating_company_id = $1
        AND id = $2
      RETURNING id, template_code, version, status, activated_at
    `,
    [args.operatingCompanyId, args.id, args.actorUserId]
  );
  const activated = activateRes.rows[0];

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(activated.id),
    eventType: "template_activated",
    eventPayload: {
      template_code: activated.template_code,
      version: activated.version,
    },
    actorUserId: args.actorUserId,
  });

  return { row: activated };
}

export async function retireTemplate(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    id: string;
  }
) {
  const res = await client.query(
    `
      UPDATE legal.contract_templates
      SET
        status = 'retired',
        retired_at = now(),
        updated_by_user_id = $3
      WHERE operating_company_id = $1
        AND id = $2
        AND status <> 'retired'
      RETURNING id, template_code, version, status, retired_at
    `,
    [args.operatingCompanyId, args.id, args.actorUserId]
  );
  const row = res.rows[0] ?? null;
  if (!row) return null;

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(row.id),
    eventType: "template_retired",
    eventPayload: {
      template_code: row.template_code,
      version: row.version,
    },
    actorUserId: args.actorUserId,
  });
  return row;
}

export function validateFilledVariablesAgainstSchema(
  variableSchema: unknown,
  filledVariables: Record<string, unknown>
) {
  const parsedSchema = variableSchemaSchema.parse(variableSchema);
  const missingRequired: string[] = [];
  for (const [name, definition] of Object.entries(parsedSchema.fields)) {
    if (!definition.required) continue;
    const value = filledVariables[name];
    if (value === null || value === undefined || String(value).trim() === "") {
      missingRequired.push(name);
    }
  }
  return {
    ok: missingRequired.length === 0,
    missing_required: missingRequired,
  };
}
