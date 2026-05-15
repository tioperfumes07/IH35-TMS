import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { isR2Configured, putObjectBytes } from "../storage/r2-client.js";
import { encryptOptionalPlaintext, decryptOptionalCiphertext } from "../lib/field-crypto.js";

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function writeRoles(role: string) {
  return ["Owner", "Administrator", "Manager", "Accountant"].includes(role);
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function readVendorCompany(
  client: { query: (sql: string, values: unknown[]) => Promise<{ rows: { operating_company_id?: unknown }[] }> },
  vendorId: string
) {
  const res = await client.query(`SELECT operating_company_id FROM mdata.vendors WHERE id = $1 LIMIT 1`, [vendorId]);
  const row = res.rows[0];
  return typeof row?.operating_company_id === "string" ? row.operating_company_id : null;
}

export async function registerVendorComplianceRoutes(app: FastifyInstance) {
  app.get("/api/v1/vendors/:id/ap-summary", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const q = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const summary = await withCurrentUser(user.uuid, async (client) => {
      const vendorOc = await readVendorCompany(client, params.data.id);
      if (!vendorOc || vendorOc !== q.data.operating_company_id) return null;

      const openRes = await client.query<{ c: string }>(
        `
          SELECT COALESCE(SUM(b.amount_cents - b.paid_cents), 0)::text AS c
          FROM accounting.bills b
          WHERE b.vendor_id = $1
            AND b.operating_company_id = $2
            AND b.revoked_at IS NULL
            AND b.status NOT IN ('paid', 'void', 'voided')
        `,
        [params.data.id, q.data.operating_company_id]
      );
      const paidRes = await client.query<{ c: string; last: string | null }>(
        `
          SELECT
            COUNT(*)::text AS c,
            MAX(bp.payment_date)::text AS last
          FROM accounting.bill_payments bp
          JOIN accounting.bills b ON b.id = bp.bill_id
          WHERE b.vendor_id = $1
            AND b.operating_company_id = $2
        `,
        [params.data.id, q.data.operating_company_id]
      );
      return {
        ap_open_cents: Number(openRes.rows[0]?.c ?? 0),
        bills_paid_count: Number(paidRes.rows[0]?.c ?? 0),
        last_payment_date: paidRes.rows[0]?.last ?? null,
      };
    });

    if (!summary) return reply.code(404).send({ error: "not_found" });
    return summary;
  });

  app.get("/api/v1/vendors/:id/coi", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const row = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('mdata.vendor_extensions') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;
      const res = await client.query(
        `SELECT coi_pdf_r2_key, coi_expires_on, net_terms_days, default_payment_method FROM mdata.vendor_extensions WHERE vendor_id = $1 LIMIT 1`,
        [params.data.id]
      );
      return res.rows[0] ?? null;
    });
    return row ?? { coi_pdf_r2_key: null, coi_expires_on: null, net_terms_days: null, default_payment_method: null };
  });

  app.post("/api/v1/vendors/:id/coi", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!writeRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    let buffer: Buffer | null = null;
    let contentType = "application/pdf";
    let expiresOn = "";

    const parts = (req as { parts: () => AsyncIterableIterator<{ type: string; fieldname?: string; mimetype?: string; value?: unknown; toBuffer: () => Promise<Buffer> }> }).parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        buffer = await part.toBuffer();
        contentType = part.mimetype || contentType;
      } else if (part.fieldname === "coi_expires_on") {
        expiresOn = String(part.value ?? "");
      }
    }
    if (!buffer?.length || !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) {
      return reply.code(400).send({ error: "file_and_expiry_required" });
    }

    const key = `vendors/${params.data.id}/coi/${randomUUID()}.pdf`;
    await putObjectBytes(key, buffer, contentType);

    await withCurrentUser(user.uuid, async (client) => {
      const oc = await readVendorCompany(client, params.data.id);
      if (!oc) return;
      await client.query(
        `
          INSERT INTO mdata.vendor_extensions (vendor_id, operating_company_id, coi_pdf_r2_key, coi_expires_on, updated_by_user_id)
          VALUES ($1, $2, $3, $4::date, $5)
          ON CONFLICT (vendor_id) DO UPDATE SET
            coi_pdf_r2_key = EXCLUDED.coi_pdf_r2_key,
            coi_expires_on = EXCLUDED.coi_expires_on,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = now()
        `,
        [params.data.id, oc, key, expiresOn, user.uuid]
      );
    });

    return { ok: true, coi_pdf_r2_key: key, coi_expires_on: expiresOn };
  });

  app.get("/api/v1/vendors/:id/w9", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const row = await withCurrentUser(user.uuid, async (client) => {
      const exists = await client.query(`SELECT to_regclass('mdata.vendor_extensions') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;
      const res = await client.query<{ w9_pdf_r2_key: string | null; w9_tax_id_ciphertext: string | null }>(
        `SELECT w9_pdf_r2_key, w9_tax_id_ciphertext FROM mdata.vendor_extensions WHERE vendor_id = $1 LIMIT 1`,
        [params.data.id]
      );
      const r = res.rows[0];
      if (!r) return { w9_pdf_r2_key: null, tax_id: null as string | null };
      return {
        w9_pdf_r2_key: r.w9_pdf_r2_key,
        tax_id: r.w9_tax_id_ciphertext ? decryptOptionalCiphertext(r.w9_tax_id_ciphertext) : null,
      };
    });
    return row ?? { w9_pdf_r2_key: null, tax_id: null };
  });

  app.post("/api/v1/vendors/:id/w9", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!writeRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    if (!isR2Configured()) return reply.code(503).send({ error: "r2_not_configured" });

    let buffer: Buffer | null = null;
    let contentType = "application/pdf";
    let taxId = "";

    const parts = (req as { parts: () => AsyncIterableIterator<{ type: string; fieldname?: string; mimetype?: string; value?: unknown; toBuffer: () => Promise<Buffer> }> }).parts();
    for await (const part of parts) {
      if (part.type === "file" && part.fieldname === "file") {
        buffer = await part.toBuffer();
        contentType = part.mimetype || contentType;
      } else if (part.fieldname === "tax_id") {
        taxId = String(part.value ?? "");
      }
    }
    if (!buffer?.length) return reply.code(400).send({ error: "file_required" });

    const key = `vendors/${params.data.id}/w9/${randomUUID()}.pdf`;
    await putObjectBytes(key, buffer, contentType);
    const enc = taxId ? encryptOptionalPlaintext(taxId) : null;

    await withCurrentUser(user.uuid, async (client) => {
      const oc = await readVendorCompany(client, params.data.id);
      if (!oc) return;
      await client.query(
        `
          INSERT INTO mdata.vendor_extensions (vendor_id, operating_company_id, w9_pdf_r2_key, w9_tax_id_ciphertext, updated_by_user_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (vendor_id) DO UPDATE SET
            w9_pdf_r2_key = EXCLUDED.w9_pdf_r2_key,
            w9_tax_id_ciphertext = COALESCE(EXCLUDED.w9_tax_id_ciphertext, mdata.vendor_extensions.w9_tax_id_ciphertext),
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = now()
        `,
        [params.data.id, oc, key, enc, user.uuid]
      );
    });

    return { ok: true, w9_pdf_r2_key: key };
  });

  const termsBodySchema = z.object({
    operating_company_id: z.string().uuid(),
    net_terms_days: z.number().int().min(0).max(180),
    default_payment_method: z.string().trim().max(120),
  });

  app.post("/api/v1/vendors/:id/payment-terms", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!writeRoles(user.role)) return reply.code(403).send({ error: "forbidden" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = termsBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    await withCurrentUser(user.uuid, async (client) => {
      const oc = await readVendorCompany(client, params.data.id);
      if (!oc || oc !== body.data.operating_company_id) return;
      await client.query(
        `
          INSERT INTO mdata.vendor_extensions (vendor_id, operating_company_id, net_terms_days, default_payment_method, updated_by_user_id)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (vendor_id) DO UPDATE SET
            net_terms_days = EXCLUDED.net_terms_days,
            default_payment_method = EXCLUDED.default_payment_method,
            updated_by_user_id = EXCLUDED.updated_by_user_id,
            updated_at = now()
        `,
        [params.data.id, oc, body.data.net_terms_days, body.data.default_payment_method, user.uuid]
      );
    });
    return { ok: true };
  });
}
