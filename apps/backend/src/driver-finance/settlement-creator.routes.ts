/**
 * ROUND 180 / R-186 — Settlement Creator routes.
 * POST preview + POST commit. USMCA + Owner/Admin/Accountant only. No Book Load.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import {
  previewSettlementCreator,
  postSettlementCreatorInClientTx,
  SettlementCreatorError,
} from "./settlement-creator.service.js";
import {
  ensureDispatchedLoadsForCreator,
  SettlementCreatorSeedError,
} from "./settlement-creator-seed-loads.js";
import { peekNextSettlementSourceDocumentRef } from "./settlement-source-document-ref.service.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { autoSubmitDeliveredLoadToFactor } from "../factoring/auto-submit-on-delivery.service.js";
import { syncSettlementLoadsToBilling } from "../dispatch/load-billing-lifecycle.service.js";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const WRITE_RL = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const moneyLine = z.object({
  description: z.string().trim().min(1).max(500),
  amount_cents: z.number().int(),
  load_number: z.string().trim().max(40).nullable().optional(),
});

const draftSchema = z.object({
  operating_company_id: z.string().uuid(),
  settlement_no: z.string().trim().max(40).default(""),
  driver_id: z.string().uuid(),
  unit_id: z.string().uuid().nullable().optional(),
  trailer_equipment_number: z.string().trim().max(40).nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  seed_dispatched_loads: z.boolean().optional().default(true),
  loads: z
    .array(
      z.object({
        load_number: z.string().trim().min(1).max(40),
        customer_name: z.string().trim().max(200).nullable().optional(),
        customer_id: z.string().uuid().nullable().optional(),
        pickup_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        pickup_city: z.string().trim().max(120).nullable().optional(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        delivery_city: z.string().trim().max(120).nullable().optional(),
        line_haul_miles: z.number().nullable().optional(),
        line_haul_rate_cents: z.number().int().nullable().optional(),
        line_haul_amount_cents: z.number().int().nullable().optional(),
        accessorials: z
          .array(
            z.object({
              item_name: z.string().trim().min(1).max(120),
              description: z.string().trim().max(500).nullable().optional(),
              amount_cents: z.number().int(),
            }),
          )
          .optional(),
        factoring: z.enum(["faro_usmca", "faro_transportation", "direct"]),
        date_sent_to_factoring: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        loaded_miles: z.number().nullable().optional(),
        empty_miles: z.number().nullable().optional(),
        picks: z.number().nullable().optional(),
        drops: z.number().nullable().optional(),
        trip_type: z.enum(["NB", "TR", "SB", "LOCAL"]).nullable().optional(),
        join_outbound_load_number: z.string().trim().max(40).nullable().optional(),
        not_yet_delivered: z.boolean().nullable().optional(),
      }),
    )
    .min(1),
  customer_charges_cents: z.number().int().nullable().optional(),
  fuel_purchases: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        vendor_name: z.string().trim().max(200).nullable().optional(),
        location: z.string().trim().max(200).nullable().optional(),
        invoice: z.string().trim().max(80).nullable().optional(),
        gallons: z.number(),
        cpg_cents: z.number().int(),
        receipt_cents: z.number().int().nullable().optional(),
        fees_cents: z.number().int().nullable().optional(),
        discount_cents: z.number().int().nullable().optional(),
        card: z.enum(["dreamline", "relay"]),
        load_number: z.string().trim().max(40).nullable().optional(),
        fuel_type: z.enum(["diesel", "def", "reefer_diesel"]).optional(),
      }),
    )
    .default([]),
  expenses: z
    .array(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        item_name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(500).nullable().optional(),
        amount_cents: z.number().int(),
        load_number: z.string().trim().max(40).nullable().optional(),
        is_company_expense: z.boolean(),
        is_reimbursable: z.boolean(),
        card: z.enum(["dreamline", "relay"]).nullable().optional(),
      }),
    )
    .default([]),
  deductions: z.array(moneyLine).default([]),
  reimbursements: z.array(moneyLine).default([]),
  escrow: z.array(moneyLine).default([]),
  advances: z
    .array(
      z.object({
        description: z.string().trim().max(500).nullable().optional(),
        amount_cents: z.number().int(),
        load_number: z.string().trim().max(40).nullable().optional(),
        linked_driver_bill_id: z.string().uuid().nullable().optional(),
      }),
    )
    .default([]),
  pdf_driver_net_cents: z.number().int(),
  pdf_company_expenses_cents: z.number().int(),
  edit_void_repost: z.boolean().optional().default(false),
  source_pdf_file_id: z.string().uuid().nullable().optional(),
});

function currentUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user as { uuid: string; role: string };
}

export async function registerSettlementCreatorRoutes(app: FastifyInstance): Promise<void> {
  // Owner 2026-09-26 — Creator follows AlwaysTrack settlement numbers (source_document_ref digits).
  app.get(
    "/api/v1/driver-finance/settlement-creator/next-settlement-peek",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const user = currentUser(req, reply);
      if (!user) return;
      if (!AUTHORITY_ROLES.has(user.role)) {
        return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
      }
      const query = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.query ?? {});
      if (!query.success) {
        return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
      }
      if (query.data.operating_company_id !== USMCA) {
        return reply.code(400).send({ error: "usmca_only" });
      }
      await assertCompanyMembership(user.uuid, query.data.operating_company_id);
      const next = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          query.data.operating_company_id,
        ]);
        return peekNextSettlementSourceDocumentRef(client, query.data.operating_company_id);
      });
      return reply.code(200).send({ next_number: next });
    },
  );

  app.post("/api/v1/driver-finance/settlement-creator/preview", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const parsed = draftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const draft = parsed.data as SettlementCreatorDraft;
    if (draft.operating_company_id !== USMCA) {
      return reply.code(400).send({ error: "usmca_only" });
    }
    await assertCompanyMembership(user.uuid, draft.operating_company_id);

    const preview = await withCurrentUser(user.uuid, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        draft.operating_company_id,
      ]);
      return previewSettlementCreator(client, draft);
    });
    return reply.code(200).send({ preview });
  });

  app.post("/api/v1/driver-finance/settlement-creator/post", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const parsed = draftSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const draft = parsed.data as SettlementCreatorDraft;
    if (draft.operating_company_id !== USMCA) {
      return reply.code(400).send({ error: "usmca_only" });
    }
    await assertCompanyMembership(user.uuid, draft.operating_company_id);

    try {
      // R-186.1 — book missing dispatched loads via bookLoad (own tx) BEFORE settlement post.
      await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          draft.operating_company_id,
        ]);
        await ensureDispatchedLoadsForCreator(client, { uuid: user.uuid, role: user.role }, draft);
      });

      const result = await withCurrentUser(user.uuid, async (client) => {
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          draft.operating_company_id,
        ]);
        return postSettlementCreatorInClientTx(client, user.uuid, draft);
      });

      // AFTER COMMIT — Faro auto-submit + billing sync use own connections (never share Creator tx).
      // FACT-DELIVERED-AUTO: faro_usmca only (USMCA factor). faro_transportation / direct = no-op.
      const factoringAdvanceIds: string[] = [];
      for (let i = 0; i < draft.loads.length; i++) {
        const load = draft.loads[i]!;
        const loadId = result.load_ids[i];
        if (!loadId) continue;
        if (load.factoring !== "faro_usmca") continue;
        // Not-delivered: no invoice yet → autoSubmit no-ops on no_invoice; skip the call.
        if (load.not_yet_delivered !== false && !load.delivery_date) continue;
        try {
          const submitted = await autoSubmitDeliveredLoadToFactor({
            operatingCompanyId: draft.operating_company_id,
            loadId,
            actorUserId: user.uuid,
          });
          if (submitted.submitted && submitted.advanceId) {
            factoringAdvanceIds.push(submitted.advanceId);
          } else if (!submitted.submitted) {
            console.warn(
              {
                load_id: loadId,
                load_number: load.load_number,
                reason: submitted.reason,
              },
              "settlement_creator_faro_auto_submit_noop",
            );
          }
        } catch (err) {
          console.warn(
            { err, load_id: loadId, load_number: load.load_number },
            "settlement_creator_faro_auto_submit_failed",
          );
        }
      }

      try {
        await syncSettlementLoadsToBilling({
          operatingCompanyId: draft.operating_company_id,
          loadIds: result.load_ids,
          actorUserId: user.uuid,
        });
      } catch (err) {
        console.warn({ err, settlement_id: result.settlement_id }, "settlement_creator_billing_sync_failed");
      }

      return reply.code(200).send({
        ok: true,
        ...result,
        factoring_advance_ids: factoringAdvanceIds,
      });
    } catch (err) {
      if (err instanceof SettlementCreatorError || err instanceof SettlementCreatorSeedError) {
        const conflict = new Set([
          "settlement_exists",
          "settlement_reverse_blocked_paid",
          "settlement_reverse_blocked_locked",
          "settlement_already_cancelled",
        ]);
        return reply.code(conflict.has(err.code) ? 409 : 400).send({
          error: err.code,
          message: err.message,
        });
      }
      throw err;
    }
  });
}
