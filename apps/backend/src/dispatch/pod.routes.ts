import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "../accounting/shared.js";
import { requireDriverSession } from "../driver/auth.js";
import { withCurrentUser } from "../auth/db.js";
import { generatePresignedDownloadUrl, isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { fetchBolPayload, generateAndStoreBol, generateBolPdf } from "./bol-generator.service.js";

const loadParamsSchema = z.object({ loadId: z.string().uuid() });
const stopParamsSchema = z.object({ loadId: z.string().uuid(), stopId: z.string().uuid() });
const podIdParamsSchema = z.object({ id: z.string().uuid() });

const podListQuerySchema = companyQuerySchema.extend({
  load_id: z.string().uuid().optional(),
  status: z.enum(["pending_review", "approved", "rejected"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

const podCaptureBodySchema = z.object({
  photo_base64: z.string().min(32).optional(),
  signature_base64: z.string().min(32),
  recipient_name: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const podReviewBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
  review_notes: z.string().trim().max(2000).optional(),
});

const companyBodySchema = z.object({
  operating_company_id: z.string().uuid(),
});

function officeDispatchRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Dispatcher"].includes(role);
}

function decodeDataUrl(dataUrl: string): { buffer: Buffer; contentType: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (match) {
    return { contentType: match[1], buffer: Buffer.from(match[2], "base64") };
  }
  if (/^[A-Za-z0-9+/=]+$/.test(dataUrl.trim())) {
    return { contentType: "image/png", buffer: Buffer.from(dataUrl.trim(), "base64") };
  }
  return null;
}

export function isDeliveryStop(stopType: string | null | undefined): boolean {
  return (stopType ?? "").toLowerCase() === "delivery";
}

export function canReviewPod(status: string): boolean {
  return status === "pending_review";
}

export async function uploadPodAsset(
  operatingCompanyId: string,
  loadId: string,
  stopId: string,
  kind: "photo" | "signature",
  dataUrl: string
): Promise<string> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded || decoded.buffer.length < 32) throw new Error("invalid_image");
  if (decoded.buffer.length > 8 * 1024 * 1024) throw new Error("image_too_large");
  const ext = decoded.contentType.includes("jpeg") ? "jpg" : "png";
  const r2Key = `dispatch/pod/${operatingCompanyId}/${loadId}/${stopId}/${kind}-${randomUUID()}.${ext}`;
  await putObjectBytes(r2Key, decoded.buffer, decoded.contentType);
  return r2Key;
}

export async function registerDispatchPodBolRoutes(app: FastifyInstance) {
  app.post("/api/v1/driver/loads/:loadId/stops/:stopId/pod", async (req, reply) => {
    if (!(await requireDriverSession(req, reply))) return;
    const params = stopParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const body = podCaptureBodySchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });
    const driver = req.driver;
    const user = req.user;
    if (!driver || !user) return;

    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    try {
      const created = await withCurrentUser(user.uuid, async (client) => {
        const stopRes = await client.query<{
          id: string;
          stop_type: string;
          operating_company_id: string;
        }>(
          `
            SELECT s.id, s.stop_type::text, l.operating_company_id::text
            FROM mdata.load_stops s
            JOIN mdata.loads l ON l.id = s.load_id
            WHERE s.id = $1::uuid
              AND s.load_id = $2::uuid
              AND (l.assigned_primary_driver_id = $3::uuid OR l.assigned_secondary_driver_id = $3::uuid)
              AND l.soft_deleted_at IS NULL
            LIMIT 1
          `,
          [params.data.stopId, params.data.loadId, driver.id]
        );
        const stop = stopRes.rows[0];
        if (!stop) return { error: "forbidden" as const };
        if (!isDeliveryStop(stop.stop_type)) return { error: "delivery_stop_required" as const };

        await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [stop.operating_company_id]);

        const photoKey = body.data.photo_base64
          ? await uploadPodAsset(stop.operating_company_id, params.data.loadId, params.data.stopId, "photo", body.data.photo_base64)
          : null;
        const signatureKey = await uploadPodAsset(
          stop.operating_company_id,
          params.data.loadId,
          params.data.stopId,
          "signature",
          body.data.signature_base64
        );

        const insertRes = await client.query(
          `
            INSERT INTO dispatch.pod_documents (
              operating_company_id, load_id, stop_id, driver_id,
              photo_r2_key, signature_r2_key, recipient_name, notes, status
            )
            VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, $6, $7, $8, 'pending_review')
            RETURNING id::text, status, created_at::text
          `,
          [
            stop.operating_company_id,
            params.data.loadId,
            params.data.stopId,
            driver.id,
            photoKey,
            signatureKey,
            body.data.recipient_name ?? null,
            body.data.notes ?? null,
          ]
        );

        await appendCrudAudit(client, user.uuid, "dispatch.pod.captured", {
          pod_id: insertRes.rows[0].id,
          load_id: params.data.loadId,
          stop_id: params.data.stopId,
        });

        return { pod: insertRes.rows[0] };
      });

      if ("error" in created) {
        if (created.error === "delivery_stop_required") return reply.code(400).send({ error: "delivery_stop_required" });
        return reply.code(403).send({ error: "forbidden" });
      }
      return reply.code(201).send(created);
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg === "invalid_image") return reply.code(400).send({ error: "invalid_image" });
      if (msg === "image_too_large") return reply.code(413).send({ error: "image_too_large" });
      if (msg.includes("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      throw err;
    }
  });

  app.get("/api/v1/dispatch/pod-documents", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const query = podListQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const filters = ["p.archived_at IS NULL", "p.operating_company_id = $1::uuid"];
      if (query.data.load_id) {
        values.push(query.data.load_id);
        filters.push(`p.load_id = $${values.length}::uuid`);
      }
      if (query.data.status) {
        values.push(query.data.status);
        filters.push(`p.status = $${values.length}`);
      }
      const limit = query.data.limit ?? 100;
      values.push(limit);
      const res = await client.query(
        `
          SELECT
            p.id::text,
            p.load_id::text,
            l.load_number,
            p.stop_id::text,
            p.driver_id::text,
            concat_ws(' ', d.first_name, d.last_name) AS driver_name,
            p.photo_r2_key,
            p.signature_r2_key,
            p.recipient_name,
            p.notes,
            p.status,
            p.reviewed_at::text,
            p.review_notes,
            p.created_at::text
          FROM dispatch.pod_documents p
          JOIN mdata.loads l ON l.id = p.load_id
          LEFT JOIN mdata.drivers d ON d.id = p.driver_id
          WHERE ${filters.join(" AND ")}
          ORDER BY p.created_at DESC
          LIMIT $${values.length}
        `,
        values
      );
      return res.rows;
    });

    return { documents: rows, count: rows.length };
  });

  app.post("/api/v1/dispatch/pod-documents/:id/review", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = podIdParamsSchema.safeParse(req.params ?? {});
    const body = podReviewBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });

    const updated = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
      const existing = await client.query(
        `
          SELECT id::text, status
          FROM dispatch.pod_documents
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND archived_at IS NULL
          LIMIT 1
        `,
        [params.data.id, body.data.operating_company_id]
      );
      const row = existing.rows[0];
      if (!row) return null;
      if (!canReviewPod(row.status)) return { error: "invalid_status" as const };

      const res = await client.query(
        `
          UPDATE dispatch.pod_documents
          SET status = $3,
              reviewed_by_user_id = $4::uuid,
              reviewed_at = now(),
              review_notes = $5,
              updated_at = now()
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
          RETURNING id::text, status, reviewed_at::text, review_notes
        `,
        [params.data.id, body.data.operating_company_id, body.data.status, user.uuid, body.data.review_notes ?? null]
      );
      await appendCrudAudit(client, user.uuid, "dispatch.pod.reviewed", {
        pod_id: params.data.id,
        status: body.data.status,
      });
      return { pod: res.rows[0] };
    });

    if (!updated) return reply.code(404).send({ error: "pod_not_found" });
    if ("error" in updated) return reply.code(409).send({ error: updated.error });
    return updated;
  });

  app.get("/api/v1/dispatch/loads/:loadId/pod-bol", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const summary = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const pods = await client.query(
        `
          SELECT id::text, stop_id::text, status, recipient_name, created_at::text, photo_r2_key, signature_r2_key
          FROM dispatch.pod_documents
          WHERE load_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND archived_at IS NULL
          ORDER BY created_at DESC
        `,
        [params.data.loadId, query.data.operating_company_id]
      );
      const bols = await client.query(
        `
          SELECT id::text, pdf_r2_key, sha256, generated_at::text, template_version
          FROM dispatch.bol_documents
          WHERE load_id = $1::uuid
            AND operating_company_id = $2::uuid
            AND archived_at IS NULL
          ORDER BY generated_at DESC
        `,
        [params.data.loadId, query.data.operating_company_id]
      );
      return { pods: pods.rows, bols: bols.rows };
    });

    return summary;
  });

  app.post("/api/v1/dispatch/loads/:loadId/bol/generate", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const body = companyBodySchema.safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    try {
      const result = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) =>
        generateAndStoreBol(client, body.data.operating_company_id, params.data.loadId, user.uuid)
      );
      if (!result) return reply.code(404).send({ error: "load_not_found" });
      return reply.code(201).send({ bol: result });
    } catch (err) {
      const msg = String((err as Error).message ?? "");
      if (msg.includes("r2_not_configured")) return reply.code(503).send({ error: "r2_not_configured" });
      throw err;
    }
  });

  app.get("/api/v1/dispatch/loads/:loadId/bol.pdf", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = loadParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const payload = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) =>
      fetchBolPayload(client, query.data.operating_company_id, params.data.loadId)
    );
    if (!payload) return reply.code(404).send({ error: "load_not_found" });

    const rendered = await generateBolPdf(payload);
    reply.header("Content-Type", "application/pdf");
    reply.header("Content-Disposition", `attachment; filename="${rendered.filename}"`);
    return reply.send(rendered.pdfBuffer);
  });

  app.get("/api/v1/dispatch/pod-documents/:id/download/:asset", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z
      .object({ id: z.string().uuid(), asset: z.enum(["photo", "signature"]) })
      .safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const signed = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT photo_r2_key, signature_r2_key
          FROM dispatch.pod_documents
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND archived_at IS NULL
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return null;
      const key = params.data.asset === "photo" ? row.photo_r2_key : row.signature_r2_key;
      if (!key) return undefined;
      const url = await generatePresignedDownloadUrl(key, 900);
      return { download_url: url.url, expires_in_seconds: 900 };
    });

    if (signed === null) return reply.code(404).send({ error: "pod_not_found" });
    if (!signed) return reply.code(404).send({ error: "asset_not_found" });
    return signed;
  });

  app.get("/api/v1/dispatch/bol-documents/:id/download", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!officeDispatchRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = podIdParamsSchema.safeParse(req.params ?? {});
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!params.success || !query.success) return reply.code(400).send({ error: "validation_error" });

    const signed = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT pdf_r2_key
          FROM dispatch.bol_documents
          WHERE id = $1::uuid
            AND operating_company_id = $2::uuid
            AND archived_at IS NULL
          LIMIT 1
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const row = res.rows[0];
      if (!row) return null;
      const url = await generatePresignedDownloadUrl(row.pdf_r2_key, 900);
      return { download_url: url.url, expires_in_seconds: 900 };
    });

    if (signed === null) return reply.code(404).send({ error: "bol_not_found" });
    return signed;
  });
}
