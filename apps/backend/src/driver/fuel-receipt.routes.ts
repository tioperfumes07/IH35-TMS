import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireDriverSession } from "./auth.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";

const loadIdParamsSchema = z.object({
  id: z.string().uuid(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverFuelReceiptRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/fuel/upload-receipt", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    let buffer: Buffer | null = null;
    let contentType = "image/jpeg";

    const parts = (req as { parts: () => AsyncIterableIterator<{ type: string; fieldname?: string; mimetype?: string; toBuffer: () => Promise<Buffer> }> }).parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "receipt") {
        buffer = await part.toBuffer();
        contentType = part.mimetype || contentType;
      }
    }
    if (!buffer?.length) return reply.code(400).send({ error: "receipt_file_required" });

    const day = new Date().toISOString().slice(0, 10);
    const key = `receipts/${driver.id}/${day}/${randomUUID()}.jpg`;

    await withCurrentUser(req.user!.uuid, async (client) => {
      await putObjectBytes(key, buffer!, contentType);
      await appendCrudAudit(
        client,
        req.user!.uuid,
        "driver.fuel_receipt_uploaded",
        { driver_id: driver.id, r2_key: key },
        "info",
        "P7-BLOCK-M"
      );
    });

    return { ok: true, r2_key: key };
  });

  app.post("/api/v1/driver/fuel/link-stub", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    if (!driver) return;
    const body = z.object({ load_id: z.string().uuid().optional(), notes: z.string().max(500).optional() }).safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    await withCurrentUser(req.user!.uuid, async (client) => {
      await appendCrudAudit(
        client,
        req.user!.uuid,
        "driver.fuel_receipt_stub",
        { driver_id: driver.id, ...body.data },
        "info",
        "P7-BLOCK-M"
      );
    });
    return { ok: true };
  });
}
