import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";

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
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${operatingCompanyId}'`);
    return fn(client as Queryable);
  });
}

export async function registerSafetyDriverDocumentsRoutes(app: FastifyInstance) {
  app.post("/api/v1/safety/driver-documents", async (req, reply) => {
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

    const payload = await withCompanyScope(user.uuid, company.data.operating_company_id, async (client) => {
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
      await appendCrudAudit(
        client,
        user.uuid,
        "safety.driver_document.uploaded",
        {
          resource_type: "safety.driver_documents",
          resource_id: (insertRes.rows[0] as { id?: string })?.id ?? null,
          operating_company_id: company.data.operating_company_id,
          driver_id: metadataParse.data.driver_id,
          r2_key: r2Key,
        },
        "info",
        "P7-SAFETY-DRIVER-PROFILES"
      );
      return insertRes.rows[0];
    });

    return reply.code(201).send(payload);
  });
}
