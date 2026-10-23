/**
 * ROUND 180 / R-186 — Settlement Creator routes.
 * POST preview + POST commit. USMCA + Owner/Admin/Accountant only. No Book Load.
 */
import { notVoided, statusNotCancelled } from "../accounting/live-document-predicates.sql.js";
import { checkSettlementSourceOnClient, describeSourceDiff } from "./settlement-source-fingerprint.js";
import { FeedGateError } from "./feed-gate/feed-gate.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { CreatorCategorizationError, categorizeCreatorSettlement } from "./creator-document-categorization.service.js";
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

/** Lead 443.57 — one miles field's source for the LOAD's saved operating miles (CC-2's engine). Manual needs a value + reason. */
const milesFieldChoiceSchema = z
  .object({
    source: z.enum(["document", "historical", "google", "manual"]),
    manual_value: z.number().nonnegative().nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((c) => c.source !== "manual" || (c.manual_value != null && Boolean(c.reason?.trim())), {
    message: "manual miles need a value and a reason",
  });

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
  // 443.110 G5 — the truck is required: every Creator load is booked on it and every line carries it.
  unit_id: z.string().uuid(),
  trailer_equipment_number: z.string().trim().max(40).nullable().optional(),
  trailer_id: z.string().uuid().nullable().optional(),
  trailer_none: z.boolean().optional(),
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
        // LEAD 443.203 — the trailer printed on this load's row (overrides the settlement-level trailer for this load).
        trailer_equipment_number: z.string().trim().max(40).nullable().optional(),
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
        stops: z
          .array(
            z.object({
              stop_type: z.enum(["pickup", "delivery"]),
              date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
              address: z.string().trim().max(240).nullable().optional(),
              city: z.string().trim().min(1).max(120),
              state: z.string().trim().min(2).max(6),
              zip: z.string().trim().max(20).nullable().optional(),
              lat: z.number().nullable().optional(),
              lng: z.number().nullable().optional(),
            }),
          )
          .max(20)
          .nullable()
          .optional(),
        driver_pay_mode: z.enum(["mileage", "additional_pay_only"]).optional(),
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
        // Lead 443.57 — per-field source of the LOAD's saved operating miles (CC-2's mileage engine); pay never reads it.
        miles_choice: z
          .object({ practical: milesFieldChoiceSchema.optional(), short: milesFieldChoiceSchema.optional(), empty: milesFieldChoiceSchema.optional() })
          .nullable()
          .optional(),
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
        card: z.enum(["dreamline", "relay", "wex"]),
        load_number: z.string().trim().max(40).nullable().optional(),
        fuel_type: z.enum(["diesel", "def", "reefer_diesel"]).optional(),
        source_doc_id: z.string().uuid().nullable().optional(),
        // ROUND 363-CC2-D — the item, the account and the load, picked at creation (ids, never free text).
        item_id: z.string().uuid().nullable().optional(),
        account_id: z.string().uuid().nullable().optional(),
        load_id: z.string().uuid().nullable().optional(),
        // D2 (Lead audit 2026-10-11) — e.g. "gallons estimated at average price (owner 10-10)"; stored on the fill.
        notes: z.string().trim().max(500).nullable().optional(),
        // 5772 fork rehearsal (Lead 2026-10-11): a Relay fill names its Relay transaction (txn_…); the row links to it.
        relay_transaction_id: z.string().trim().regex(/^txn_[A-Za-z0-9]+$/).nullable().optional(),
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
        card: z.enum(["dreamline", "relay", "wex", "owed"]).nullable().optional(),
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
  // LEAD 443.215 — the printed source's date and Net Revenue (part of the stored source fingerprint); optional.
  source_printed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  pdf_company_net_revenue_cents: z.number().int().nullable().optional(),
  pdf_company_expenses_cents: z.number().int(),
  edit_void_repost: z.boolean().optional().default(false),
  // Lead 443.36 (owner closed ruling): a SALARIED driver's settlement — loads booked with the 0-rate "Salaried" override
  // (no per-load driver bill, card untouched); pay is the settlement's own salary line (additional_pay).
  salaried: z.boolean().optional().default(false),
  // The signed settlement shows NO card fuel (5796 / 5816): the operator confirms it so the fuel-frontier check passes.
  confirmed_zero_fuel_purchases: z.boolean().optional().default(false),
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

  // LEAD 443.215 — a new source (PDF / feed draft) for a settlement number is compared with the source the live settlement was
  // posted from: "new" | "already_posted" | "source_changed" (+ the exact line diff), recorded on the settlement's feed intake.
  app.post("/api/v1/driver-finance/settlement-creator/source-check", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    const parsed = draftSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const draft = parsed.data as SettlementCreatorDraft;
    if (draft.operating_company_id !== USMCA) return reply.code(400).send({ error: "usmca_only" });
    await assertCompanyMembership(user.uuid, draft.operating_company_id);
    const verdict = await withCurrentUser(user.uuid, async (client) => {
      // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [draft.operating_company_id]);
      return checkSettlementSourceOnClient(client as never, { operatingCompanyId: draft.operating_company_id, draft, actorUserId: user.uuid });
    });
    return reply.code(200).send({ verdict, summary: verdict.verdict === "new" ? [] : describeSourceDiff(verdict.diff) });
  });

  // LEAD 443.215 — the Settlements screen's "source changed: repost needed" list: live settlements whose LATEST source check
  // failed, with the line diff and the new source for the Edit = void and repost.
  app.get("/api/v1/driver-finance/settlements/source-changed", async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    const co = String((req.query as Record<string, unknown> | undefined)?.["operating_company_id"] ?? "");
    if (!co) return reply.code(400).send({ error: "operating_company_id_required" });
    await assertCompanyMembership(user.uuid, co);
    const rows = await withCurrentUser(user.uuid, async (client) => {
      // membership-scope-exempt: operating_company_id validated by assertCompanyMembership above.
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [co]);
      return (await client.query(
        `SELECT DISTINCT ON (s.id) s.id::text AS settlement_id, s.display_id, s.source_document_ref AS settlement_no, s.net_pay::text,
                c.status, c.measured_at::text, c.measured->'diff' AS diff, c.measured->'new_draft' AS new_draft,
                (c.measured->>'new_total_due_cents')::bigint AS new_total_due_cents
           FROM driver_finance.driver_settlements s
           JOIN driver_finance.feed_intakes fi ON fi.subject_id = s.id AND fi.operating_company_id = s.operating_company_id
            AND fi.feed_kind = 'settlement' AND ${notVoided("fi")}
           JOIN driver_finance.feed_intake_checks c ON c.intake_id = fi.id AND c.check_group = 'source' AND c.check_key = 'source_unchanged'
          WHERE s.operating_company_id = $1::uuid AND ${notVoided("s")} AND ${statusNotCancelled("s")}
          ORDER BY s.id, c.measured_at DESC`,
        [co])).rows.filter((r: Record<string, unknown>) => r.status === "fail");
    });
    return reply.code(200).send({ settlements: rows });
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
      let stopStamps: unknown[] = [];
      const result = await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [
          draft.operating_company_id,
        ]);
        await assertCreatorDraftAdmissible(client, draft);
        const seeded = await ensureDispatchedLoadsForCreator(client, { uuid: user.uuid, role: user.role }, draft);
        afterBook = seeded.afterCommit;
        stopStamps = seeded.stop_stamps;
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
        // ROUND 443.16 — every stop: tracked (stop event id, nearest when several) or date only, with the reason.
        stop_stamps: stopStamps,
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
          "settlement_source_changed_repost_needed",
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

  // RULING 443.66 — bring a POSTED Creator settlement's documents to the categorization the engine now writes at post
  // time (D1 items on reimbursement + A/P bill lines, D3 "Line Haul" on invoice lines, D4 posted status, D5 line driver /
  // unit / trailer). The named engine path: no amount, account, journal entry or posting moves. dry_run rolls back.
  app.post("/api/v1/driver-finance/settlement-creator/categorize", WRITE_RL, async (req, reply) => {
    const user = currentUser(req, reply);
    if (!user) return;
    if (!AUTHORITY_ROLES.has(user.role)) {
      return reply.code(403).send({ error: "forbidden", message: "Owner/Administrator/Accountant only" });
    }
    const parsed = z
      .object({
        operating_company_id: z.string().uuid(),
        settlement_no: z.string().trim().min(1).max(40),
        reimbursement_items: z
          .array(z.object({ description: z.string(), amount_cents: z.number().int().positive(), load_number: z.string().nullable().optional(), item_id: z.string().uuid() }))
          .max(200)
          .default([]),
        trailer_equipment_number: z.string().trim().max(40).nullable().optional(),
        dry_run: z.boolean().default(true),
      })
      .safeParse(req.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    const b = parsed.data;
    if (b.operating_company_id !== USMCA) return reply.code(400).send({ error: "usmca_only" });
    await assertCompanyMembership(user.uuid, b.operating_company_id);
    try {
      const result = await withCurrentUser(user.uuid, async (client) => {
        // membership-scope-exempt: caller operating_company_id validated by assertCompanyMembership above.
        await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [b.operating_company_id]);
        return categorizeCreatorSettlement(
          client as never,
          {
            operatingCompanyId: b.operating_company_id,
            settlementNo: b.settlement_no,
            actorUserId: user.uuid,
            reimbursementItems: b.reimbursement_items.map((r) => ({ ...r, load_number: r.load_number ?? null })),
            trailerEquipmentNumber: b.trailer_equipment_number ?? null,
            dryRun: b.dry_run,
          },
          (eventClass, payload) => appendCrudAudit(client as never, user.uuid, eventClass, payload, "info", "SC-443-66")
        );
      });
      return reply.code(200).send(result);
    } catch (err) {
      if (err instanceof CreatorCategorizationError) return reply.code(400).send({ error: err.code, message: err.message });
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
