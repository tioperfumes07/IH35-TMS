import type { FastifyInstance, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { putObjectBytes, isR2Configured } from "../storage/r2-client.js";
import { requireDriverSession } from "./auth.js";

const binaryPart = z.object({
  content_base64: z.string().min(1),
  content_type: z.string().min(1).max(120),
});

const bodySchema = z.object({
  report_type: z.enum(["damage", "maintenance", "accident", "other"]),
  description: z.string().trim().min(1).max(8000),
  load_id: z.string().uuid().optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  photos: z.array(binaryPart).max(8).optional().default([]),
  voice_memo: binaryPart.optional().nullable(),
});

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

export async function registerDriverReportsRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/reports", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return reply.code(403).send({ error: "forbidden" });

    const parsed = bodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendValidationError(reply, parsed.error);

    const hasMedia = (parsed.data.photos?.length ?? 0) > 0 || Boolean(parsed.data.voice_memo?.content_base64?.length);
    if (hasMedia && !isR2Configured()) {
      return reply.code(503).send({ error: "r2_not_configured" });
    }

    try {
      const createdId = await withCurrentUser(user.uuid, async (client) => {
        const companyRes = await client.query<{ operating_company_id: string | null }>(
          `SELECT operating_company_id FROM mdata.drivers WHERE id = $1 LIMIT 1`,
          [driver.id]
        );
        const operatingCompanyId = companyRes.rows[0]?.operating_company_id ?? null;
        if (!operatingCompanyId) throw new Error("driver_company_missing");

        if (parsed.data.load_id) {
          const loadOk = await client.query(
            `
              SELECT 1 FROM mdata.loads
              WHERE id = $1
                AND operating_company_id = $2
                AND soft_deleted_at IS NULL
                AND (assigned_primary_driver_id = $3 OR assigned_secondary_driver_id = $3)
              LIMIT 1
            `,
            [parsed.data.load_id, operatingCompanyId, driver.id]
          );
          if (loadOk.rows.length === 0) throw new Error("load_not_owned");
        }

        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [operatingCompanyId]);

        const reportId = randomUUID();
        await client.query(
          `
            INSERT INTO maintenance.driver_reports (
              id, operating_company_id, driver_id, load_id, report_type, description,
              photo_r2_paths, voice_memo_r2_path, latitude, longitude
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          `,
          [
            reportId,
            operatingCompanyId,
            driver.id,
            parsed.data.load_id ?? null,
            parsed.data.report_type,
            parsed.data.description,
            [],
            null,
            parsed.data.latitude ?? null,
            parsed.data.longitude ?? null,
          ]
        );

        const photoPaths: string[] = [];
        let idx = 0;
        for (const photo of parsed.data.photos ?? []) {
          const buf = Buffer.from(photo.content_base64, "base64");
          if (buf.length > 12 * 1024 * 1024) throw new Error("photo_too_large");
          const ext =
            photo.content_type.includes("png") ? "png" : photo.content_type.includes("webp") ? "webp" : "jpg";
          const key = `org/${operatingCompanyId}/driver-reports/${reportId}/photo-${idx}.${ext}`;
          await putObjectBytes(key, buf, photo.content_type);
          photoPaths.push(key);
          idx += 1;
        }

        let voicePath: string | null = null;
        if (parsed.data.voice_memo) {
          const vb = Buffer.from(parsed.data.voice_memo.content_base64, "base64");
          if (vb.length > 20 * 1024 * 1024) throw new Error("voice_too_large");
          voicePath = `org/${operatingCompanyId}/driver-reports/${reportId}/voice.webm`;
          await putObjectBytes(voicePath, vb, parsed.data.voice_memo.content_type);
        }

        await client.query(
          `
            UPDATE maintenance.driver_reports
            SET photo_r2_paths = $2,
                voice_memo_r2_path = $3,
                updated_at = now()
            WHERE id = $1
          `,
          [reportId, photoPaths, voicePath]
        );

        return reportId;
      });

      return reply.code(201).send({ id: createdId });
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg === "driver_company_missing") return reply.code(404).send({ error: "driver_company_not_found" });
      if (msg === "load_not_owned") return reply.code(403).send({ error: "load_not_owned" });
      if (msg === "photo_too_large") return reply.code(413).send({ error: "photo_too_large" });
      if (msg === "voice_too_large") return reply.code(413).send({ error: "voice_too_large" });
      throw err;
    }
  });
}
