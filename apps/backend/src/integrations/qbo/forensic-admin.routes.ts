import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { generateExcelReport } from "./forensic-report.service.js";
import { startImportBatch } from "./forensic-import.service.js";

const startBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  since_date: z.string().date().optional().default("2015-01-01"),
});

const batchParamsSchema = z.object({
  batchId: z.string().uuid(),
});

const anomalyParamsSchema = z.object({
  id: z.string().uuid(),
});

const anomalyReviewSchema = z.object({
  review_status: z.enum(["pending", "cleared", "confirmed_issue", "requires_legal"]),
  review_notes: z.string().trim().max(2000).optional().default(""),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerQboForensicAdminRoutes(app: FastifyInstance) {
  app.post("/api/v1/admin/qbo-forensic/start-import", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const body = startBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    try {
      const batch = await startImportBatch(user.uuid, body.data.operating_company_id, body.data.since_date);
      return { batch_id: batch.batchId };
    } catch (error) {
      const message = String((error as Error)?.message ?? "unable_to_start_import");
      if (message.includes("QBO not authorized")) {
        return reply.code(400).send({ error: "qbo_not_authorized", message });
      }
      throw error;
    }
  });

  app.get("/api/v1/admin/qbo-forensic/batch/:batchId", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = batchParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const row = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM qbo_archive.import_batches
          WHERE id = $1
          LIMIT 1
        `,
        [params.data.batchId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "batch_not_found" });
    return row;
  });

  app.get("/api/v1/admin/qbo-forensic/batches", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM qbo_archive.import_batches
          ORDER BY started_at DESC
          LIMIT 200
        `
      );
      return res.rows;
    });
    return { batches: rows };
  });

  app.post("/api/v1/admin/qbo-forensic/batch/:batchId/generate-report", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = batchParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });

    const report = await generateExcelReport(user.uuid, params.data.batchId);
    return { r2_url: report.r2_key, filename: report.filename };
  });

  app.get("/api/v1/admin/qbo-forensic/anomalies", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT fa.*, ts.txn_date, ts.qbo_txn_type, ts.qbo_txn_id, ts.total_cents, ts.forensic_flags
          FROM qbo_archive.forensic_anomalies fa
          LEFT JOIN qbo_archive.transactions_snapshot ts ON ts.id = fa.txn_snapshot_id
          ORDER BY fa.detected_at DESC
          LIMIT 500
        `
      );
      return res.rows;
    });
    return { anomalies: rows };
  });

  app.post("/api/v1/admin/qbo-forensic/anomaly/:id/review", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = anomalyParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = anomalyReviewSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const updated = await withCurrentUser(user.uuid, async (client) => {
      const res = await client.query<{ id: string; operating_company_id: string }>(
        `
          UPDATE qbo_archive.forensic_anomalies
          SET
            review_status = $2,
            review_notes = $3,
            reviewed_by_user_id = $4,
            reviewed_at = now()
          WHERE id = $1
          RETURNING id, operating_company_id
        `,
        [params.data.id, body.data.review_status, body.data.review_notes || null, user.uuid]
      );
      const row = res.rows[0];
      if (!row) return null;
      await appendCrudAudit(
        client,
        user.uuid,
        "forensic.anomaly.reviewed",
        {
          anomaly_id: row.id,
          operating_company_id: row.operating_company_id,
          review_status: body.data.review_status,
          review_notes: body.data.review_notes || null,
        },
        "info",
        "P5-T6-QBO-FORENSIC"
      );
      return row;
    });

    if (!updated) return reply.code(404).send({ error: "anomaly_not_found" });
    return { ok: true, id: updated.id };
  });
}

