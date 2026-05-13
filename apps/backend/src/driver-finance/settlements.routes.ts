import crypto from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { requireAuth } from "../auth/session-middleware.js";
import { queuePaymentOnFinalize } from "./settlement-payment.service.js";
import { renderSettlementStatementPdf } from "./settlement-pdf-renderer.service.js";

const settlementStatusSchema = z.enum([
  "draft",
  "presettle",
  "acked",
  "locked",
  "paid",
  "held",
  "cancelled",
  "final",
  "ready",
  "approved",
  "open",
  "closed",
]);
const paymentStateSchema = z.enum(["unpaid", "queued", "sent_to_bank", "cleared", "bounced", "manual_paid"]);
const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  status: settlementStatusSchema.optional(),
  payment_state: paymentStateSchema.optional(),
});
const idParamsSchema = z.object({ id: z.string().uuid() });
const createBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  period_start: z.string(),
  period_end: z.string(),
  gross_pay: z.number().default(0),
  deductions_total: z.number().default(0),
  reimbursements_total: z.number().default(0),
  net_pay: z.number().default(0),
  lines: z.array(
    z.object({
      line_type: z.enum(["earnings", "extra_pay", "reimbursement", "deduction"]),
      description: z.string().trim().max(500),
      amount: z.number(),
    })
  ).default([]),
});

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function validationError(reply: FastifyReply, err: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: err.flatten() });
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SET LOCAL app.operating_company_id = '${companyId}'`);
    return fn(client);
  });
}

async function hasSettlementSchema(client: any) {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

async function recomputeDebtSync(client: any, driverId: string) {
  try {
    const res = await client.query(
      `
        SELECT *
        FROM driver_finance.recompute_driver_debt($1::uuid)
      `,
      [driverId]
    );
    return res.rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function registerDriverFinanceSettlementRoutes(app: FastifyInstance) {
  app.get("/api/v1/driver-finance/settlements", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const q = parsed.data;

    const payload = await withCompany(user.uuid, q.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { rows: [], total: 0 };
      const values: unknown[] = [q.operating_company_id];
      const where = ["s.operating_company_id = $1"];
      if (q.status) {
        values.push(q.status);
        where.push(`s.status = $${values.length}`);
      }
      if (q.payment_state) {
        values.push(q.payment_state);
        where.push(`COALESCE(s.payment_state, 'unpaid') = $${values.length}`);
      }
      const countRes = await client.query(`SELECT count(*)::int AS cnt FROM driver_finance.driver_settlements WHERE ${where.join(" AND ")}`, values);
      values.push(q.limit, q.offset);
      const rowsRes = await client.query(
        `
          SELECT
            v.*,
            COALESCE(s.payment_state, 'unpaid') AS payment_state,
            s.payment_queued_at,
            s.payment_sent_at,
            s.payment_cleared_at,
            s.payment_bank_reference,
            s.payment_bounced_reason,
            s.payment_method
          FROM views.driver_settlement_with_debt v
          JOIN driver_finance.driver_settlements s ON s.id = v.id
          WHERE ${where.join(" AND ")}
          ORDER BY v.period_start DESC
          LIMIT $${values.length - 1} OFFSET $${values.length}
        `,
        values
      );

      // List can show cached/quick debt summary approximation.
      const rows = await Promise.all(
        rowsRes.rows.map(async (row: any) => {
          const debt = await recomputeDebtSync(client, String(row.driver_id));
          return {
            ...row,
            live_debt_flag: debt?.total_active_debt == null ? null : Number(debt.total_active_debt),
            debt_computed_at: debt?.computed_at ?? null,
          };
        })
      );
      return { rows, total: Number((countRes.rows[0] as { cnt?: number } | undefined)?.cnt ?? 0) };
    });
    return { settlements: payload.rows, total_count: payload.total };
  });

  app.get("/api/v1/driver-finance/settlements/:id", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const detail = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const res = await client.query(
        `
          SELECT
            v.*,
            COALESCE(s.payment_state, 'unpaid') AS payment_state,
            s.payment_queued_at,
            s.payment_sent_at,
            s.payment_cleared_at,
            s.payment_bank_reference,
            s.payment_bounced_reason,
            s.payment_method
          FROM views.driver_settlement_with_debt v
          JOIN driver_finance.driver_settlements s ON s.id = v.id
          WHERE v.id = $1 AND s.operating_company_id = $2
          LIMIT 1
        `,
        [params.data.id, companyId]
      );
      const row = res.rows[0];
      if (!row) return null;
      const linesRes = await client.query(
        `SELECT * FROM driver_finance.settlement_lines WHERE settlement_id = $1 ORDER BY created_at ASC`,
        [params.data.id]
      );
      const debt = await recomputeDebtSync(client, String(row.driver_id));
      return {
        ...row,
        lines: linesRes.rows,
        debt_summary: debt,
      };
    });
    if (detail && "unavailable" in detail) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (!detail) return reply.code(404).send({ error: "settlement_not_found" });
    return detail;
  });

  app.get("/api/v1/driver-finance/settlements/:id/pdf", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    try {
      const result = await withCompany(user.uuid, companyId, async (client) =>
        renderSettlementStatementPdf(client, {
          operatingCompanyId: companyId,
          settlementId: params.data.id,
        })
      );
      reply.header("Content-Type", result.mimeType);
      reply.header("Content-Disposition", `inline; filename="${result.filename}"`);
      reply.header("X-Settlement-Pdf-Sha256", result.sha256);
      return reply.send(result.pdfBuffer);
    } catch (error) {
      const message = String((error as Error).message ?? "settlement_pdf_generation_failed");
      if (message === "settlement_not_found") return reply.code(404).send({ error: message });
      return reply.code(500).send({ error: "settlement_pdf_generation_failed" });
    }
  });

  app.post("/api/v1/driver-finance/settlements", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const parsed = createBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const created = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      const displayRes = await client.query(
        `SELECT driver_finance.next_settlement_display_id($1::uuid, $2::date) AS next_id`,
        [body.operating_company_id, body.period_start]
      );
      const displayId = (displayRes.rows[0] as { next_id?: string } | undefined)?.next_id ?? `S-${new Date(body.period_start).getFullYear()}-0001`;

      const settlementRes = await client.query(
        `
          INSERT INTO driver_finance.driver_settlements (
            operating_company_id, display_id, driver_id, period_start, period_end, status,
            gross_pay, deductions_total, reimbursements_total, net_pay
          )
          VALUES ($1,$2,$3,$4,$5,'presettle',$6,$7,$8,$9)
          RETURNING *
        `,
        [
          body.operating_company_id,
          displayId,
          body.driver_id,
          body.period_start,
          body.period_end,
          body.gross_pay,
          body.deductions_total,
          body.reimbursements_total,
          body.net_pay,
        ]
      );
      const settlement = settlementRes.rows[0];

      for (const line of body.lines) {
        await client.query(
          `
            INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
            VALUES ($1,$2,$3,$4)
          `,
          [settlement.id, line.line_type, line.description, line.amount]
        );
      }
      return settlement;
    });

    if ("unavailable" in created) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    return reply.code(201).send(created);
  });

  app.patch("/api/v1/driver-finance/settlements/:id/acknowledge", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const ifMatch = req.headers["if-match"];
    const etagToken = typeof ifMatch === "string" ? ifMatch.replaceAll('"', "") : null;

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT id, acknowledged_at, acknowledged_by_user_id, updated_at FROM driver_finance.driver_settlements WHERE id = $1 AND operating_company_id = $2 LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      const expectedEtag = crypto.createHash("sha1").update(String(current.updated_at ?? "")).digest("hex");
      if (etagToken && etagToken !== expectedEtag) return { conflict: true as const, expectedEtag };

      const updateRes = await client.query(
        `
          UPDATE driver_finance.driver_settlements
          SET acknowledged_at = now(), acknowledged_by_user_id = $2, status = CASE WHEN status = 'presettle' THEN 'acked' ELSE status END
          WHERE id = $1
          RETURNING *
        `,
        [params.data.id, user.uuid]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_acknowledged",
        {
          resource_type: "driver_finance.driver_settlements",
          resource_id: params.data.id,
        },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0], expectedEtag };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "settlement_not_found" });
    if ("conflict" in result) return reply.code(412).send({ error: "etag_conflict", expected_etag: result.expectedEtag });
    reply.header("ETag", `"${result.expectedEtag}"`);
    return result.row;
  });

  app.patch("/api/v1/driver-finance/settlements/:id/finalize", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const companyId = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };
      const currentRes = await client.query(
        `SELECT s.*, v.has_pending_acks FROM driver_finance.driver_settlements s JOIN views.driver_settlement_with_debt v ON v.id = s.id WHERE s.id = $1 AND s.operating_company_id = $2 LIMIT 1`,
        [params.data.id, companyId]
      );
      const current = currentRes.rows[0];
      if (!current) return { notFound: true as const };
      if (current.has_pending_acks) return { blocked: true as const, reason: "pending_acknowledgments" };
      if (!current.acknowledged_at) return { blocked: true as const, reason: "acknowledgment_required" };

      const debt = await recomputeDebtSync(client, String(current.driver_id));
      const computedAt = debt?.computed_at ? new Date(String(debt.computed_at)).getTime() : 0;
      if (computedAt && Date.now() - computedAt > 5000) return { blocked: true as const, reason: "debt_stale_refresh_required" };

      const updateRes = await client.query(
        `UPDATE driver_finance.driver_settlements SET status = 'locked', locked_at = now() WHERE id = $1 RETURNING *`,
        [params.data.id]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.settlement_finalized",
        { resource_type: "driver_finance.driver_settlements", resource_id: params.data.id },
        "info",
        "BT-3-DRIVER-FINANCE-REBUILD"
      );
      return { row: updateRes.rows[0] };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if ("notFound" in result) return reply.code(404).send({ error: "settlement_not_found" });
    if ("blocked" in result) return reply.code(409).send({ error: "finalize_blocked", reason: result.reason });

    void withLuciaBypass(async (client) => {
      const rowRes = await client.query(
        `
          SELECT
            s.id,
            s.display_id,
            s.operating_company_id,
            s.period_start,
            s.period_end,
            s.net_pay,
            d.email,
            d.first_name,
            d.last_name
          FROM driver_finance.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id
          WHERE s.id = $1
          LIMIT 1
        `,
        [params.data.id]
      );
      const row = rowRes.rows[0] as Record<string, unknown> | undefined;
      const email = row?.email ? String(row.email).trim() : "";
      if (!email || !row?.operating_company_id) return;

      const driverName =
        `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim() || "Driver";
      const settlementLabel = `${String(row.display_id ?? row.id)} (${String(row.period_start ?? "").slice(0, 10)} → ${String(
        row.period_end ?? ""
      ).slice(0, 10)})`;
      const amountLabel = row.net_pay != null ? `USD ${Number(row.net_pay).toFixed(2)}` : "";

      await enqueueEmail({
        operatingCompanyId: String(row.operating_company_id),
        toAddresses: [email],
        subject: `Settlement ready — ${String(row.display_id ?? "settlement")}`,
        templateKey: "settlement-ready",
        templateVars: {
          driverName,
          settlementLabel,
          amountLabel,
        },
        queuedByUserId: user.uuid,
      });
    }).catch(() => undefined);

    const queueResult = await queuePaymentOnFinalize(params.data.id, user.uuid).catch((error) => ({
      queued: false as const,
      reason: String((error as Error)?.message ?? "queue_payment_failed"),
    }));
    return { ...result.row, payment_auto_queue: queueResult };
  });
}
