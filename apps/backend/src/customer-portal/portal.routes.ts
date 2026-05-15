import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";

function portalJwtSecret(): string {
  const s = process.env.PORTAL_JWT_SECRET?.trim();
  if (s) return s;
  if (process.env.NODE_ENV === "test") return "vitest-portal-jwt-secret";
  throw new Error("PORTAL_JWT_SECRET is required for customer portal");
}

function portalPublicOrigin(): string {
  return (process.env.PORTAL_PUBLIC_ORIGIN ?? "https://portal.ih35dispatch.com").replace(/\/$/, "");
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

type PortalClaims = { typ: "portal"; sub: string };

function signPortalSession(customerId: string): string {
  return jwt.sign({ typ: "portal", sub: customerId } satisfies PortalClaims, portalJwtSecret(), {
    algorithm: "HS256",
    expiresIn: "30d",
  });
}

function readPortalCustomerId(req: FastifyRequest): string | null {
  const raw = req.cookies?.ih35_portal;
  if (!raw) return null;
  try {
    const decoded = jwt.verify(raw, portalJwtSecret(), { algorithms: ["HS256"] }) as PortalClaims;
    if (decoded.typ !== "portal" || !decoded.sub) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}

const requestLinkSchema = z.object({
  email: z.string().email().transform((v) => v.toLowerCase()),
});

const verifySchema = z.object({
  token: z.string().uuid(),
});

export async function registerCustomerPortalRoutes(app: FastifyInstance) {
  app.post("/api/v1/portal/auth/request-link", async (req, reply) => {
    const body = requestLinkSchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const createdIp = (req.ip as string | undefined) || null;

    const row = await withLuciaBypass(async (client) => {
      const exists = await client.query(`SELECT to_regclass('portal.magic_link_tokens') IS NOT NULL AS ok`);
      if (!exists.rows[0]?.ok) return null;

      const cust = await client.query<{ id: string; operating_company_id: string; customer_name: string }>(
        `
          SELECT id, operating_company_id, customer_name
          FROM mdata.customers
          WHERE lower(coalesce(ar_email, '')) = $1
             OR lower(coalesce(main_contact_email, '')) = $1
             OR lower(coalesce(billing_email, '')) = $1
          LIMIT 1
        `,
        [body.data.email]
      );
      const c = cust.rows[0];
      if (!c) return { missing: true as const };

      const ins = await client.query<{ token: string }>(
        `
          INSERT INTO portal.magic_link_tokens (customer_id, email, expires_at, created_ip)
          VALUES ($1, $2, now() + interval '15 minutes', $3::inet)
          RETURNING token::text
        `,
        [c.id, body.data.email, createdIp]
      );
      const token = ins.rows[0]?.token;
      if (!token) return null;

      const link = `${portalPublicOrigin()}/login?token=${token}`;
      await enqueueEmail({
        operatingCompanyId: c.operating_company_id,
        toAddresses: [body.data.email],
        subject: "Your IH35 customer portal link",
        templateKey: "notification-dispatch",
        templateVars: {
          title: "Customer portal sign-in",
          bodyText: `Open this link to access your portal (expires in 15 minutes):\n\n${link}`,
        },
        queuedByUserId: null,
      });

      return { ok: true as const };
    });

    if (!row) return reply.code(503).send({ error: "portal_unavailable" });
    if ("missing" in row) return reply.code(202).send({ ok: true });
    return { ok: true };
  });

  app.post("/api/v1/portal/auth/verify", async (req, reply) => {
    const body = verifySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);

    const result = await withLuciaBypass(async (client) => {
      const res = await client.query<{ customer_id: string }>(
        `
          UPDATE portal.magic_link_tokens
          SET used_at = now()
          WHERE token = $1
            AND used_at IS NULL
            AND expires_at > now()
          RETURNING customer_id
        `,
        [body.data.token]
      );
      return res.rows[0] ?? null;
    });

    if (!result) return reply.code(400).send({ error: "invalid_or_expired_token" });

    const session = signPortalSession(result.customer_id);
    const sameSite = (process.env.PORTAL_COOKIE_SAMESITE as "lax" | "strict" | "none" | undefined) ?? "lax";
    const secure = sameSite === "none" || process.env.NODE_ENV === "production";
    reply.setCookie("ih35_portal", session, {
      path: "/",
      httpOnly: true,
      sameSite,
      secure,
      maxAge: 60 * 60 * 24 * 30,
    });
    return { ok: true };
  });

  app.get("/api/v1/portal/me", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });

    const row = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT id, customer_name, ar_email, main_contact_email, billing_email, operating_company_id
          FROM mdata.customers
          WHERE id = $1
          LIMIT 1
        `,
        [customerId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(401).send({ error: "unauthorized" });
    return { customer: row };
  });

  app.get("/api/v1/portal/invoices", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT id, display_id, issue_date AS invoice_date, total_cents, amount_open_cents, status
          FROM accounting.invoices
          WHERE customer_id = $1
            AND voided_at IS NULL
          ORDER BY invoice_date DESC, created_at DESC
          LIMIT $2 OFFSET $3
        `,
        [customerId, q.data.limit, q.data.offset]
      );
      return res.rows;
    });
    return { invoices: rows };
  });

  app.get("/api/v1/portal/invoices/:id", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const row = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM accounting.invoices
          WHERE id = $1 AND customer_id = $2 AND voided_at IS NULL
          LIMIT 1
        `,
        [params.data.id, customerId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });

  app.get("/api/v1/portal/invoices/:id/pdf", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const invoice = await withLuciaBypass(async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
          SELECT display_id, issue_date AS invoice_date, due_date, status, total_cents, amount_open_cents, currency_code
          FROM accounting.invoices
          WHERE id = $1 AND customer_id = $2 AND voided_at IS NULL
          LIMIT 1
        `,
        [params.data.id, customerId]
      );
      return res.rows[0] ?? null;
    });
    if (!invoice) return reply.code(404).send({ error: "not_found" });

    const puppeteer = (await import("puppeteer")).default;
    const displayId = String(invoice.display_id ?? params.data.id);
    const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Invoice ${displayId}</title></head><body style="font-family:system-ui;padding:24px;">
<h1>Invoice ${displayId}</h1>
<p>Date: ${String(invoice.invoice_date ?? "")} · Due: ${String(invoice.due_date ?? "")}</p>
<p>Status: ${String(invoice.status ?? "")}</p>
<p>Amount: ${(Number(invoice.total_cents ?? 0) / 100).toFixed(2)} ${String(invoice.currency_code ?? "USD")}</p>
<p>Open balance: ${(Number(invoice.amount_open_cents ?? 0) / 100).toFixed(2)} ${String(invoice.currency_code ?? "USD")}</p>
</body></html>`;

    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      const buf = await page.pdf({ format: "Letter", printBackground: true });
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `inline; filename="invoice-${displayId}.pdf"`);
      return reply.send(Buffer.from(buf));
    } finally {
      await browser.close();
    }
  });

  app.get("/api/v1/portal/loads", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25), offset: z.coerce.number().int().min(0).default(0) }).safeParse(req.query ?? {});
    if (!q.success) return sendValidationError(reply, q.error);

    const rows = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT id, load_number, status::text, updated_at,
            pickup_pod_photo_r2_key, delivery_pod_photo_r2_key
          FROM mdata.loads
          WHERE customer_id = $1
            AND soft_deleted_at IS NULL
            AND status::text IN ('delivered', 'invoiced', 'paid', 'closed')
          ORDER BY updated_at DESC
          LIMIT $2 OFFSET $3
        `,
        [customerId, q.data.limit, q.data.offset]
      );
      return res.rows;
    });
    return { loads: rows };
  });

  app.get("/api/v1/portal/loads/:id", async (req, reply) => {
    const customerId = readPortalCustomerId(req);
    if (!customerId) return reply.code(401).send({ error: "unauthorized" });
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);

    const row = await withLuciaBypass(async (client) => {
      const res = await client.query(
        `
          SELECT *
          FROM mdata.loads
          WHERE id = $1 AND customer_id = $2 AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [params.data.id, customerId]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    return row;
  });
}
