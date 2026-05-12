import crypto from "node:crypto";
import { z } from "zod";
import { sendEmail } from "../notifications/email.service.js";
import { withLuciaBypass } from "../auth/db.js";
import { renderSignedContractPdf } from "./pdf-renderer.service.js";
import { getR2BucketName } from "../storage/r2-client.js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { validateFilledVariablesAgainstSchema } from "./templates.service.js";

type QueryableClient = {
  query: (query: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

const contractCreateSchema = z.object({
  template_id: z.string().uuid().optional(),
  template_code: z.string().trim().min(2).max(120).optional(),
  signer_type: z.enum(["driver", "employee", "customer", "vendor", "other"]),
  signer_entity_id: z.string().uuid().optional(),
  signer_name: z.string().trim().min(2).max(200),
  signer_email: z.string().trim().email().optional(),
  signer_phone: z.string().trim().regex(/^\+\d{10,15}$/).optional(),
  language: z.enum(["en", "es", "bilingual"]),
  filled_variables: z.record(z.string(), z.unknown()).default({}),
});

const tokenSendSchema = z.object({
  verification_channel: z.enum(["none", "sms", "email"]),
  delivery_channel: z.enum(["email", "sms", "whatsapp"]).default("email"),
  expires_in_hours: z.number().int().min(1).max(168).default(48),
  custom_message: z.string().trim().max(1200).optional(),
});

const signatureCompleteSchema = z.object({
  signed_by_name: z.string().trim().min(2).max(200),
  typed_signature: z.string().trim().min(2).max(200),
  drawn_signature_svg: z.string().trim().min(10).max(200_000),
  signer_language: z.enum(["en", "es", "bilingual"]),
  accepted_terms: z.literal(true),
  verification_code: z.string().regex(/^\d{6}$/).optional(),
});

const verifyStartSchema = z.object({
  channel: z.enum(["email", "sms"]).optional(),
});

const verifyConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

type AuditMeta = {
  actorUserId?: string | null;
  actorName?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
};

const r2Client =
  process.env.R2_ACCOUNT_ID && process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    ? new S3Client({
        region: "auto",
        endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      })
    : null;

function normalizeTokenForHash(rawToken: string) {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

function normalizeCodeForHash(code: string) {
  return crypto.createHash("sha256").update(code).digest("hex");
}

function randomSixDigitCode() {
  return String(Math.floor(Math.random() * 1_000_000)).padStart(6, "0");
}

function normalizeTemplateCode(code: string) {
  return code.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
}

async function appendContractAuditLog(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    contractTemplateId?: string | null;
    contractInstanceId?: string | null;
    eventType: string;
    eventPayload?: Record<string, unknown>;
  } & AuditMeta
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
      )
      VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9)
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

async function setOperatingCompany(client: QueryableClient, operatingCompanyId: string) {
  await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);
}

function resolveSignerUrl(rawToken: string) {
  const base = (process.env.SIGNER_APP_BASE_URL || process.env.FRONTEND_BASE_URL || "https://ih35-tms-web.onrender.com").replace(/\/$/, "");
  return `${base}/sign/${rawToken}`;
}

async function enqueueOutboxEvent(client: QueryableClient, eventType: string, payload: Record<string, unknown>) {
  await client.query(
    `
      INSERT INTO outbox.events (event_type, payload, next_retry_at)
      VALUES ($1, $2::jsonb, now())
    `,
    [eventType, JSON.stringify(payload)]
  );
}

export async function listContractInstances(
  client: QueryableClient,
  args: { operatingCompanyId: string; status?: string; search?: string }
) {
  const values: unknown[] = [args.operatingCompanyId];
  const where: string[] = ["ci.operating_company_id = $1"];
  if (args.status) {
    values.push(args.status);
    where.push(`ci.status = $${values.length}::legal.contract_instance_status`);
  }
  if (args.search) {
    values.push(`%${args.search.trim()}%`);
    where.push(`(ci.signer_name ILIKE $${values.length} OR ci.template_code ILIKE $${values.length})`);
  }
  const res = await client.query(
    `
      SELECT
        ci.id,
        ci.template_id,
        ci.template_code,
        ci.template_version,
        ci.signer_type,
        ci.signer_name,
        ci.signer_email,
        ci.signer_phone,
        ci.language,
        ci.status,
        ci.sent_at,
        ci.viewed_at,
        ci.signed_at,
        ci.voided_at,
        ci.created_at,
        ci.updated_at,
        ct.display_name_en,
        ct.display_name_es
      FROM legal.contract_instances ci
      LEFT JOIN legal.contract_templates ct
        ON ct.id = ci.template_id
      WHERE ${where.join(" AND ")}
      ORDER BY ci.created_at DESC
      LIMIT 300
    `,
    values
  );
  return res.rows;
}

export async function createContractInstance(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    actorName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    payload: z.infer<typeof contractCreateSchema>;
  }
) {
  const input = contractCreateSchema.parse(args.payload);
  const templateSelectorById = input.template_id ? `AND t.id = $2` : "";
  const templateSelectorByCode = !input.template_id && input.template_code ? `AND t.template_code = $2` : "";
  const selectorValue = input.template_id ?? normalizeTemplateCode(String(input.template_code ?? ""));
  const templateRes = await client.query(
    `
      SELECT
        t.id,
        t.template_code,
        t.version,
        t.variable_schema,
        t.content_html_en,
        t.content_html_es
      FROM legal.contract_templates t
      WHERE t.operating_company_id = $1
        ${templateSelectorById}
        ${templateSelectorByCode}
        AND t.status = 'active'
      ORDER BY t.version DESC
      LIMIT 1
    `,
    [args.operatingCompanyId, selectorValue]
  );
  const template = templateRes.rows[0] ?? null;
  if (!template) throw new Error("legal_active_template_required");

  const validation = validateFilledVariablesAgainstSchema(template.variable_schema, input.filled_variables);
  if (!validation.ok) {
    const err = new Error("legal_missing_required_variables");
    (err as Error & { details?: unknown }).details = validation.missing_required;
    throw err;
  }

  const insertRes = await client.query(
    `
      INSERT INTO legal.contract_instances (
        operating_company_id,
        template_id,
        template_code,
        template_version,
        signer_type,
        signer_entity_id,
        signer_name,
        signer_email,
        signer_phone,
        language,
        filled_variables,
        status,
        created_by_user_id,
        updated_by_user_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,'draft',$12,$12
      )
      RETURNING *
    `,
    [
      args.operatingCompanyId,
      template.id,
      template.template_code,
      template.version,
      input.signer_type,
      input.signer_entity_id ?? null,
      input.signer_name,
      input.signer_email ?? null,
      input.signer_phone ?? null,
      input.language,
      JSON.stringify(input.filled_variables),
      args.actorUserId,
    ]
  );
  const instance = insertRes.rows[0];
  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractTemplateId: String(template.id),
    contractInstanceId: String(instance.id),
    eventType: "contract_instance_created",
    eventPayload: {
      template_code: template.template_code,
      template_version: template.version,
      signer_type: input.signer_type,
      signer_name: input.signer_name,
    },
    actorUserId: args.actorUserId,
    actorName: args.actorName,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });
  return instance;
}

export async function sendContractSigningLink(
  client: QueryableClient,
  args: {
    operatingCompanyId: string;
    actorUserId: string;
    actorName?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
    contractInstanceId: string;
    payload: z.infer<typeof tokenSendSchema>;
  }
) {
  const input = tokenSendSchema.parse(args.payload);
  const instanceRes = await client.query(
    `
      SELECT *
      FROM legal.contract_instances
      WHERE operating_company_id = $1
        AND id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.contractInstanceId]
  );
  const instance = instanceRes.rows[0] ?? null;
  if (!instance) throw new Error("legal_contract_instance_not_found");
  if (!["draft", "sent", "viewed"].includes(String(instance.status))) {
    throw new Error("legal_contract_send_invalid_status");
  }

  const rawToken = crypto.randomBytes(24).toString("hex");
  const tokenHash = normalizeTokenForHash(rawToken);
  const expiresAtSql = `now() + ($3::text || ' hours')::interval`;
  const verificationTarget =
    input.verification_channel === "email"
      ? String(instance.signer_email ?? "")
      : input.verification_channel === "sms"
      ? String(instance.signer_phone ?? "")
      : null;

  if (input.verification_channel === "email" && !instance.signer_email) {
    throw new Error("legal_signer_email_required");
  }
  if (input.verification_channel === "sms" && !instance.signer_phone) {
    throw new Error("legal_signer_phone_required");
  }

  await client.query(
    `
      INSERT INTO legal.contract_signing_tokens (
        operating_company_id,
        contract_instance_id,
        token_hash,
        expires_at,
        verification_channel,
        verification_target,
        created_by_user_id
      )
      VALUES (
        $1,$2,$4,${expiresAtSql},$5,$6,$7
      )
    `,
    [args.operatingCompanyId, args.contractInstanceId, input.expires_in_hours, tokenHash, input.verification_channel, verificationTarget, args.actorUserId]
  );

  const signerUrl = resolveSignerUrl(rawToken);
  const message =
    input.custom_message && input.custom_message.length > 0
      ? `${input.custom_message}\n\nSign here: ${signerUrl}`
      : `IH 35 legal contract ready for signature.\n\nSign here: ${signerUrl}`;

  if (input.delivery_channel === "email") {
    if (!instance.signer_email) throw new Error("legal_signer_email_required");
    await sendEmail({
      to: String(instance.signer_email),
      subject: "IH 35 contract signature requested",
      html: `<p>Hello ${String(instance.signer_name)},</p><p>Please review and sign your document here:</p><p><a href="${signerUrl}">${signerUrl}</a></p>`,
      text: `Hello ${String(instance.signer_name)}, sign your document: ${signerUrl}`,
      sender: "noreply",
      eventClass: "legal.contract.sign_link_sent",
      actorUserId: args.actorUserId,
    });
  } else {
    if (!instance.signer_phone) throw new Error("legal_signer_phone_required");
    const eventType = input.delivery_channel === "whatsapp" ? "twilio.whatsapp.send" : "twilio.sms.send";
    await enqueueOutboxEvent(client, eventType, {
      to: String(instance.signer_phone),
      body: message,
      source: "legal.contract.send_link",
    });
  }

  const status = String(instance.status) === "draft" ? "sent" : String(instance.status);
  await client.query(
    `
      UPDATE legal.contract_instances
      SET status = $3::legal.contract_instance_status,
          sent_at = COALESCE(sent_at, now()),
          updated_by_user_id = $4
      WHERE operating_company_id = $1
        AND id = $2
    `,
    [args.operatingCompanyId, args.contractInstanceId, status, args.actorUserId]
  );

  await appendContractAuditLog(client, {
    operatingCompanyId: args.operatingCompanyId,
    contractInstanceId: args.contractInstanceId,
    contractTemplateId: String(instance.template_id),
    eventType: "contract_sign_link_sent",
    eventPayload: {
      delivery_channel: input.delivery_channel,
      verification_channel: input.verification_channel,
      expires_in_hours: input.expires_in_hours,
    },
    actorUserId: args.actorUserId,
    actorName: args.actorName,
    ipAddress: args.ipAddress,
    userAgent: args.userAgent,
  });

  return { ok: true, signer_url: signerUrl };
}

async function withValidToken<T>(rawToken: string, fn: (client: QueryableClient, token: Record<string, unknown>) => Promise<T>) {
  const tokenHash = normalizeTokenForHash(rawToken);
  return withLuciaBypass(async (client) => {
    const tokenRes = await client.query(
      `
        SELECT
          t.*,
          ci.template_id,
          ci.template_code,
          ci.template_version,
          ci.signer_name,
          ci.signer_email,
          ci.signer_phone,
          ci.language,
          ci.filled_variables,
          ci.status AS contract_status,
          ci.operating_company_id,
          ci.created_by_user_id,
          ct.display_name_en,
          ct.display_name_es,
          ct.content_html_en,
          ct.content_html_es
        FROM legal.contract_signing_tokens t
        JOIN legal.contract_instances ci
          ON ci.id = t.contract_instance_id
         AND ci.operating_company_id = t.operating_company_id
        JOIN legal.contract_templates ct
          ON ct.id = ci.template_id
         AND ct.operating_company_id = ci.operating_company_id
        WHERE t.token_hash = $1
          AND t.consumed_at IS NULL
          AND t.expires_at > now()
        ORDER BY t.created_at DESC
        LIMIT 1
      `,
      [tokenHash]
    );
    const token = tokenRes.rows[0] ?? null;
    if (!token) throw new Error("legal_sign_token_invalid_or_expired");
    await setOperatingCompany(client, String(token.operating_company_id));
    return fn(client, token);
  });
}

export async function getPublicSigningDetails(
  rawToken: string,
  auditMeta: Pick<AuditMeta, "ipAddress" | "userAgent">
) {
  try {
    return await withValidToken(rawToken, async (client, token) => {
      const existingStatus = String(token.contract_status);
      if (existingStatus === "sent") {
        await client.query(
          `
            UPDATE legal.contract_instances
            SET status = 'viewed',
                viewed_at = COALESCE(viewed_at, now())
            WHERE id = $1
              AND operating_company_id = $2
          `,
          [token.contract_instance_id, token.operating_company_id]
        );
      }
      await appendContractAuditLog(client, {
        operatingCompanyId: String(token.operating_company_id),
        contractTemplateId: String(token.template_id),
        contractInstanceId: String(token.contract_instance_id),
        eventType: "contract_sign_page_viewed",
        eventPayload: {
          verification_channel: token.verification_channel,
        },
        ipAddress: auditMeta.ipAddress ?? null,
        userAgent: auditMeta.userAgent ?? null,
      });

      return {
        contract_instance_id: token.contract_instance_id,
        template_code: token.template_code,
        template_version: token.template_version,
        display_name_en: token.display_name_en,
        display_name_es: token.display_name_es,
        signer_name: token.signer_name,
        language: token.language,
        verification_channel: token.verification_channel,
        expires_at: token.expires_at,
        content_html_en: token.content_html_en,
        content_html_es: token.content_html_es,
        filled_variables: token.filled_variables,
        requires_code: String(token.verification_channel) !== "none",
      };
    });
  } catch (error) {
    if (String((error as Error).message) === "legal_sign_token_invalid_or_expired") return null;
    throw error;
  }
}

export async function startPublicSigningVerification(
  rawToken: string,
  payload: z.infer<typeof verifyStartSchema>,
  auditMeta: Pick<AuditMeta, "ipAddress" | "userAgent">
) {
  const input = verifyStartSchema.parse(payload);
  return withValidToken(rawToken, async (client, token) => {
    const verificationChannel = String(token.verification_channel);
    if (verificationChannel === "none") {
      return { ok: true, message: "verification_not_required" };
    }

    const code = randomSixDigitCode();
    const codeHash = normalizeCodeForHash(code);
    await client.query(
      `
        UPDATE legal.contract_signing_tokens
        SET verification_code_hash = $3,
            verification_code_expires_at = now() + interval '10 minutes'
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [token.id, token.operating_company_id, codeHash]
    );
    if (verificationChannel === "email") {
      const email = String(token.verification_target ?? token.signer_email ?? "");
      if (!email) throw new Error("legal_signer_email_required");
      await sendEmail({
        to: email,
        subject: "IH 35 contract verification code",
        html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
        text: `Verification code: ${code} (expires in 10 minutes)`,
        sender: "noreply",
        eventClass: "legal.contract.verify_code_sent",
      });
    } else {
      const phone = String(token.verification_target ?? token.signer_phone ?? "");
      if (!phone) throw new Error("legal_signer_phone_required");
      const requested = input.channel ?? "sms";
      const eventType = requested === "sms" ? "twilio.sms.send" : "twilio.sms.send";
      await enqueueOutboxEvent(client, eventType, {
        to: phone,
        body: `IH 35 verification code: ${code}. Expires in 10 minutes.`,
        source: "legal.contract.verify_code",
      });
    }

    await appendContractAuditLog(client, {
      operatingCompanyId: String(token.operating_company_id),
      contractTemplateId: String(token.template_id),
      contractInstanceId: String(token.contract_instance_id),
      eventType: "contract_sign_verification_started",
      eventPayload: {
        verification_channel: verificationChannel,
      },
      ipAddress: auditMeta.ipAddress ?? null,
      userAgent: auditMeta.userAgent ?? null,
    });

    return { ok: true };
  });
}

export async function confirmPublicSigningVerification(
  rawToken: string,
  payload: z.infer<typeof verifyConfirmSchema>,
  auditMeta: Pick<AuditMeta, "ipAddress" | "userAgent">
) {
  const input = verifyConfirmSchema.parse(payload);
  return withValidToken(rawToken, async (client, token) => {
    if (String(token.verification_channel) === "none") return { ok: true };
    if (!token.verification_code_hash || !token.verification_code_expires_at) throw new Error("legal_verification_code_not_started");
    const now = Date.now();
    const exp = new Date(String(token.verification_code_expires_at)).getTime();
    if (!Number.isFinite(exp) || exp <= now) throw new Error("legal_verification_code_expired");
    if (normalizeCodeForHash(input.code) !== String(token.verification_code_hash)) throw new Error("legal_verification_code_invalid");

    await client.query(
      `
        UPDATE legal.contract_signing_tokens
        SET verification_code_hash = NULL,
            verification_code_expires_at = NULL
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [token.id, token.operating_company_id]
    );
    await appendContractAuditLog(client, {
      operatingCompanyId: String(token.operating_company_id),
      contractTemplateId: String(token.template_id),
      contractInstanceId: String(token.contract_instance_id),
      eventType: "contract_sign_verification_confirmed",
      eventPayload: {
        verification_channel: token.verification_channel,
      },
      ipAddress: auditMeta.ipAddress ?? null,
      userAgent: auditMeta.userAgent ?? null,
    });
    return { ok: true };
  });
}

async function uploadSignedPdfToR2(
  operatingCompanyId: string,
  contractInstanceId: string,
  pdfBuffer: Buffer,
  contentType: string
) {
  if (!r2Client) throw new Error("r2_not_configured");
  const key = `${operatingCompanyId}/legal/contracts/${contractInstanceId}/${crypto.randomUUID()}.pdf`;
  await r2Client.send(
    new PutObjectCommand({
      Bucket: getR2BucketName(),
      Key: key,
      Body: pdfBuffer,
      ContentType: contentType,
    })
  );
  return key;
}

export async function completePublicSigning(
  rawToken: string,
  payload: z.infer<typeof signatureCompleteSchema>,
  auditMeta: Pick<AuditMeta, "ipAddress" | "userAgent">
) {
  const input = signatureCompleteSchema.parse(payload);
  return withValidToken(rawToken, async (client, token) => {
    if (!["sent", "viewed"].includes(String(token.contract_status))) throw new Error("legal_contract_not_signable");

    if (String(token.verification_channel) !== "none") {
      if (token.verification_code_hash) throw new Error("legal_verification_required_before_sign");
    }

    const signedAt = new Date().toISOString();
    const signatureRes = await client.query(
      `
        INSERT INTO legal.signatures (
          operating_company_id,
          contract_instance_id,
          signed_by_name,
          typed_signature,
          drawn_signature_svg,
          signer_language,
          signer_ip,
          signer_user_agent,
          verification_method,
          verification_reference,
          signed_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING id
      `,
      [
        token.operating_company_id,
        token.contract_instance_id,
        input.signed_by_name,
        input.typed_signature,
        input.drawn_signature_svg,
        input.signer_language,
        auditMeta.ipAddress ?? null,
        auditMeta.userAgent ?? null,
        token.verification_channel,
        token.verification_target ?? null,
        signedAt,
      ]
    );
    const signatureId = signatureRes.rows[0]?.id;

    const pdf = await renderSignedContractPdf({
      templateCode: String(token.template_code),
      templateVersion: Number(token.template_version),
      contractInstanceId: String(token.contract_instance_id),
      language: String(token.language) as "en" | "es" | "bilingual",
      signerName: input.signed_by_name,
      contentHtmlEn: String(token.content_html_en ?? ""),
      contentHtmlEs: String(token.content_html_es ?? ""),
      filledVariables:
        token.filled_variables && typeof token.filled_variables === "object" && !Array.isArray(token.filled_variables)
          ? (token.filled_variables as Record<string, unknown>)
          : {},
      signedAtIso: signedAt,
      typedSignature: input.typed_signature,
      drawnSignatureSvg: input.drawn_signature_svg,
      ipAddress: auditMeta.ipAddress ?? null,
      userAgent: auditMeta.userAgent ?? null,
    });
    const r2ObjectKey = await uploadSignedPdfToR2(
      String(token.operating_company_id),
      String(token.contract_instance_id),
      pdf.pdfBuffer,
      pdf.mimeType
    );

    const attachmentInsert = await client.query(
      `
        INSERT INTO documents.attachments (
          operating_company_id,
          entity_type,
          entity_id,
          category,
          filename,
          content_type,
          size_bytes,
          sha256_hash,
          r2_object_key,
          r2_bucket,
          uploaded_by_user_id,
          notes
        )
        VALUES ($1,'manual',$2,'legal_doc',$3,$4,$5,$6,$7,$8,$9,$10)
        RETURNING id
      `,
      [
        token.operating_company_id,
        token.contract_instance_id,
        pdf.filename,
        pdf.mimeType,
        pdf.pdfBuffer.length,
        pdf.sha256,
        r2ObjectKey,
        getR2BucketName(),
        token.created_by_user_id,
        "legal_signed_pdf",
      ]
    );
    const signedAttachmentId = attachmentInsert.rows[0]?.id;

    await client.query(
      `
        UPDATE legal.contract_instances
        SET status = 'signed_electronically',
            signed_at = now(),
            signed_pdf_attachment_id = $3,
            updated_by_user_id = created_by_user_id
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [token.contract_instance_id, token.operating_company_id, signedAttachmentId]
    );
    await client.query(
      `
        UPDATE legal.contract_signing_tokens
        SET consumed_at = now(),
            consumed_ip = $3,
            consumed_user_agent = $4
        WHERE id = $1
          AND operating_company_id = $2
      `,
      [token.id, token.operating_company_id, auditMeta.ipAddress ?? null, auditMeta.userAgent ?? null]
    );

    await appendContractAuditLog(client, {
      operatingCompanyId: String(token.operating_company_id),
      contractTemplateId: String(token.template_id),
      contractInstanceId: String(token.contract_instance_id),
      eventType: "contract_signed_electronically",
      eventPayload: {
        signature_id: signatureId,
        signed_pdf_attachment_id: signedAttachmentId,
        sha256: pdf.sha256,
      },
      actorName: input.signed_by_name,
      ipAddress: auditMeta.ipAddress ?? null,
      userAgent: auditMeta.userAgent ?? null,
    });
    return {
      ok: true,
      contract_instance_id: token.contract_instance_id,
      signature_id: signatureId,
      signed_pdf_attachment_id: signedAttachmentId,
    };
  });
}

export async function getContractInstanceDetail(
  client: QueryableClient,
  args: { operatingCompanyId: string; contractInstanceId: string }
) {
  const instanceRes = await client.query(
    `
      SELECT ci.*, ct.display_name_en, ct.display_name_es
      FROM legal.contract_instances ci
      LEFT JOIN legal.contract_templates ct
        ON ct.id = ci.template_id
      WHERE ci.operating_company_id = $1
        AND ci.id = $2
      LIMIT 1
    `,
    [args.operatingCompanyId, args.contractInstanceId]
  );
  const instance = instanceRes.rows[0] ?? null;
  if (!instance) return null;
  const signatures = await client.query(
    `
      SELECT id, signed_by_name, typed_signature, signer_language, signer_ip, signed_at
      FROM legal.signatures
      WHERE operating_company_id = $1
        AND contract_instance_id = $2
      ORDER BY signed_at DESC
    `,
    [args.operatingCompanyId, args.contractInstanceId]
  );
  const audit = await client.query(
    `
      SELECT id, event_type, event_payload, actor_user_id, actor_name, ip_address, user_agent, created_at
      FROM legal.contract_audit_log
      WHERE operating_company_id = $1
        AND contract_instance_id = $2
      ORDER BY id DESC
      LIMIT 300
    `,
    [args.operatingCompanyId, args.contractInstanceId]
  );
  return { ...instance, signatures: signatures.rows, audit_log: audit.rows };
}

export const contractSchemas = {
  contractCreateSchema,
  tokenSendSchema,
  signatureCompleteSchema,
  verifyStartSchema,
  verifyConfirmSchema,
};
