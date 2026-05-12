import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { generateExcelReport } from "./forensic-report.service.js";
import { runForensicImportDeduped, startImportBatch } from "./forensic-import.service.js";
import { auditBatchEvent } from "./forensic-audit.service.js";
import { qboCompanyContext, qboQuery } from "./qbo-client.js";

const startBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  since_date: z.string().date().optional().default("2015-01-01"),
});

const batchParamsSchema = z.object({
  batchId: z.string().uuid(),
});

const batchQuerySchema = z.object({
  operating_company_id: z.string().uuid().optional(),
});

const anomalyParamsSchema = z.object({
  id: z.string().uuid(),
});

const anomalyReviewSchema = z.object({
  review_status: z.enum(["pending", "cleared", "confirmed_issue", "requires_legal"]),
  review_notes: z.string().trim().max(2000).optional().default(""),
});

const auditLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional().default(100),
  before: z.string().datetime().optional(),
});

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerQboForensicAdminRoutes(app: FastifyInstance) {
  async function getBatchById(
    req: FastifyRequest,
    reply: FastifyReply,
    paramsRaw: unknown,
    queryRaw: unknown
  ) {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = batchParamsSchema.safeParse(paramsRaw ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = batchQuerySchema.safeParse(queryRaw ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const row = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM qbo_archive.import_batches
          WHERE id = $1
            AND ($2::uuid IS NULL OR operating_company_id = $2)
          LIMIT 1
        `,
        [params.data.batchId, query.data.operating_company_id ?? null]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "batch_not_found" });
    return row;
  }

  app.post("/api/v1/admin/qbo-forensic/start-import", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const body = startBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const duplicateCheck = await withLuciaBypass(async (client) => {
      const active = await client.query<{ id: string }>(
        `
          SELECT id
          FROM qbo_archive.import_batches
          WHERE operating_company_id = $1
            AND status = 'in_progress'
            AND last_heartbeat_at > now() - interval '15 minutes'
          ORDER BY started_at DESC
          LIMIT 1
        `,
        [body.data.operating_company_id]
      );

      const stale = await client.query<{ id: string }>(
        `
          SELECT id
          FROM qbo_archive.import_batches
          WHERE operating_company_id = $1
            AND status = 'in_progress'
            AND (last_heartbeat_at IS NULL OR last_heartbeat_at <= now() - interval '15 minutes')
        `,
        [body.data.operating_company_id]
      );

      return { activeId: active.rows[0]?.id ?? null, staleIds: stale.rows.map((row) => row.id) };
    });

    if (duplicateCheck.activeId) {
      return reply.code(409).send({
        error: "already_running",
        message: "A forensic import is already running for this company. Wait for it to complete or fail before starting another.",
        existing_batch_id: duplicateCheck.activeId,
      });
    }

    if (duplicateCheck.staleIds.length > 0) {
      await withLuciaBypass(async (client) => {
        await client.query(
          `
            UPDATE qbo_archive.import_batches
            SET status = 'failed',
                completed_at = now(),
                errors_count = errors_count + 1,
                last_error_message = COALESCE(last_error_message, '') || ' [auto-failed on start-import: stale heartbeat > 15min]',
                updated_at = now()
            WHERE id = ANY($1::uuid[])
          `,
          [duplicateCheck.staleIds]
        );
      });
      for (const staleId of duplicateCheck.staleIds) {
        await auditBatchEvent(staleId, body.data.operating_company_id, "batch_auto_failed_stale", {
          error_message: "auto-failed in start-import stale cleanup",
        });
      }
    }

    try {
      const context = await qboCompanyContext(body.data.operating_company_id);
      await qboQuery(context, "SELECT * FROM CompanyInfo");
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
          "qbo_archive.batch.preflight_passed",
          "info",
          JSON.stringify({ operating_company_id: body.data.operating_company_id }),
          user.uuid,
          "P6-FOUNDATION-OPS",
        ]);
      });
    } catch (error) {
      const detail = String((error as Error)?.message ?? "qbo_preflight_failed").slice(0, 200);
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
          "qbo_archive.batch.preflight_failed",
          "warning",
          JSON.stringify({ operating_company_id: body.data.operating_company_id, technical_detail: detail }),
          user.uuid,
          "P6-FOUNDATION-OPS",
        ]);
      });
      return reply.code(503).send({
        error: "qbo_unreachable",
        message: "QBO connection failed for this company. Please re-authorize before starting an import.",
        technical_detail: detail,
      });
    }

    try {
      const batch = await startImportBatch(user.uuid, body.data.operating_company_id, body.data.since_date);
      await auditBatchEvent(batch.batchId, body.data.operating_company_id, "preflight_qbo_check_passed");

      const attachmentsSinceDate = process.env.QBO_FORENSIC_ATTACHMENTS_SINCE_DATE ?? "2021-01-01";
      void runForensicImportDeduped(user.uuid, {
        batchId: batch.batchId,
        operatingCompanyId: body.data.operating_company_id,
        sinceDate: body.data.since_date,
        attachmentsSinceDate,
      }).catch((error) => {
        app.log.error({ err: error, batchId: batch.batchId }, "forensic import failed after start-import");
      });

      return { batch_id: batch.batchId };
    } catch (error) {
      const message = String((error as Error)?.message ?? "unable_to_start_import");
      if (message.includes("QBO not authorized")) {
        return reply.code(400).send({ error: "qbo_not_authorized", message });
      }
      await withLuciaBypass(async (client) => {
        await client.query(`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)`, [
          "qbo_archive.batch.preflight_failed",
          "warning",
          JSON.stringify({ operating_company_id: body.data.operating_company_id, technical_detail: message.slice(0, 200) }),
          user.uuid,
          "P6-FOUNDATION-OPS",
        ]);
      });
      throw error;
    }
  });

  app.get("/api/v1/admin/qbo-forensic/batch/:batchId", async (req, reply) => {
    return getBatchById(req, reply, req.params, req.query);
  });

  app.get("/api/v1/admin/qbo-forensic/batches/:batchId", async (req, reply) => {
    return getBatchById(req, reply, req.params, req.query);
  });

  app.get("/api/v1/admin/qbo-forensic/batches", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const query = batchQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM qbo_archive.import_batches
          WHERE ($1::uuid IS NULL OR operating_company_id = $1)
          ORDER BY started_at DESC
          LIMIT 200
        `,
        [query.data.operating_company_id ?? null]
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

  app.get("/api/v1/admin/qbo-forensic/batches/:batchId/audit-log", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = batchParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = auditLogQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM qbo_archive.import_batch_audit_log
          WHERE batch_id = $1
            AND ($2::timestamptz IS NULL OR occurred_at < $2::timestamptz)
          ORDER BY occurred_at DESC
          LIMIT $3
        `,
        [params.data.batchId, query.data.before ?? null, query.data.limit]
      );
      return res.rows;
    });

    return { rows };
  });
}

