import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { listFactorReserveBalances, postFactoringFeeExpenseEvent } from "./factoring-fees-posting/poster.service.js";
import { postFactoringAdvanceEvent, postFactoringCustomerPaymentEvent, postFactoringReleaseEvent } from "./factoring-posting/poster.service.js";
import {
  getFactoringAdvancePacket,
  getFactoringReserveRollup,
  listFactoringReserveBalances as listFactoringReserveBalancesByAdvance,
} from "./factoring-posting/reserve-tracker.service.js";
import { nextFactoringDisplayId } from "./display-id.js";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { requireVoidCancelExecutor } from "../lib/authz/void-cancel-authz.js";

const idParamsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = companyQuerySchema.extend({
  status: z
    .enum(["submitted", "advanced", "reserve_held", "collected", "released", "recourse_returned", "voided", "all"])
    .optional()
    .default("all"),
  factoring_company_vendor_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  search: z.string().trim().optional(),
  // LINK-F5171/LINK-F5184: factoring:accounting.list reverse — a load can find its own advance
  // batch(es) via the invoice it was submitted through (accounting.invoices.factoring_advance_id).
  load_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

const createBodySchema = z.object({
  factoring_company_vendor_id: z.string().uuid(),
  submission_batch_ref: z.string().trim().max(200).optional(),
  invoice_ids: z.array(z.string().uuid()).min(1).max(500),
  advance_rate_pct: z.coerce.number().min(0).max(100),
  reserve_pct: z.coerce.number().min(0).max(100),
  factor_fee_pct: z.coerce.number().min(0).max(100).optional().default(0),
  notes: z.string().trim().max(5000).optional(),
});

const advanceBodySchema = z.object({
  advanced_at: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const reserveHeldBodySchema = z.object({
  collected_at: z.string().datetime().optional(),
  notes: z.string().trim().max(5000).optional(),
});

const releaseBodySchema = z.object({
  released_at: z.string().datetime().optional(),
  factor_fee_cents: z.coerce.number().int().min(0),
  release_amount_cents: z.coerce.number().int().min(0),
  notes: z.string().trim().max(5000).optional(),
});

const recourseBodySchema = z.object({
  recourse_returned_at: z.string().datetime().optional(),
  recourse_reason: z.string().trim().min(3).max(500),
});

const voidBodySchema = z.object({
  reason: z.string().trim().min(3).max(500).optional(),
});

async function fetchAdvanceDetail(client: any, advanceId: string) {
  const advanceRes = await client.query(
    `
      SELECT
        fa.*,
        v.vendor_name AS factoring_company_name,
        (
          SELECT COUNT(*)
          FROM accounting.invoices i2
          WHERE i2.factoring_advance_id = fa.id
            AND i2.operating_company_id = fa.operating_company_id
        )::int AS invoice_count
      FROM accounting.factoring_advances fa
      -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): the advance is scoped, the factoring-company
      -- vendor it names was not. This supplies the vendor NAME shown on the advance.
      JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
                          AND v.operating_company_id = fa.operating_company_id
      WHERE fa.id = $1
      LIMIT 1
    `,
    [advanceId]
  );
  const advance = advanceRes.rows[0] ?? null;
  if (!advance) return null;

  const invoicesRes = await client.query(
    `
      SELECT
        i.id,
        i.display_id,
        i.customer_id,
        c.customer_name,
        i.issue_date,
        i.total_cents,
        i.factoring_status
      FROM accounting.invoices i
      JOIN mdata.customers c ON c.id = i.customer_id
                            AND c.operating_company_id = i.operating_company_id
      WHERE i.factoring_advance_id = $1
        -- ENTITY PREDICATE (CLS-JOIN-ENTITY-UNSCOPED): i itself was read by factoring_advance_id alone,
        -- with no tie back to a company. advance.operating_company_id is already in scope from the
        -- fetch immediately above (same function, no new bind/parameter needed).
        AND i.operating_company_id = $2::uuid
      ORDER BY i.issue_date DESC, i.created_at DESC
    `,
    [advanceId, advance.operating_company_id]
  );

  return {
    ...advance,
    invoice_total_cents: Number(advance.invoice_total_cents ?? 0),
    advance_rate_pct: Number(advance.advance_rate_pct ?? 0),
    advance_amount_cents: Number(advance.advance_amount_cents ?? 0),
    reserve_pct: Number(advance.reserve_pct ?? 0),
    reserve_amount_cents: Number(advance.reserve_amount_cents ?? 0),
    factor_fee_pct: Number(advance.factor_fee_pct ?? 0),
    factor_fee_cents: Number(advance.factor_fee_cents ?? 0),
    release_amount_cents: Number(advance.release_amount_cents ?? 0),
    invoice_count: Number(advance.invoice_count ?? 0),
    invoices: invoicesRes.rows.map((row: Record<string, unknown>) => ({
      ...row,
      total_cents: Number(row.total_cents ?? 0),
    })),
  };
}

export async function registerFactoringAdvancesRoutes(app: FastifyInstance) {
  app.get("/api/v1/accounting/factoring-reserve-balances", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const payload = await listFactorReserveBalances({
      operating_company_id: query.data.operating_company_id,
    });
    return payload;
  });

  // CONN-2 — Faro Reserve Tracker (per-advance, structural ledger — accounting.factoring_reserve_movements,
  // migration 202607130000, HELD). Complements the customer-level estimate above (which splits
  // reserve_amount_cents/release_amount_cents proportionally off the advance header, no JE linkage) with
  // the true per-advance HELD/RELEASED events and their journal_entry_id. Read-only; not flag-gated.
  app.get("/api/v1/accounting/factoring-advances/reserve-tracker", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const [balances, rollup] = await Promise.all([
      listFactoringReserveBalancesByAdvance(query.data.operating_company_id),
      getFactoringReserveRollup(query.data.operating_company_id),
    ]);
    return { rollup, advances: balances };
  });

  // CONN-2 — Advance Packet: advance header + linked invoices/loads + reserve ledger + interest ledger in
  // one read (Law of the Land §10a forward+reverse drill-through). Read-only; not flag-gated.
  app.get("/api/v1/accounting/factoring-advances/:id/packet", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const packet = await getFactoringAdvancePacket(query.data.operating_company_id, params.data.id);
    if (!packet) return reply.code(404).send({ error: "factoring_advance_not_found" });
    return packet;
  });

  // Rate-limited (CodeQL js/missing-rate-limiting). Pre-existing gap surfaced because this PR touched
  // the file; the plugin is registered global:false, so an un-configured route has NO limit at all.
  app.get("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = listQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const q = query.data;

    const rows = await withCompanyScope(user.uuid, q.operating_company_id, async (client) => {
      const where: string[] = ["fa.operating_company_id = $1::uuid"];
      const values: unknown[] = [q.operating_company_id];
      if (q.status && q.status !== "all") {
        values.push(q.status);
        where.push(`fa.status = $${values.length}`);
      }
      if (q.factoring_company_vendor_id) {
        values.push(q.factoring_company_vendor_id);
        where.push(`fa.factoring_company_vendor_id = $${values.length}`);
      }
      if (q.date_from) {
        values.push(q.date_from);
        where.push(`fa.submitted_at >= $${values.length}::date`);
      }
      if (q.date_to) {
        values.push(q.date_to);
        where.push(`fa.submitted_at <= $${values.length}::date + interval '1 day' - interval '1 second'`);
      }
      if (q.search) {
        values.push(`%${q.search}%`);
        const idx = values.length;
        where.push(`(fa.display_id ILIKE $${idx} OR COALESCE(fa.submission_batch_ref, '') ILIKE $${idx})`);
      }
      if (q.load_id) {
        values.push(q.load_id);
        where.push(
          `EXISTS (
             SELECT 1 FROM accounting.invoices i
             WHERE i.factoring_advance_id = fa.id
               AND i.operating_company_id = fa.operating_company_id
               AND i.source_load_id = $${values.length}::uuid
           )`
        );
      }
      values.push(q.limit);
      const limitIdx = values.length;

      const res = await client.query(
        `
          SELECT
            fa.*,
            v.vendor_name AS factoring_company_name,
            (
              SELECT COUNT(*)
              FROM accounting.invoices i
              WHERE i.factoring_advance_id = fa.id
                AND i.operating_company_id = fa.operating_company_id
            )::int AS invoice_count
          FROM accounting.factoring_advances fa
          JOIN mdata.vendors v ON v.id = fa.factoring_company_vendor_id
                              AND v.operating_company_id = fa.operating_company_id
          WHERE ${where.join(" AND ")}
          ORDER BY fa.submitted_at DESC, fa.created_at DESC
          LIMIT $${limitIdx}
        `,
        values
      );
      return res.rows;
    });

    return {
      rows: rows.map((row: Record<string, unknown>) => ({
        ...row,
        invoice_total_cents: Number(row.invoice_total_cents ?? 0),
        advance_rate_pct: Number(row.advance_rate_pct ?? 0),
        advance_amount_cents: Number(row.advance_amount_cents ?? 0),
        reserve_pct: Number(row.reserve_pct ?? 0),
        reserve_amount_cents: Number(row.reserve_amount_cents ?? 0),
        factor_fee_pct: Number(row.factor_fee_pct ?? 0),
        factor_fee_cents: Number(row.factor_fee_cents ?? 0),
        release_amount_cents: Number(row.release_amount_cents ?? 0),
        invoice_count: Number(row.invoice_count ?? 0),
      })),
    };
  });

  app.get("/api/v1/accounting/factoring-advances/candidate-invoices", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const rows = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          SELECT
            i.id,
            i.display_id,
            i.customer_id,
            c.customer_name,
            i.issue_date,
            i.total_cents,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            COALESCE(c.factoring_recourse_type, 'recourse') AS customer_recourse_type,
            c.factoring_eligible
          FROM accounting.invoices i
          JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          WHERE i.operating_company_id = $1::uuid
            AND i.status = 'sent'
            AND i.voided_at IS NULL
            AND COALESCE(i.factoring_status, 'not_factored') = 'not_factored'
            AND c.factoring_eligible = true
          ORDER BY i.issue_date DESC, i.created_at DESC
          LIMIT 500
        `,
        [query.data.operating_company_id]
      );
      return res.rows;
    });

    return {
      rows: rows.map((row: Record<string, unknown>) => ({
        ...row,
        total_cents: Number(row.total_cents ?? 0),
      })),
    };
  });

  app.get("/api/v1/accounting/factoring-advances/:id", async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);

    const detail = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      return fetchAdvanceDetail(client, params.data.id);
    });
    if (!detail) return reply.code(404).send({ error: "factoring_advance_not_found" });
    return detail;
  });

  app.post("/api/v1/accounting/factoring-advances", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // ACCT-F5578: this route (and 4 siblings below) had no role gate -- currentAuthUser only requires
    // a session. Reusing the file's own void/cancel executor role set (Owner/Administrator/Accountant,
    // Jorge-locked 2026-06-29) since creating/advancing/holding/releasing a factoring advance is the
    // same tier of financial-executor operation as this file's own already-gated void route.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = createBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const vendorRes = await client.query(
        `
          SELECT id
          FROM mdata.vendors
          WHERE id = $1
            AND operating_company_id = $2::uuid
            AND deactivated_at IS NULL
          LIMIT 1
        `,
        [body.data.factoring_company_vendor_id, query.data.operating_company_id]
      );
      if (!vendorRes.rows[0]) return { code: 404 as const, error: "factoring_vendor_not_found" };

      const invoiceRes = await client.query(
        `
          SELECT
            i.id,
            i.customer_id,
            i.total_cents,
            i.status,
            COALESCE(i.factoring_status, 'not_factored') AS factoring_status,
            c.factoring_eligible
          FROM accounting.invoices i
          JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          WHERE i.operating_company_id = $1::uuid
            AND i.id = ANY($2::uuid[])
        `,
        [query.data.operating_company_id, body.data.invoice_ids]
      );
      if (invoiceRes.rows.length !== body.data.invoice_ids.length) return { code: 404 as const, error: "invoice_not_found" };
      for (const row of invoiceRes.rows as Array<Record<string, unknown>>) {
        if (String(row.status) !== "sent") return { code: 409 as const, error: "invoice_not_sent" };
        if (String(row.factoring_status) !== "not_factored") return { code: 409 as const, error: "invoice_already_factored" };
        if (!row.factoring_eligible) return { code: 409 as const, error: "customer_not_factoring_eligible" };
      }

      const invoiceTotalCents = invoiceRes.rows.reduce((sum: number, row: Record<string, unknown>) => sum + Number(row.total_cents ?? 0), 0);
      const advanceAmount = Math.round((invoiceTotalCents * Number(body.data.advance_rate_pct)) / 100);
      const reserveAmount = Math.max(0, invoiceTotalCents - advanceAmount);
      const displayId = await nextFactoringDisplayId(client, query.data.operating_company_id, new Date());

      const insertRes = await client.query(
        `
          INSERT INTO accounting.factoring_advances (
            operating_company_id,
            factoring_company_vendor_id,
            display_id,
            status,
            submission_batch_ref,
            invoice_total_cents,
            advance_rate_pct,
            advance_amount_cents,
            reserve_pct,
            reserve_amount_cents,
            factor_fee_pct,
            notes,
            memo,
            created_by_user_id
          )
          VALUES ($1,$2,$3,'submitted',$4,$5,$6,$7,$8,$9,$10,$11,$11,$12)
          RETURNING id
        `,
        [
          query.data.operating_company_id,
          body.data.factoring_company_vendor_id,
          displayId,
          body.data.submission_batch_ref ?? null,
          invoiceTotalCents,
          body.data.advance_rate_pct,
          advanceAmount,
          body.data.reserve_pct,
          reserveAmount,
          body.data.factor_fee_pct ?? 0,
          body.data.notes ?? null,
          user.uuid,
        ]
      );
      const advanceId = String(insertRes.rows[0]?.id ?? "");
      if (!advanceId) return { code: 500 as const, error: "factoring_advance_create_failed" };

      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_advance_id = $2,
              factoring_status = 'submitted',
              updated_at = now(),
              updated_by_user_id = $3
          WHERE operating_company_id = $1::uuid
            AND id = ANY($4::uuid[])
        `,
        [query.data.operating_company_id, advanceId, user.uuid, body.data.invoice_ids]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_submitted",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: advanceId,
          operating_company_id: query.data.operating_company_id,
          display_id: displayId,
          invoice_count: body.data.invoice_ids.length,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );

      const detail = await fetchAdvanceDetail(client, advanceId);
      return { code: 201 as const, data: detail };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return reply.code(result.code).send(result.data);
  });

  app.post("/api/v1/accounting/factoring-advances/:id/advance", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = advanceBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (String(advance.status) !== "submitted") return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const at = body.data.advanced_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'advanced',
              advanced_at = $2::timestamptz,
              notes = COALESCE($3, notes)
          WHERE id = $1
        `,
        [params.data.id, at, body.data.notes ?? null]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'advanced',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      await postFactoringAdvanceEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        advanced_at_iso: at,
      });

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_advanced",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );
      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id) };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/reserve-held", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = reserveHeldBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["advanced", "submitted"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const collectedAt = body.data.collected_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'reserve_held',
              collected_at = $2::timestamptz,
              notes = COALESCE($3, notes)
          WHERE id = $1
        `,
        [params.data.id, collectedAt, body.data.notes ?? null]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'reserve_held',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      // WIRE the built-but-unwired customer-payment poster (Law of the Land: no built-but-unwired poster).
      // The reserve_held transition IS the "customer paid the factor directly" event (notification
      // factoring): the collected_at is stamped here. Under the secured-borrowing model this is the ONLY
      // place A/R goes down — Dr Factoring-Advance-Liability / Cr A/R, for the full pledged invoice Net
      // (invoice_total_cents = the amount the customer pays Faro). Flag-gated + idempotent inside the poster;
      // a flag-OFF entity no-ops. Any default interest that compounded into the liability (late payment) is
      // intentionally left outstanding — the customer only ever pays the invoice face; the residual accrued
      // interest is the Seller's to settle with Faro (see PR body / open item).
      await postFactoringCustomerPaymentEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        amount_cents: Number(advance.invoice_total_cents ?? 0),
        paid_at_iso: collectedAt,
      });
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_reserve_held",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );
      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id) };
    });
    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/release", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = releaseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["reserve_held", "collected"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const invoicesRes = await client.query(
        `
          SELECT id, customer_id, total_cents
          FROM accounting.invoices
          WHERE factoring_advance_id = $1
            AND operating_company_id = $2::uuid
          ORDER BY issue_date ASC, created_at ASC
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const invoices = invoicesRes.rows.map((row: Record<string, unknown>) => ({
        invoice_id: String(row.id),
        customer_id: String(row.customer_id),
        total_cents: Number(row.total_cents ?? 0),
      }));
      if (invoices.length === 0) return { code: 409 as const, error: "factoring_advance_has_no_invoices" };

      const releasedAt = body.data.released_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'released',
              released_at = $2::timestamptz,
              factor_fee_cents = $3,
              release_amount_cents = $4,
              notes = COALESCE($5, notes)
          WHERE id = $1
        `,
        [params.data.id, releasedAt, body.data.factor_fee_cents, body.data.release_amount_cents, body.data.notes ?? null]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'released',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      await postFactoringReleaseEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        actor_user_id: user.uuid,
        released_at_iso: releasedAt,
        release_amount_cents: Number(body.data.release_amount_cents ?? 0),
        factor_fee_cents: Number(body.data.factor_fee_cents ?? 0),
      });
      await postFactoringFeeExpenseEvent({
        operating_company_id: query.data.operating_company_id,
        factoring_advance_id: params.data.id,
        factor_fee_cents: Number(body.data.factor_fee_cents ?? 0),
        released_at_iso: releasedAt,
        actor: {
          user_id: user.uuid,
          role: user.role,
        },
      });

      const invoiceTotal = Number(advance.invoice_total_cents ?? 0);
      const advanceTotal = Number(advance.advance_amount_cents ?? 0);
      const reserveTotal = Number(advance.reserve_amount_cents ?? 0);

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_released",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          invoice_total_cents: invoiceTotal,
          advance_amount_cents: advanceTotal,
          reserve_amount_cents: reserveTotal,
          release_amount_cents: body.data.release_amount_cents,
          factor_fee_cents: body.data.factor_fee_cents,
        },
        "info",
        "P3-T11.20.5-FACTORING"
      );

      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id) };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/recourse-return", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // ACCT-F5578: see the create route above for why this reuses the void/cancel executor role set.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = recourseBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (["released", "voided"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      const recourseRes = await client.query(
        `
          SELECT BOOL_AND(COALESCE(c.factoring_recourse_type, 'recourse') = 'recourse') AS all_recourse
          FROM accounting.invoices i
          JOIN mdata.customers c ON c.id = i.customer_id
                                AND c.operating_company_id = i.operating_company_id
          WHERE i.factoring_advance_id = $1
            AND i.operating_company_id = $2::uuid
        `,
        [params.data.id, query.data.operating_company_id]
      );
      const allRecourse = Boolean(recourceResRow(recourseRes.rows[0]).all_recourse);
      if (!allRecourse) return { code: 409 as const, error: "non_recourse_customer_cannot_recourse_return" };

      const returnedAt = body.data.recourse_returned_at ?? new Date().toISOString();
      await client.query(
        `
          UPDATE accounting.factoring_advances
          SET status = 'recourse_returned',
              recourse_returned_at = $2::timestamptz,
              recourse_reason = $3
          WHERE id = $1
        `,
        [params.data.id, returnedAt, body.data.recourse_reason]
      );
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'recourse_returned',
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );

      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_recourse",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          recourse_reason: body.data.recourse_reason,
        },
        "warning",
        "P3-T11.20.5-FACTORING"
      );

      return { code: 200 as const, data: await fetchAdvanceDetail(client, params.data.id) };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });

  app.post("/api/v1/accounting/factoring-advances/:id/void", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    // G9-C3: voiding a factoring advance is an EXECUTOR-only action (Owner|Administrator|Accountant).
    // Route through the shared governance authz — OUTSIDE any feature flag — so anyone else must FILE a
    // void/cancel request for approval. Non-executors get the canonical 403 here.
    if (!requireVoidCancelExecutor(reply, String(user.role ?? ""))) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return validationError(reply, params.error);
    const query = companyQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return validationError(reply, query.error);
    const body = voidBodySchema.safeParse(req.body ?? {});
    if (!body.success) return validationError(reply, body.error);

    const result = await withCompanyScope(user.uuid, query.data.operating_company_id, async (client) => {
      const advanceRes = await client.query(`SELECT * FROM accounting.factoring_advances WHERE id = $1 AND operating_company_id = $2::uuid LIMIT 1`, [
        params.data.id,
        query.data.operating_company_id,
      ]);
      const advance = advanceRes.rows[0] ?? null;
      if (!advance) return { code: 404 as const, error: "factoring_advance_not_found" };
      if (!["submitted", "advanced"].includes(String(advance.status))) return { code: 409 as const, error: "factoring_status_invalid_transition" };

      await client.query(`UPDATE accounting.factoring_advances SET status = 'voided', notes = COALESCE($2, notes) WHERE id = $1`, [
        params.data.id,
        body.data.reason ?? null,
      ]);
      await client.query(
        `
          UPDATE accounting.invoices
          SET factoring_status = 'not_factored',
              factoring_advance_id = NULL,
              updated_at = now(),
              updated_by_user_id = $2
          WHERE factoring_advance_id = $1
        `,
        [params.data.id, user.uuid]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "accounting.factoring_voided",
        {
          resource_type: "accounting.factoring_advances",
          resource_id: params.data.id,
          operating_company_id: query.data.operating_company_id,
          reason: body.data.reason ?? null,
        },
        "warning",
        "P3-T11.20.5-FACTORING"
      );
      return { code: 200 as const, data: { ok: true } };
    });

    if ("error" in result) return reply.code(result.code).send({ error: result.error });
    return result.data;
  });
}

function recourceResRow(row: Record<string, unknown> | undefined) {
  return { all_recourse: row?.all_recourse };
}


export default fp(async (app) => {
  await registerFactoringAdvancesRoutes(app);
}, { name: "accounting.registerFactoringAdvancesRoutes" });
