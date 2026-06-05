import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../../audit/crud-audit.js";
import { withCurrentUser } from "../../auth/db.js";
import { requireAuth } from "../../auth/session-middleware.js";
import { createCorrectiveJournalEntry } from "../../driver-finance/settlement-dispute.service.js";

const disputeTypeSchema = z.enum([
  "missing_line",
  "incorrect_rate",
  "duplicate_deduction",
  "wrong_unit",
  "other",
]);

const disputeStatusSchema = z.enum(["submitted", "in_review", "approved", "denied", "partial"]);

const createDisputeBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  driver_id: z.string().uuid(),
  dispute_type: disputeTypeSchema,
  claimed_amount_cents: z.number().int().positive(),
  description: z.string().trim().min(10),
  evidence_doc_ids: z.array(z.string().uuid()).optional(),
});

const listQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: disputeStatusSchema.optional(),
  driver_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const reviewBodySchema = z.object({
  operating_company_id: z.string().uuid(),
  status: z.enum(["in_review", "approved", "denied", "partial"]),
  resolution_amount_cents: z.number().int().positive().optional(),
  resolution_notes: z.string().trim().min(10).optional(),
});

const settlementIdParamsSchema = z.object({ id: z.string().uuid() });
const disputeIdParamsSchema = z.object({ id: z.string().uuid() });

function auth(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

function isOwner(role: string) {
  return role === "Owner";
}

function mapKnownError(error: unknown) {
  const msg = String((error as Error)?.message ?? "unknown_error");
  if (msg.includes("E_NOT_FOUND")) return { code: 404 as const, error: "E_NOT_FOUND" };
  if (msg.includes("E_OWNER_ONLY")) return { code: 403 as const, error: "E_OWNER_ONLY" };
  if (msg.includes("E_CLOSED_IMMUTABLE")) return { code: 409 as const, error: "E_CLOSED_IMMUTABLE" };
  if (msg.includes("E_SETTLEMENT_NOT_FOUND")) return { code: 404 as const, error: "E_SETTLEMENT_NOT_FOUND" };
  if (msg.includes("E_RESOLUTION_AMOUNT_REQUIRED")) return { code: 400 as const, error: "E_RESOLUTION_AMOUNT_REQUIRED" };
  if (msg.includes("E_RESOLUTION_NOTES_REQUIRED")) return { code: 400 as const, error: "E_RESOLUTION_NOTES_REQUIRED" };
  if (msg.includes("E_CORRECTIVE_JE_ACCOUNTS_MISSING")) return { code: 409 as const, error: "E_CORRECTIVE_JE_ACCOUNTS_MISSING" };
  return { code: 500 as const, error: "settlement_dispute_operation_failed", message: msg };
}

const CLOSED_STATUSES = new Set(["approved", "denied", "partial"]);

export async function createSettlementDispute(
  userId: string,
  settlementId: string,
  input: z.infer<typeof createDisputeBodySchema>
) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const settlementRes = await client.query<{ id: string; driver_id: string }>(
      `
        SELECT id, driver_id
        FROM driver_finance.driver_settlements
        WHERE id = $1::uuid
          AND operating_company_id = $2::uuid
          AND driver_id = $3::uuid
        LIMIT 1
      `,
      [settlementId, input.operating_company_id, input.driver_id]
    );
    if (!settlementRes.rows[0]?.id) throw new Error("E_SETTLEMENT_NOT_FOUND");

    const insertRes = await client.query<{ id: string }>(
      `
        INSERT INTO settlements.settlement_disputes (
          settlement_id,
          driver_id,
          dispute_type,
          claimed_amount_cents,
          description,
          evidence_doc_ids,
          status
        )
        VALUES ($1::uuid, $2::uuid, $3, $4::bigint, $5, $6::uuid[], 'submitted')
        RETURNING id
      `,
      [
        settlementId,
        input.driver_id,
        input.dispute_type,
        input.claimed_amount_cents,
        input.description,
        input.evidence_doc_ids ?? null,
      ]
    );

    const disputeId = String(insertRes.rows[0]?.id ?? "");
    await appendCrudAudit(
      client,
      userId,
      "settlements.settlement_dispute.created",
      { resource_type: "settlements.settlement_disputes", resource_id: disputeId },
      "info",
      "P5-T13-DISPUTES"
    );

    return { id: disputeId };
  });
}

export async function listSettlementDisputes(userId: string, query: z.infer<typeof listQuerySchema>) {
  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [query.operating_company_id]);

    const values: unknown[] = [query.operating_company_id];
    const filters: string[] = [
      `EXISTS (
        SELECT 1 FROM driver_finance.driver_settlements s
        WHERE s.id = d.settlement_id AND s.operating_company_id = $1::uuid
      )`,
    ];

    if (query.status) {
      values.push(query.status);
      filters.push(`d.status = $${values.length}`);
    }
    if (query.driver_id) {
      values.push(query.driver_id);
      filters.push(`d.driver_id = $${values.length}::uuid`);
    }

    values.push(query.limit, query.offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;

    const rowsRes = await client.query(
      `
        SELECT
          d.*,
          dr.first_name || ' ' || dr.last_name AS driver_name,
          s.display_id AS settlement_display_id
        FROM settlements.settlement_disputes d
        JOIN mdata.drivers dr ON dr.id = d.driver_id
        JOIN driver_finance.driver_settlements s ON s.id = d.settlement_id
        WHERE ${filters.join(" AND ")}
        ORDER BY d.created_at DESC
        LIMIT $${limitIdx} OFFSET $${offsetIdx}
      `,
      values
    );

    const countRes = await client.query<{ total: string }>(
      `
        SELECT COUNT(*)::text AS total
        FROM settlements.settlement_disputes d
        WHERE ${filters.join(" AND ")}
      `,
      values.slice(0, values.length - 2)
    );

    return {
      disputes: rowsRes.rows,
      total: Number(countRes.rows[0]?.total ?? 0),
      limit: query.limit,
      offset: query.offset,
    };
  });
}

export async function reviewSettlementDispute(
  userId: string,
  userRole: string,
  disputeId: string,
  input: z.infer<typeof reviewBodySchema>
) {
  if (!isOwner(userRole)) throw new Error("E_OWNER_ONLY");

  return withCurrentUser(userId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1, true)`, [input.operating_company_id]);

    const disputeRes = await client.query<{
      id: string;
      settlement_id: string;
      driver_id: string;
      status: string;
      claimed_amount_cents: string | number;
    }>(
      `
        SELECT d.id, d.settlement_id, d.driver_id, d.status, d.claimed_amount_cents
        FROM settlements.settlement_disputes d
        JOIN driver_finance.driver_settlements s ON s.id = d.settlement_id
        WHERE d.id = $2::uuid
          AND s.operating_company_id = $1::uuid
        FOR UPDATE OF d
      `,
      [input.operating_company_id, disputeId]
    );
    const dispute = disputeRes.rows[0];
    if (!dispute) throw new Error("E_NOT_FOUND");
    if (CLOSED_STATUSES.has(String(dispute.status))) throw new Error("E_CLOSED_IMMUTABLE");

    const nextStatus = input.status;
    if (nextStatus === "in_review") {
      await client.query(
        `UPDATE settlements.settlement_disputes SET status = 'in_review', reviewed_by_user_id = $2::uuid, reviewed_at = now() WHERE id = $1::uuid`,
        [disputeId, userId]
      );
      return { id: disputeId, status: "in_review" as const };
    }

    if (!input.resolution_notes || input.resolution_notes.trim().length < 10) {
      throw new Error("E_RESOLUTION_NOTES_REQUIRED");
    }

    const resolutionAmountCents =
      nextStatus === "approved" || nextStatus === "partial"
        ? Number(input.resolution_amount_cents ?? dispute.claimed_amount_cents ?? 0)
        : 0;
    if ((nextStatus === "approved" || nextStatus === "partial") && resolutionAmountCents <= 0) {
      throw new Error("E_RESOLUTION_AMOUNT_REQUIRED");
    }

    let journalEntryId: string | null = null;
    if (nextStatus === "approved" || nextStatus === "partial") {
      journalEntryId = await createCorrectiveJournalEntry({
        actorUserId: userId,
        actorRole: userRole,
        operatingCompanyId: input.operating_company_id,
        disputeId,
        settlementId: String(dispute.settlement_id),
        amountCents: resolutionAmountCents,
        resolutionNotes: input.resolution_notes.trim(),
      });

      await client.query(
        `
          INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, description, amount)
          VALUES ($1::uuid, 'dispute_adjustment', $2, $3::numeric)
        `,
        [
          dispute.settlement_id,
          `Dispute adjustment (${nextStatus})`,
          resolutionAmountCents / 100,
        ]
      );
    }

    await client.query(
      `
        UPDATE settlements.settlement_disputes
        SET status = $3,
            resolution_amount_cents = $4::bigint,
            resolution_notes = $5,
            reviewed_by_user_id = $6::uuid,
            reviewed_at = now(),
            qbo_adjustment_je_id = $7::uuid
        WHERE id = $1::uuid
      `,
      [
        disputeId,
        input.operating_company_id,
        nextStatus,
        resolutionAmountCents || null,
        input.resolution_notes.trim(),
        userId,
        journalEntryId,
      ]
    );

    await appendCrudAudit(
      client,
      userId,
      "settlements.settlement_dispute.reviewed",
      {
        resource_type: "settlements.settlement_disputes",
        resource_id: disputeId,
        status: nextStatus,
        qbo_adjustment_je_id: journalEntryId,
      },
      "warning",
      "P5-T13-DISPUTES"
    );

    return {
      id: disputeId,
      status: nextStatus,
      resolution_amount_cents: resolutionAmountCents || null,
      qbo_adjustment_je_id: journalEntryId,
    };
  });
}

export async function registerSettlementsDisputesRoutes(app: FastifyInstance) {
  app.post("/api/v1/settlements/:id/disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = settlementIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = createDisputeBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await createSettlementDispute(user.uuid, params.data.id, body.data);
      return reply.code(201).send({ data });
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.get("/api/v1/settlement-disputes", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    try {
      const payload = await listSettlementDisputes(user.uuid, query.data);
      return payload;
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });

  app.patch("/api/v1/settlement-disputes/:id/review", async (req, reply) => {
    const user = auth(req, reply);
    if (!user) return;
    const params = disputeIdParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = reviewBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    try {
      const data = await reviewSettlementDispute(user.uuid, String(user.role ?? ""), params.data.id, body.data);
      return { data };
    } catch (error) {
      const mapped = mapKnownError(error);
      return reply.code(mapped.code).send(mapped);
    }
  });
}

export default fp(
  async (app) => {
    await registerSettlementsDisputesRoutes(app);
  },
  { name: "settlements.registerSettlementsDisputesRoutes" }
);
