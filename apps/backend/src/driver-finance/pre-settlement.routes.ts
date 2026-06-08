import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { enqueueEmail } from "../email/queue.service.js";
import { dispatchNotification, type NotificationEventType } from "../notifications/dispatcher.js";
import { requireAuth } from "../auth/session-middleware.js";
import { renderSettlementStatementPdf } from "./settlement-pdf-renderer.service.js";
import { appendSettlementLineFromDriverBillIfMissing, fetchTeamDriversForLoad } from "./settlement-engine.js";
import { aggregateSettlementTotals } from "./settlements-load-bookended.service.js";

const idParamsSchema = z.object({ id: z.string().uuid() });
const driverIdParamsSchema = z.object({ driverId: z.string().uuid() });
const addLoadBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  load_id: z.string().uuid(),
});
const settleBodySchema = z.object({
  operating_company_id: z.string().uuid(),
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
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [companyId]);
    return fn(client);
  });
}

async function hasSettlementSchema(client: any): Promise<boolean> {
  const res = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS ok`);
  return Boolean((res.rows[0] as { ok?: boolean } | undefined)?.ok);
}

export async function registerPreSettlementRoutes(app: FastifyInstance) {
  /**
   * GET /api/v1/driver-finance/pre-settlements/open-by-driver
   * Returns all open (in-progress) pre-settlements for the company — used by the
   * dispatch board to show the "Driver has open pre-settlement · Add to it?" prompt.
   */
  app.get("/api/v1/driver-finance/pre-settlements/open-by-driver", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const companyId = String((req.query as Record<string, unknown>)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return [];

      const res = await client.query(
        `
          SELECT
            s.id            AS settlement_id,
            s.display_id    AS settlement_number,
            s.driver_id,
            s.first_load_id,
            s.first_load_number,
            s.last_load_id,
            s.last_load_number,
            s.status,
            s.gross_pay,
            s.deductions_total,
            s.net_pay,
            s.trip_started_at,
            s.period_start
          FROM driver_finance.driver_settlements s
          WHERE s.operating_company_id = $1
            AND s.settlement_model = 'load_bookended'
            AND s.trip_closed_at IS NULL
            AND s.status NOT IN ('approved', 'paid', 'cancelled')
          ORDER BY s.trip_started_at DESC
        `,
        [companyId]
      );
      return res.rows;
    });

    return { pre_settlements: result };
  });

  /**
   * GET /api/v1/driver-finance/pre-settlements/by-driver/:driverId
   * Returns the most recent active pre-settlement for a driver, with all
   * settlement lines.  Used by the LoadDetailDrawer Pre-Settlement tab.
   */
  app.get("/api/v1/driver-finance/pre-settlements/by-driver/:driverId", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = driverIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const companyId = String((req.query as Record<string, unknown>)?.["operating_company_id"] ?? "");
    if (!companyId) return reply.code(400).send({ error: "operating_company_id_required" });

    const result = await withCompany(user.uuid, companyId, async (client) => {
      if (!(await hasSettlementSchema(client))) return null;

      const sRes = await client.query(
        `
          SELECT
            s.id,
            s.display_id,
            s.driver_id,
            s.status,
            s.gross_pay,
            s.deductions_total,
            s.reimbursements_total,
            s.net_pay,
            s.first_load_id,
            s.first_load_number,
            s.last_load_id,
            s.last_load_number,
            s.trip_started_at,
            s.trip_closed_at,
            s.period_start,
            s.period_end
          FROM driver_finance.driver_settlements s
          WHERE s.driver_id = $1
            AND s.operating_company_id = $2
            AND s.settlement_model = 'load_bookended'
            AND s.status NOT IN ('approved', 'paid', 'cancelled')
          ORDER BY s.created_at DESC
          LIMIT 1
        `,
        [params.data.driverId, companyId]
      );
      const settlement = sRes.rows[0] ?? null;
      if (!settlement) return null;

      const linesRes = await client.query(
        `
          SELECT id, line_type, description, amount, created_at
          FROM driver_finance.settlement_lines
          WHERE settlement_id = $1
          ORDER BY created_at ASC
        `,
        [(settlement as Record<string, unknown>).id]
      );

      return { settlement, lines: linesRes.rows };
    });

    if (!result) return reply.code(404).send({ error: "no_active_pre_settlement" });
    return result;
  });

  /**
   * POST /api/v1/driver-finance/pre-settlements/:id/add-load
   * Links a southbound load to an existing open pre-settlement.
   * Appends the SB load's earnings line using the existing settlement-engine
   * helper, updates last_load tracking, and re-aggregates totals.
   * INVARIANT: one open pre-settlement per driver (MUST 8a.0.5.12).
   */
  app.post("/api/v1/driver-finance/pre-settlements/:id/add-load", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = addLoadBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      const sRes = await client.query(
        `
          SELECT id, driver_id, status, trip_closed_at
          FROM driver_finance.driver_settlements
          WHERE id = $1
            AND operating_company_id = $2
            AND settlement_model = 'load_bookended'
          LIMIT 1
          FOR UPDATE
        `,
        [params.data.id, body.operating_company_id]
      );
      const settlement = sRes.rows[0] as Record<string, unknown> | undefined;
      if (!settlement) return { notFound: true as const };
      if (settlement.trip_closed_at) return { alreadyClosed: true as const };

      const loadRes = await client.query(
        `
          SELECT id, load_number, assigned_primary_driver_id, assigned_secondary_driver_id
          FROM mdata.loads
          WHERE id = $1
            AND operating_company_id = $2
            AND soft_deleted_at IS NULL
          LIMIT 1
        `,
        [body.load_id, body.operating_company_id]
      );
      const load = loadRes.rows[0] as Record<string, unknown> | undefined;
      if (!load) return { loadNotFound: true as const };

      const driverId = String(settlement.driver_id);
      const matchesDriver =
        String(load.assigned_primary_driver_id ?? "") === driverId ||
        String(load.assigned_secondary_driver_id ?? "") === driverId;
      if (!matchesDriver) return { driverMismatch: true as const };

      const team = await fetchTeamDriversForLoad(client, {
        operatingCompanyId: body.operating_company_id,
        loadId: body.load_id,
      });

      const lineType =
        team && driverId === team.primaryDriverId
          ? ("team_split_primary" as const)
          : team
            ? ("team_split_secondary" as const)
            : ("earnings" as const);

      await appendSettlementLineFromDriverBillIfMissing(client, {
        settlementId: params.data.id,
        driverId,
        loadId: body.load_id,
        teamId: team?.teamId ?? null,
        lineType,
      });

      await client.query(
        `
          UPDATE driver_finance.driver_settlements
          SET last_load_id = $2,
              last_load_number = $3,
              updated_at = now()
          WHERE id = $1
        `,
        [params.data.id, body.load_id, String(load.load_number ?? body.load_id)]
      );

      const totals = await aggregateSettlementTotals(client, params.data.id);

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.pre_settlement.load_linked",
        {
          settlement_id: params.data.id,
          driver_id: driverId,
          load_id: body.load_id,
          operating_company_id: body.operating_company_id,
        },
        "info",
        "P0-PRESETTLEMENT"
      );

      return { ok: true as const, settlement_id: params.data.id, totals };
    });

    if (result && "unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (result && "notFound" in result) return reply.code(404).send({ error: "pre_settlement_not_found" });
    if (result && "alreadyClosed" in result) return reply.code(409).send({ error: "pre_settlement_already_closed" });
    if (result && "loadNotFound" in result) return reply.code(404).send({ error: "load_not_found" });
    if (result && "driverMismatch" in result) return reply.code(422).send({ error: "driver_not_assigned_to_load" });
    return result;
  });

  /**
   * POST /api/v1/driver-finance/pre-settlements/:id/settle  ("Settle & Pay")
   * Finalises a closed load-bookended pre-settlement: recomputes totals,
   * transitions status → approved, renders the PDF, and emails/notifies the driver.
   * Guard: settlement must be status=closed (auto-set by closeSettlementForFinalLoad
   * when the SB return load is marked delivered_pending_docs).
   */
  app.post("/api/v1/driver-finance/pre-settlements/:id/settle", async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;

    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);

    const parsed = settleBodySchema.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);
    const body = parsed.data;

    const result = await withCompany(user.uuid, body.operating_company_id, async (client) => {
      if (!(await hasSettlementSchema(client))) return { unavailable: true as const };

      const rowRes = await client.query(
        `
          SELECT
            s.id, s.display_id, s.status, s.trip_closed_at, s.net_pay, s.driver_id,
            d.first_name, d.last_name, d.phone,
            d.email      AS driver_row_email,
            d.identity_user_id,
            u.email      AS user_email
          FROM driver_finance.driver_settlements s
          JOIN mdata.drivers d ON d.id = s.driver_id
          LEFT JOIN identity.users u ON u.id = d.identity_user_id
          WHERE s.id = $1
            AND s.operating_company_id = $2
            AND s.settlement_model = 'load_bookended'
          LIMIT 1
          FOR UPDATE
        `,
        [params.data.id, body.operating_company_id]
      );
      const row = rowRes.rows[0] as Record<string, unknown> | undefined;
      if (!row) return { notFound: true as const };

      const status = String(row.status ?? "");
      if (!["closed", "open"].includes(status)) {
        return { invalidStatus: true as const, status };
      }

      await aggregateSettlementTotals(client, params.data.id);

      await client.query(
        `
          UPDATE driver_finance.driver_settlements
          SET status = 'approved', updated_at = now()
          WHERE id = $1
        `,
        [params.data.id]
      );

      const pdf = await renderSettlementStatementPdf(client, {
        operatingCompanyId: body.operating_company_id,
        settlementId: params.data.id,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "driver_finance.pre_settlement.settled",
        {
          settlement_id: params.data.id,
          driver_id: String(row.driver_id ?? ""),
          operating_company_id: body.operating_company_id,
        },
        "info",
        "P0-PRESETTLEMENT"
      );

      return { row, pdf };
    });

    if (result && "unavailable" in result) return reply.code(501).send({ error: "driver_finance_schema_not_available" });
    if (result && "notFound" in result) return reply.code(404).send({ error: "pre_settlement_not_found" });
    if (result && "invalidStatus" in result) {
      return reply.code(409).send({ error: "pre_settlement_settle_blocked", status: (result as any).status });
    }

    const { row, pdf } = result as { row: Record<string, unknown>; pdf: { filename: string; pdfBuffer: Buffer; mimeType: string } };

    const driverName = `${String(row.first_name ?? "").trim()} ${String(row.last_name ?? "").trim()}`.trim() || "Driver";
    const settlementNo = String(row.display_id ?? row.id);
    const netPay = row.net_pay != null ? Number(row.net_pay) : null;
    const amountLabel = netPay != null && Number.isFinite(netPay) ? `USD ${netPay.toFixed(2)}` : "";
    const net = netPay != null && Number.isFinite(netPay) ? netPay.toFixed(2) : "";
    const baseUrl = process.env.FRONTEND_BASE_URL?.replace(/\/$/, "") ?? "";
    const driverLink = baseUrl ? `${baseUrl}/driver` : "";
    const phone = row.phone ? String(row.phone).trim() : "";
    const identityUserId = row.identity_user_id ? String(row.identity_user_id) : "";
    const toEmail = String(row.user_email ?? row.driver_row_email ?? "").trim();

    if (toEmail) {
      await enqueueEmail({
        operatingCompanyId: body.operating_company_id,
        toAddresses: [toEmail],
        subject: `Settlement approved — ${settlementNo}`,
        templateKey: "settlement-ready",
        templateVars: { driverName, settlementLabel: settlementNo, amountLabel },
        attachments: [
          {
            filename: pdf.filename,
            contentBase64: pdf.pdfBuffer.toString("base64"),
            contentType: pdf.mimeType,
          },
        ],
        queuedByUserId: user.uuid,
      });
    }

    if (identityUserId) {
      await dispatchNotification({
        user_id: identityUserId,
        event_type: "settlement_approved" as NotificationEventType,
        actor_user_id: user.uuid,
        payload: {
          operating_company_id: body.operating_company_id,
          driverName,
          settlementLabel: settlementNo,
          amountLabel,
          settlement_no: settlementNo,
          net,
          link: driverLink,
          sms_to: phone,
          whatsapp_to: phone,
          skip_email: true,
        },
      });
    }

    return { ok: true, settlement_id: params.data.id, net_pay: row.net_pay };
  });
}
