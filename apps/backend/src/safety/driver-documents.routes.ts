import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { putObjectBytes } from "../storage/r2-client.js";

const companyQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
});

const metadataSchema = z.object({
  driver_id: z.string().uuid(),
  doc_type: z.string().trim().min(1),
  effective_date: z.string().optional(),
  expiry_date: z.string().optional(),
  notes: z.string().optional(),
});

type Queryable = {
  query: <R = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: R[] }>;
};

function authUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function ensureR2Enabled() {
  const required = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET_NAME"];
  const missing = required.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    return { ok: false, missing };
  }
  return { ok: true, missing: [] };
}

async function withCompanyScope<T>(
  userId: string,
  operatingCompanyId: string,
  fn: (client: Queryable) => Promise<T>
) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client as Queryable);
  });
}

export async function registerSafetyDriverDocumentsRoutes(app: FastifyInstance) {
  app.post(
    "/api/v1/safety/driver-documents",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const user = authUser(req, reply);
    if (!user) return;

    const company = companyQuerySchema.safeParse(req.query ?? {});
    if (!company.success) return reply.code(400).send({ error: "validation_error", details: company.error.flatten() });

    const metadataParse = metadataSchema.safeParse(req.body ?? {});
    if (!metadataParse.success) {
      return reply.code(400).send({ error: "validation_error", details: metadataParse.error.flatten() });
    }

    const r2Gate = ensureR2Enabled();
    if (!r2Gate.ok) {
      return reply.code(503).send({
        error: "r2_not_configured",
        message: "R2 file upload is disabled until required environment variables are set.",
        missing_env: r2Gate.missing,
      });
    }

    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "file_required" });
    const fileBytes = await file.toBuffer();
    if (fileBytes.length === 0) return reply.code(400).send({ error: "file_empty" });

    const payload = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
      const driver = await client.query<{ id: string }>(
        `SELECT id::text
           FROM mdata.drivers
          WHERE operating_company_id = $1::uuid
            AND id = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1`,
        [company.data.operating_company_id, metadataParse.data.driver_id]
      );
      if (!driver.rows[0]?.id) return { kind: "driver_not_found" as const };

      const r2Key = `${company.data.operating_company_id}/safety/driver/${metadataParse.data.driver_id}/${Date.now()}-${file.filename}`;
      const insertRes = await client.query(
        `
          INSERT INTO safety.driver_documents (
            operating_company_id,
            driver_id,
            doc_type,
            file_name,
            r2_key,
            effective_date,
            expiry_date,
            notes
          )
          VALUES ($1, $2, $3, $4, $5, $6::date, $7::date, $8)
          RETURNING *
        `,
        [
          company.data.operating_company_id,
          metadataParse.data.driver_id,
          metadataParse.data.doc_type,
          file.filename,
          r2Key,
          metadataParse.data.effective_date ?? null,
          metadataParse.data.expiry_date ?? null,
          metadataParse.data.notes ?? null,
        ]
      );
      const document = insertRes.rows[0] as { id?: string } | undefined;
      if (!document?.id) throw new Error("safety_driver_document_insert_failed");
      await putObjectBytes(r2Key, fileBytes, file.mimetype || "application/octet-stream");
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.driver_document.uploaded",
        {
          resource_type: "safety.driver_documents",
          resource_id: document.id,
          operating_company_id: company.data.operating_company_id,
          driver_id: metadataParse.data.driver_id,
          r2_key: r2Key,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return { kind: "ok" as const, document };
    });

    if (payload.kind === "driver_not_found") return reply.code(404).send({ error: "driver_not_found" });
    return reply.code(201).send(payload.document);
    }
  );
}
