import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { withCurrentUser } from "../auth/db.js";
import { requireAuth } from "../auth/session-middleware.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
// MNT-ECON-01 / SWEEP-C6: route purchases through the shared poster (createBill +
// postSourceTransaction / createJournalEntry). Flag OFF => inventory write only.
import { postPartsInventoryPurchase } from "../accounting/parts-inventory-posting/poster.service.js";
// MAINT-MONEY-F6956 — companyBusinessDate(), not new Date().toISOString() (UTC): after ~19:00
// Central the UTC calendar date has already rolled to tomorrow, which can post the parts-purchase
// JE on the wrong business date.
import { companyBusinessDate } from "../lib/company-business-date.js";

const querySchema = z.object({
  operating_company_id: z.string().uuid(),
  vendor_id: z.string().uuid().optional(),
});
const idParamsSchema = z.object({ id: z.string().uuid() });
const purchaseSchema = z.object({
  part_description: z.string().trim().min(1).max(250),
  // INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT: optional explicit SKU. When omitted, the route derives
  // a canonical key from part_description so two purchases of the textually-identical part upsert
  // the same stock row instead of fragmenting on-hand quantity across duplicate rows (the old bug).
  part_number: z.string().trim().max(120).optional(),
  vendor_id: z.string().uuid().optional(),
  vendor_invoice_number: z.string().trim().max(120).optional(),
  purchase_amount: z.number().nonnegative().optional(),
  qty_received: z.number().int().positive(),
  location: z.string().trim().max(120).optional(),
  work_order_id: z.string().uuid().optional(),
});
const adjustSchema = z.object({
  delta_qty: z.number().int(),
  reason: z.enum(["used", "discarded", "shrinkage", "recount"]),
});
const voidPurchaseSchema = z.object({
  void_reason: z.string().trim().min(1).max(500),
});

/** Canonical part identity when the caller doesn't supply an explicit SKU. */
function canonicalPartNumber(explicit: string | undefined, description: string): string {
  const trimmed = explicit?.trim();
  if (trimmed) return trimmed;
  return description.trim().toUpperCase();
}

function authed(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

type LinkValidationClient = {
  query: (sql: string, values?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;
};

export async function validatePartsPurchaseLinks(
  client: LinkValidationClient,
  companyId: string,
  vendorId: string | undefined,
  workOrderId: string | undefined
) {
  const links = await client.query(
    `SELECT
       ($2::uuid IS NULL OR EXISTS (
         SELECT 1 FROM mdata.vendors v
         WHERE v.id = $2::uuid AND v.operating_company_id = $1::uuid AND v.deactivated_at IS NULL
       )) AS vendor_ok,
       ($3::uuid IS NULL OR EXISTS (
         SELECT 1 FROM maintenance.work_orders wo
         WHERE wo.id = $3::uuid AND wo.operating_company_id = $1::uuid
       )) AS work_order_ok`,
    [companyId, vendorId ?? null, workOrderId ?? null]
  );
  const row = links.rows[0] as { vendor_ok?: boolean; work_order_ok?: boolean } | undefined;
  return Boolean(row?.vendor_ok && row.work_order_ok);
}

async function withCompany<T>(userId: string, companyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, companyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [companyId]);
    return fn(client);
  });
}

export async function registerMaintenancePartsInventoryRoutes(app: FastifyInstance) {
  app.get("/api/v1/maintenance/parts-inventory", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const vendorFilter = query.data.vendor_id ? "AND pi.vendor_id = $2::uuid" : "";
      if (query.data.vendor_id) values.push(query.data.vendor_id);
      // LV-INVENTORY-PARTS-DEACTIVATED-VENDOR-HISTORICAL-LABEL: the LEFT JOIN alone silently drops
      // a vendor row once it's deactivated (mdata.vendors' own RLS SELECT policy excludes any
      // deactivated_at IS NOT NULL row for a non-bypass reader) even though the FK is still valid —
      // the part still legitimately cites that vendor, it just isn't selectable for NEW work anymore.
      // mdata.resolve_vendor_label_same_company (migration 202612780000) is the canonical,
      // security-scoped fallback: same-company-only, label-only, used only when the join comes back
      // NULL. Active vendors keep resolving via the fast join exactly as before — unchanged.
      const res = await client.query(
        `SELECT pi.*,
                COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(pi.vendor_id, pi.operating_company_id)) AS vendor_name
         FROM maintenance.parts_inventory pi
         LEFT JOIN mdata.vendors v
           ON v.id = pi.vendor_id
          AND v.operating_company_id = pi.operating_company_id
         WHERE pi.operating_company_id = $1::uuid
           ${vendorFilter}
         ORDER BY pi.updated_at DESC, pi.created_at DESC`,
        values
      );
      return res.rows;
    });
    return { rows };
  });

  // GET purchase history — INV-PURCHASE-LEDGER-SOR-STOCK-UPSERT. The real append-only SoR;
  // maintenance.parts_inventory (above) stays a mutable on-hand snapshot, never purchase history.
  app.get("/api/v1/maintenance/parts-inventory/purchases", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const rows = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const values: unknown[] = [query.data.operating_company_id];
      const vendorFilter = query.data.vendor_id ? "AND pp.vendor_id = $2::uuid" : "";
      if (query.data.vendor_id) values.push(query.data.vendor_id);
      const res = await client.query(
        `SELECT pp.*, pi.part_description, pi.part_number,
                COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(pp.vendor_id, pp.operating_company_id)) AS vendor_name,
                wo.display_id AS work_order_display_id
         FROM maintenance.parts_purchases pp
         JOIN maintenance.parts_inventory pi ON pi.id = pp.parts_inventory_id
         LEFT JOIN mdata.vendors v
           ON v.id = pp.vendor_id AND v.operating_company_id = pp.operating_company_id
         LEFT JOIN maintenance.work_orders wo
           ON wo.id = pp.work_order_id AND wo.operating_company_id = pp.operating_company_id
         WHERE pp.operating_company_id = $1::uuid
           ${vendorFilter}
         ORDER BY pp.purchased_at DESC, pp.created_at DESC`,
        values
      );
      return res.rows;
    });
    return { rows };
  });

  app.get("/api/v1/maintenance/parts-inventory/purchases/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const row = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT pp.*, pi.part_description, pi.part_number,
                COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(pp.vendor_id, pp.operating_company_id)) AS vendor_name,
                wo.display_id AS work_order_display_id
         FROM maintenance.parts_purchases pp
         JOIN maintenance.parts_inventory pi ON pi.id = pp.parts_inventory_id
         LEFT JOIN mdata.vendors v
           ON v.id = pp.vendor_id AND v.operating_company_id = pp.operating_company_id
         LEFT JOIN maintenance.work_orders wo
           ON wo.id = pp.work_order_id AND wo.operating_company_id = pp.operating_company_id
         WHERE pp.operating_company_id = $1::uuid AND pp.id = $2::uuid
         LIMIT 1`,
        [query.data.operating_company_id, params.data.id]
      );
      return res.rows[0] ?? null;
    });
    if (!row) return reply.code(404).send({ error: "parts_purchase_not_found" });
    return row;
  });

  app.post("/api/v1/maintenance/parts-inventory/purchases", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = purchaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const partNumber = canonicalPartNumber(body.data.part_number, body.data.part_description);

    // Atomic: stock upsert + append-only purchase-event insert happen on the SAME connection
    // inside withCompany's transaction (withCurrentUser wraps the whole callback in BEGIN/COMMIT) —
    // either both land or neither does. Real identity = (operating_company_id, part_number); a
    // repeat purchase of the SAME part additively upserts on_hand_qty instead of fragmenting stock
    // across duplicate rows (the pre-fix behavior).
    const purchaseResult = await withCompany(
      user.uuid,
      query.data.operating_company_id,
      async (client) => {
        const linksValid = await validatePartsPurchaseLinks(
          client,
          query.data.operating_company_id,
          body.data.vendor_id,
          body.data.work_order_id
        );
        if (!linksValid) return null;

        const stock = await client.query(
          `
            INSERT INTO maintenance.parts_inventory (
              part_description, part_number, vendor_id, last_purchase_invoice_number,
              last_purchase_amount, last_purchase_date, on_hand_qty, location, operating_company_id
            )
            VALUES ($1,$2,$3,$4,$5,now()::date,$6,$7,$8)
            -- ACCT-F5704: the ON CONFLICT target's WHERE predicate must textually match the live
            -- unique index (uq_parts_inventory_company_part_number, 202612560000 section 2) exactly
            -- for Postgres to infer it as the arbiter — the index predicate wraps part_number in
            -- btrim(), this clause didn't, so Postgres could never match an arbiter index and every
            -- purchase with a non-null part_number 500'd with 42P10 (confirmed live on prod).
            ON CONFLICT (operating_company_id, part_number) WHERE part_number IS NOT NULL AND btrim(part_number) <> ''
            DO UPDATE SET
              on_hand_qty = maintenance.parts_inventory.on_hand_qty + EXCLUDED.on_hand_qty,
              last_purchase_invoice_number = EXCLUDED.last_purchase_invoice_number,
              last_purchase_amount = EXCLUDED.last_purchase_amount,
              last_purchase_date = EXCLUDED.last_purchase_date,
              vendor_id = COALESCE(EXCLUDED.vendor_id, maintenance.parts_inventory.vendor_id),
              location = COALESCE(EXCLUDED.location, maintenance.parts_inventory.location),
              updated_at = now()
            RETURNING *
          `,
          [
            body.data.part_description,
            partNumber,
            body.data.vendor_id ?? null,
            body.data.vendor_invoice_number ?? null,
            body.data.purchase_amount ?? null,
            body.data.qty_received,
            body.data.location ?? null,
            query.data.operating_company_id,
          ]
        );
        const stockRow = stock.rows[0];

        const amountCents =
          body.data.purchase_amount != null ? Math.round(body.data.purchase_amount * 100) : null;
        const purchase = await client.query(
          `
            INSERT INTO maintenance.parts_purchases (
              operating_company_id, parts_inventory_id, vendor_id, vendor_invoice_number,
              purchase_amount_cents, qty_received, work_order_id, created_by_user_id
            )
            VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5,$6,$7::uuid,$8::uuid)
            RETURNING *
          `,
          [
            query.data.operating_company_id,
            stockRow.id,
            body.data.vendor_id ?? null,
            body.data.vendor_invoice_number ?? null,
            amountCents,
            body.data.qty_received,
            body.data.work_order_id ?? null,
            user.uuid,
          ]
        );
        return { stockRow, purchaseRow: purchase.rows[0] };
      }
    );
    if (!purchaseResult) {
      return reply.code(400).send({ error: "linked_entity_not_in_operating_company" });
    }
    const { stockRow, purchaseRow } = purchaseResult;

    // MNT-ECON-01 economic hop — A/P bill + balanced JE behind PARTS_PURCHASE_GL_POSTING_ENABLED
    // (default OFF). Inventory + purchase-event rows are already committed; flag_off / zero_amount
    // are honest no-ops. Latch keys off the purchase EVENT (parts_purchase_id), not the upserted
    // stock row, so a second purchase of the same part still gets its own posting opportunity.
    const gl = await postPartsInventoryPurchase({
      operating_company_id: query.data.operating_company_id,
      parts_inventory_id: String(stockRow.id),
      parts_purchase_id: String(purchaseRow.id),
      actor_user_id: user.uuid,
      entry_date_iso: companyBusinessDate(),
      part_description: body.data.part_description,
      vendor_id: body.data.vendor_id ?? null,
      vendor_invoice_number: body.data.vendor_invoice_number ?? null,
      purchase_amount_dollars: body.data.purchase_amount ?? null,
    });

    return reply.code(201).send({ ...stockRow, purchase: purchaseRow, gl_posting: gl });
  });

  // Void a purchase event — void-not-delete. Symmetrically decrements the same stock row it
  // additively upserted, in the same transaction, so on-hand quantity never drifts.
  app.post("/api/v1/maintenance/parts-inventory/purchases/:id/void", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = voidPurchaseSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const existing = await client.query(
        `SELECT * FROM maintenance.parts_purchases
         WHERE id = $1::uuid AND operating_company_id = $2::uuid
         LIMIT 1
         FOR UPDATE`,
        [params.data.id, query.data.operating_company_id]
      );
      const purchase = existing.rows[0];
      if (!purchase) return { notFound: true as const };
      if (purchase.voided_at) return { alreadyVoided: true as const, row: purchase };

      // Reverse the purchase quantity exactly. Never clamp with GREATEST(0, ...): clamping would
      // mark the receipt void while removing fewer units than it originally added, permanently
      // drifting the mutable stock snapshot away from the append-only purchase ledger. Locking the
      // purchase row serializes duplicate void attempts; the conditional stock update fails closed
      // when some of the receipt has already been consumed and the full reversal is impossible.
      const stock = await client.query(
        `UPDATE maintenance.parts_inventory
         SET on_hand_qty = COALESCE(on_hand_qty, 0) - $2, updated_at = now()
         WHERE id = $1::uuid
           AND operating_company_id = $3::uuid
           AND COALESCE(on_hand_qty, 0) >= $2
         RETURNING on_hand_qty`,
        [purchase.parts_inventory_id, purchase.qty_received, query.data.operating_company_id]
      );
      if (!stock.rows[0]) {
        return {
          insufficientStock: true as const,
          qtyReceived: Number(purchase.qty_received),
        };
      }

      const voided = await client.query(
        `UPDATE maintenance.parts_purchases
         SET voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4
         WHERE id = $1::uuid AND operating_company_id = $2::uuid
         RETURNING *`,
        [params.data.id, query.data.operating_company_id, user.uuid, body.data.void_reason]
      );
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.parts_purchase.voided",
        {
          operating_company_id: query.data.operating_company_id,
          resource_id: params.data.id,
          resource_type: "maintenance.parts_purchases",
          void_reason: body.data.void_reason,
          qty_received: purchase.qty_received,
        },
        "warning"
      );
      return { row: voided.rows[0] };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "parts_purchase_not_found" });
    if ("alreadyVoided" in result) return reply.code(409).send({ error: "parts_purchase_already_voided", row: result.row });
    if ("insufficientStock" in result) {
      return reply.code(409).send({
        error: "parts_purchase_reversal_insufficient_stock",
        message: "This purchase cannot be voided because its full received quantity is no longer on hand.",
        qty_received: result.qtyReceived,
      });
    }
    return result.row;
  });

  app.patch("/api/v1/maintenance/parts-inventory/:id/adjust", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = authed(req, reply);
    if (!user) return;
    const params = idParamsSchema.safeParse(req.params ?? {});
    if (!params.success) return reply.code(400).send({ error: "validation_error", details: params.error.flatten() });
    const query = querySchema.safeParse(req.query ?? {});
    if (!query.success) return reply.code(400).send({ error: "validation_error", details: query.error.flatten() });
    const body = adjustSchema.safeParse(req.body ?? {});
    if (!body.success) return reply.code(400).send({ error: "validation_error", details: body.error.flatten() });

    const result = await withCompany(user.uuid, query.data.operating_company_id, async (client) => {
      const res = await client.query(
        `
          UPDATE maintenance.parts_inventory
          SET on_hand_qty = GREATEST(0, COALESCE(on_hand_qty, 0) + $3), updated_at = now()
          WHERE id = $1 AND operating_company_id = $2::uuid
          RETURNING *
        `,
        [params.data.id, query.data.operating_company_id, body.data.delta_qty]
      );
      const row = res.rows[0];
      if (!row) return { notFound: true as const };
      await appendCrudAudit(
        client,
        user.uuid,
        "maintenance.parts_inventory.adjusted",
        {
          operating_company_id: query.data.operating_company_id,
          resource_id: params.data.id,
          reason: body.data.reason,
          delta_qty: body.data.delta_qty,
          on_hand_qty: row.on_hand_qty,
        },
        body.data.reason === "shrinkage" ? "warning" : "info",
        "BT-3-WO-FORMAT-VENDOR-INVENTORY-INTEGRITY"
      );
      return { row };
    });

    if ("notFound" in result) return reply.code(404).send({ error: "parts_inventory_not_found" });
    return result.row;
  });
}
