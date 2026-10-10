/**
 * ROUND 180 / R-186 — Settlement Creator routes.
 * POST preview + POST commit. USMCA + Owner/Admin/Accountant only. No Book Load.
 */
import { FeedGateError } from "./feed-gate/feed-gate.service.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { withCurrentUser } from "../auth/db.js";
import {
  previewSettlementCreatorThroughClose,
  postSettlementCreatorInClientTx,
  SettlementCreatorError,
} from "./settlement-creator.service.js";
import {
  ensureDispatchedLoadsForCreator,
  SettlementCreatorSeedError,
} from "./settlement-creator-seed-loads.js";
import { peekNextSettlementSourceDocumentRef } from "./settlement-source-document-ref.service.js";
import type { SettlementCreatorDraft } from "./settlement-creator.types.js";
import { assertCreatorDraftAdmissible } from "./settlement-creator-admission.js";
import { loadLastAfterCommit, overallOk, recordAfterCommit, runCreatorAfterCommit, type CreatorStages } from "./settlement-creator-after-commit.js";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);
const WRITE_RL = { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } };
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

const moneyLine = z.object({
  description: z.string().trim().min(1).max(500),
  amount_cents: z.number().int(),
  load_number: z.string().trim().max(40).nullable().optional(),
  item_id: z.string().uuid().nullable().optional(),
  quantity: z.number().nullable().optional(),
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
        customer_po_number: z.string().trim().max(80).nullable().optional(),
        customer_wo_number: z.string().trim().max(80).nullable().optional(),
        pickup_address: z.string().trim().max(240).nullable().optional(),
        pickup_city: z.string().trim().max(120).nullable().optional(),
        pickup_state: z.string().trim().min(2).max(6).nullable().optional(),
        pickup_zip: z.string().trim().max(20).nullable().optional(),
        pickup_lat: z.number().nullable().optional(),
        pickup_lng: z.number().nullable().optional(),
        delivery_state: z.string().trim().min(2).max(6).nullable().optional(),
        delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        delivery_address: z.string().trim().max(240).nullable().optional(),
        delivery_city: z.string().trim().max(120).nullable().optional(),
        delivery_zip: z.string().trim().max(20).nullable().optional(),
        delivery_lat: z.number().nullable().optional(),
        delivery_lng: z.number().nullable().optional(),
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
        // ROUND 443.3 — Invoice no. box: digits; blank -> null (the load number is used).
        invoice_number: z
          .preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().regex(/^[0-9]{1,12}$/).nullable())
          .optional(),
        date_sent_to_factoring: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        loaded_miles: z.number().nullable().optional(),
        miles_shortest: z.number().nullable().optional(),
        empty_miles: z.number().nullable().optional(),
        empty_rate_cents: z.number().int().nullable().optional(),
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
        source_doc_id: z.string().uuid().nullable().optional(),
        // ROUND 363-CC2-D — the item, the account and the load, picked at creation (ids, never free text).
        item_id: z.string().uuid().nullable().optional(),
        account_id: z.string().uuid().nullable().optional(),
        load_id: z.string().uuid().nullable().optional(),
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
        // ROUND 363-CC2-D — the item, the account and the load, picked at creation (ids, never free text).
        item_id: z.string().uuid().nullable().optional(),
        account_id: z.string().uuid().nullable().optional(),
        load_id: z.string().uuid().nullable().optional(),
        // ROUND 443.6 — payment source (owed = A/P bill), vendor, vendor document number, quantity / unit.
        card: z.enum(["dreamline", "relay", "owed"]).nullable().optional(),
        vendor_name: z.string().trim().max(200).nullable().optional(),
        vendor_document_number: z.string().trim().max(60).nullable().optional(),
        quantity: z.number().positive().nullable().optional(),
        unit_of_measure: z.string().trim().toLowerCase().regex(/^[a-z][a-z_]*$/).max(20).nullable().optional(),
      }),
    )
    .default([]),
  deductions: z.array(moneyLine).default([]),
  reimbursements: z.array(moneyLine).default([]),
  additional_pay: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(500),
        amount_cents: z.number().int(),
        load_number: z.string().trim().max(40).nullable().optional(),
        pay_kind: z.enum(["detention", "layover", "bonus", "stop_pay", "other"]).optional(),
        item_id: z.string().uuid().nullable().optional(),
        quantity: z.number().nullable().optional(),
      }),
    )
    .default([]),
  escrow: z.array(moneyLine).default([]),
  advances: z
    .array(
      z.object({
        description: z.string().trim().max(500).nullable().optional(),
        amount_cents: z.number().int(),
        load_number: z.string().trim().max(40).nullable().optional(),
        linked_driver_bill_id: z.string().uuid().nullable().optional(),
        load_id: z.string().uuid().nullable().optional(),
      }),
    )
    .default([]),
  admin_fee_cents: z.number().int().nullable().optional(),
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
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
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
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
        draft.operating_company_id,
      ]);
      return previewSettlementCreatorThroughClose(client, user.uuid, draft, user.role);
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
      // ROUND 443.7 a — ONE transaction: admission, booking the loads (bookLoadOnClient), every document, the ledger
      // and the settlement close. Any refusal rolls ALL of it back (zero rows); the same draft can be posted again.
      let afterBook: Array<() => void> = [];
      const result = await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          draft.operating_company_id,
        ]);
        await assertCreatorDraftAdmissible(client, draft);
        const seeded = await ensureDispatchedLoadsForCreator(client, { uuid: user.uuid, role: user.role }, draft);
        afterBook = seeded.afterCommit;
        return postSettlementCreatorInClientTx(client, user.uuid, draft);
      });
      // COMMITTED — only now the after-book extras (never after a rollback).
      for (const run of afterBook) run();

      // AFTER COMMIT — factoring submit + billing sync on their own connections (never the Creator tx). ROUND 443.7 b:
      // every stage is reported; ok is true only when all required stages succeeded; a failure is stored + retryable.
      const afterInput = {
        operating_company_id: draft.operating_company_id,
        settlement_id: result.settlement_id,
        loads: draft.loads
          .map((load, i) => ({
            load_id: result.load_ids[i] ?? "",
            load_number: load.load_number,
            factoring: load.factoring,
            delivered: !(load.not_yet_delivered !== false && !load.delivery_date),
          }))
          .filter((l) => l.load_id),
      };
      const after = await runCreatorAfterCommit(user.uuid, afterInput);
      const stages: CreatorStages = {
        documents: { ok: true, status: "committed", message: `Settlement ${result.source_document_ref || result.display_id} and its documents are saved.` },
        ledger: result.journal_entry_ids.length > 0
          ? { ok: true, status: "posted", message: `${result.journal_entry_ids.length} journal entr${result.journal_entry_ids.length === 1 ? "y" : "ies"} posted.` }
          : { ok: false, status: "not_posted", message: "Nothing was posted to the ledger for this settlement." },
        ...after,
      };
      await recordAfterCommit(user.uuid, afterInput, after);
      return reply.code(200).send({
        ok: overallOk(stages),
        stages,
        ...result,
        factoring_advance_ids: [],
      });
    } catch (err) {
      if (err instanceof FeedGateError) {
        // FEED GATE: the settlement did not commit; every red row + fix link is returned so the creator shows them.
        return reply.code(409).send({ error: err.code, message: err.message, feed_gate: err.details ?? null });
      }
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

  // ROUND 443.7 b — re-run a stored after-commit stage (factoring submit / billing sync) for a posted settlement.
  app.post("/api/v1/driver-finance/settlement-creator/:settlementId/retry-after-commit", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const params = z.object({ settlementId: z.string().uuid() }).safeParse(req.params ?? {});
    const body = z.object({ operating_company_id: z.string().uuid() }).safeParse(req.body ?? {});
    if (!params.success || !body.success) return reply.code(400).send({ error: "validation_error" });
    if (body.data.operating_company_id !== USMCA) return reply.code(400).send({ error: "usmca_only" });
    await assertCompanyMembership(user.uuid, body.data.operating_company_id);
    const last = await loadLastAfterCommit(user.uuid, body.data.operating_company_id, params.data.settlementId);
    if (!last) return reply.code(404).send({ error: "no_after_commit_record", message: "This settlement has no stored after-commit run." });
    const after = await runCreatorAfterCommit(user.uuid, last.retry);
    await recordAfterCommit(user.uuid, last.retry, after);
    return reply.code(200).send({ ok: after.factoring.ok && after.billing.ok, stages: after });
  });
}
