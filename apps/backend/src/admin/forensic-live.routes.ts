import type { FastifyInstance } from "fastify";
import { requireAuth } from "../auth/session-middleware.js";
import { withLuciaBypass } from "../auth/db.js";
import { getForensicProgress } from "../integrations/qbo/forensic-progress.store.js";

export async function registerForensicLiveRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/qbo-forensic/batches/:id/live", async (req, reply) => {
    if (!requireAuth(req, reply)) return;
    const user = req.user as { role?: string } | undefined;
    if (user?.role !== "Owner") return reply.code(403).send({ error: "forbidden" });

    const params = req.params as { id?: string };
    const batchId = params?.id;
    if (!batchId) return reply.code(400).send({ error: "validation_error", message: "batch id required" });

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");
    reply.raw.flushHeaders?.();

    const writeEvent = async () => {
      const batch = await withLuciaBypass(async (client) => {
        const res = await client.query<{
          id: string;
          status: string;
          entities_imported: number;
          transactions_imported: number;
          attachments_imported: number;
          errors_count: number;
          last_heartbeat_at: string | null;
        }>(
          `
            SELECT
              id,
              status,
              entities_imported,
              transactions_imported,
              attachments_imported,
              errors_count,
              last_heartbeat_at::text
            FROM qbo_archive.import_batches
            WHERE id = $1
            LIMIT 1
          `,
          [batchId]
        );
        return res.rows[0] ?? null;
      });

      if (!batch) {
        reply.raw.write(`data: ${JSON.stringify({ error: "batch_not_found", batch_id: batchId })}\n\n`);
        return false;
      }

      const progress = getForensicProgress(batchId);
      const heartbeatAgeSeconds = batch.last_heartbeat_at
        ? Math.max(0, Math.floor((Date.now() - new Date(batch.last_heartbeat_at).getTime()) / 1000))
        : null;

      reply.raw.write(
        `data: ${JSON.stringify({
          batch_id: batch.id,
          status: batch.status,
          entities_imported: batch.entities_imported,
          transactions_imported: batch.transactions_imported,
          attachments_imported: batch.attachments_imported,
          errors_count: batch.errors_count,
          last_heartbeat_at: batch.last_heartbeat_at,
          heartbeat_age_seconds: heartbeatAgeSeconds,
          current_phase: progress?.current_phase ?? null,
          current_entity_type: progress?.current_entity_type ?? null,
          current_page: progress?.current_page ?? null,
          current_total_pages: progress?.current_total_pages ?? null,
          recent_errors: progress?.recent_errors ?? [],
        })}\n\n`
      );

      return batch.status === "in_progress";
    };

    let closed = false;
    const interval = setInterval(async () => {
      if (closed) return;
      try {
        const keepOpen = await writeEvent();
        if (!keepOpen) {
          clearInterval(interval);
          if (!closed) reply.raw.end();
          closed = true;
        }
      } catch {
        clearInterval(interval);
        if (!closed) reply.raw.end();
        closed = true;
      }
    }, 2000);

    req.raw.on("close", () => {
      closed = true;
      clearInterval(interval);
    });

    await writeEvent();
    return reply;
  });
}
