import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { withCurrentUser } from "../auth/db.js";
import { assertCompanyMembership } from "../_helpers/company-membership-guard.js";
import { requireAuth } from "../auth/session-middleware.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { flushFuelGlPostsAfterCommit } from "../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js";
import { canVoidCancel } from "../lib/authz/void-cancel-authz.js";

// A10 — GET list read-model for the frontend FuelTransactionsTable
// (apps/frontend/src/pages/fuel/FuelTransactionsTable.tsx), which takes a `rows: FuelTransactionRow[]`
// prop (id, transaction_date, driver_name, gallons, amount_cents, station) but had no fetch hook / API
// call wired to it yet — fuel.fuel_transactions (0300 + 202607050840) had a writer (FUEL-1 import) but
// no list reader. Read-only, entity-scoped, paginated; joins driver/unit/load/vendor for names + also
// returns the raw ids so a consumer can drill through (Law of the Land — total connectivity).

const listFuelTransactionsQuerySchema = z.object({
  operating_company_id: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  transaction_id: z.string().uuid().optional(),
  driver_id: z.string().uuid().optional(),
  unit_id: z.string().uuid().optional(),
  // EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING (CC-2 finding #6337) — trailer_id is a real, populated
  // column since rank 1 (PR #6316) and the create path already accepts it (rank 3, PR #6319); the
  // list endpoint never did. Mirrors #6324's accident list filter exactly.
  trailer_id: z.string().uuid().optional(),
  load_id: z.string().uuid().optional(),
  /** G18 worklist: only transactions with NO load attributed. */
  unlinked: z.coerce.boolean().optional(),
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

const idParamSchema = z.object({ id: z.string().uuid() });

/**
 * RANK3-FUEL-OFFICE-POST-CREATE — manual office entry of a single fuel purchase. Mirrors the bulk
 * importer's shape (fuel-transaction-import.ts INSERT column list, verified live) but for one
 * office-keyed row instead of a spreadsheet: same fuel_type/source CHECK constraints (verified live
 * on prod), same G18 load-attribution discipline as the PATCH /:id/load endpoint below (a load OR a
 * stated exemption reason — never a silent unattributed row), same cash_advance -> driver_advance
 * GL posting-path signal already established in maybe-post-from-fuel-transaction.service.ts.
 * source is always 'manual' — this is the office-entry path, never labeled as an import.
 */
const createFuelTransactionBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    transaction_at: z.string().datetime({ offset: true }).or(z.string().date()),
    driver_id: z.string().uuid().nullable().optional(),
    unit_id: z.string().uuid().nullable().optional(),
    trailer_id: z.string().uuid().nullable().optional(),
    vendor_id: z.string().uuid().nullable().optional(),
    fuel_card_id: z.string().uuid().nullable().optional(),
    fuel_type: z.enum(["diesel", "def", "gas", "reefer_diesel", "other"]).default("diesel"),
    gallons: z.coerce.number().positive().optional(),
    price_per_gallon: z.coerce.number().positive().optional(),
    total_cost: z.coerce.number().positive(),
    location_city: z.string().trim().max(200).optional(),
    location_state: z.string().trim().max(10).optional(),
    transaction_reference: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
    load_id: z.string().uuid().nullable().optional(),
    load_exemption_reason: z.string().trim().min(3).max(200).optional(),
    /** True when this purchase draws down a driver's fuel cash advance rather than company-direct. */
    cash_advance: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.load_id) || Boolean(v.load_exemption_reason), {
    message: "load_id or load_exemption_reason is required — an unattributed fuel purchase needs a stated reason (G18)",
    path: ["load_exemption_reason"],
  });
/**
 * `load_id: null` DETACHES, and then an exemption_reason is REQUIRED — an unattributed fuel expense
 * with no stated reason is exactly the silent gap G18 exists to prevent.
 */
const assignLoadBodySchema = z
  .object({
    operating_company_id: z.string().uuid(),
    load_id: z.string().uuid().nullable(),
    exemption_reason: z.string().trim().min(3).max(200).optional(),
  })
  .refine((v) => v.load_id !== null || Boolean(v.exemption_reason), {
    message: "exemption_reason is required when detaching a fuel transaction from its load",
    path: ["exemption_reason"],
  });

function currentAuthUser(req: FastifyRequest, reply: FastifyReply) {
  if (!requireAuth(req, reply)) return null;
  return req.user;
}

function sendValidationError(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({ error: "validation_error", details: error.flatten() });
}

async function withCompanyScope<T>(userId: string, operatingCompanyId: string, fn: (client: any) => Promise<T>) {
  await assertCompanyMembership(userId, operatingCompanyId);
  return withCurrentUser(userId, async (client) => {
    await client.query("SELECT set_config('app.operating_company_id', $1::text, true)", [operatingCompanyId]);
    return fn(client);
  });
}

// ACCT-F5586: POST /fuel/transactions (manual office create -- a real expense that can trigger a
// real GL posting via flushFuelGlPostsAfterCommit when EXPENSE_GL_POSTING_ENABLED is on) and PATCH
// /:id/load (reassigns which load a real fuel cost is attributed to) had no role gate at all --
// currentAuthUser only requires a session. Reuses the canonical void/cancel executor role predicate
// (Owner/Administrator/Accountant), matching accounting/expenses.routes.ts's own accountingRoles for
// the same class of financial-write operation.
function requireFuelWriteRole(reply: FastifyReply, role: string) {
  if (!canVoidCancel(role)) {
    reply.code(403).send({ error: "forbidden", detail: "creating or re-attributing a fuel transaction requires an accounting role" });
    return false;
  }
  return true;
}

export async function registerFuelTransactionsRoutes(app: FastifyInstance) {
  // List fuel.fuel_transactions for the FuelTransactionsTable / transaction-register surfaces.
  // Entity-scoped via app.operating_company_id (RLS policy fuel_tx_company_isolation, migration 0300).
  app.get("/api/v1/fuel/transactions", { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    const query = listFuelTransactionsQuerySchema.safeParse(req.query ?? {});
    if (!query.success) return sendValidationError(reply, query.error);
    const q = query.data;

    const result = await withCompanyScope(authUser.uuid, q.operating_company_id, async (client) => {
      const tableExists = await client.query(
        `SELECT to_regclass('fuel.fuel_transactions') IS NOT NULL AS ok`
      );
      if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) return { unavailable: true as const };

      const values: unknown[] = [q.operating_company_id];
      const filters: string[] = ["ft.operating_company_id = $1::uuid", "ft.archived_at IS NULL"];
      if (q.transaction_id) {
        values.push(q.transaction_id);
        filters.push(`ft.id = $${values.length}::uuid`);
      }
      if (q.driver_id) {
        values.push(q.driver_id);
        filters.push(`ft.driver_id = $${values.length}`);
      }
      if (q.unit_id) {
        values.push(q.unit_id);
        filters.push(`ft.unit_id = $${values.length}`);
      }
      if (q.trailer_id) {
        values.push(q.trailer_id);
        filters.push(`ft.trailer_id = $${values.length}`);
      }
      if (q.load_id) {
        values.push(q.load_id);
        filters.push(`ft.load_id = $${values.length}`);
      }
      // The G18 worklist. Without this the 1,547 unattributed transactions ($625,546.39 on prod
      // 2026-08-03) are individually visible but cannot be listed AS the backlog they are.
      if (q.unlinked) {
        filters.push("ft.load_id IS NULL");
      }
      if (q.from) {
        values.push(q.from);
        filters.push(`ft.transaction_at::date >= $${values.length}::date`);
      }
      if (q.to) {
        values.push(q.to);
        filters.push(`ft.transaction_at::date <= $${values.length}::date`);
      }
      const whereClause = `WHERE ${filters.join(" AND ")}`;

      const countRes = await client.query(
        `SELECT count(*)::int AS total FROM fuel.fuel_transactions ft ${whereClause}`,
        values
      );

      values.push(q.limit);
      values.push(q.offset);
      const limitIdx = values.length - 1;
      const offsetIdx = values.length;

      const rowsRes = await client.query(
        `
          SELECT
            ft.id,
            ft.transaction_at,
            ft.purchased_at,
            ft.load_id,
            l.load_number,
            ft.driver_id,
            COALESCE(
              NULLIF(TRIM(CONCAT(COALESCE(d.first_name, ''), ' ', COALESCE(d.last_name, ''))), ''),
              mdata.resolve_driver_label_same_company(ft.driver_id, ft.operating_company_id)
            ) AS driver_name,
            ft.unit_id,
            u.unit_number,
            ft.trailer_id,
            tr.equipment_number AS trailer_number,
            ft.vendor_id,
            COALESCE(
              v.vendor_name,
              mdata.resolve_vendor_label_same_company(ft.vendor_id, ft.operating_company_id)
            ) AS vendor_name,
            ft.fuel_type,
            ft.gallons,
            ft.price_per_gallon,
            ft.total_cost,
            ft.location_city,
            ft.location_state,
            ft.source,
            ft.load_required,
            ft.load_exemption_reason,
            ft.created_at
          FROM fuel.fuel_transactions ft
          -- Entity-scope the joins to the SAME company as the transaction (defense in depth: a
          -- load_id/driver_id/unit_id should never point cross-company, but never trust that silently).
          LEFT JOIN mdata.loads l ON l.id = ft.load_id AND l.operating_company_id = ft.operating_company_id
          LEFT JOIN mdata.drivers d ON d.id = ft.driver_id AND d.operating_company_id = ft.operating_company_id
          LEFT JOIN mdata.units u ON u.id = ft.unit_id
            AND (u.owner_company_id = ft.operating_company_id OR u.currently_leased_to_company_id = ft.operating_company_id)
          LEFT JOIN mdata.equipment tr ON tr.id = ft.trailer_id
            AND (tr.owner_company_id = ft.operating_company_id OR tr.currently_leased_to_company_id = ft.operating_company_id)
          LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
                                    AND v.operating_company_id = ft.operating_company_id
          ${whereClause}
          ORDER BY ft.transaction_at DESC
          LIMIT $${limitIdx}
          OFFSET $${offsetIdx}
        `,
        values
      );

      return {
        rows: rowsRes.rows.map((row: Record<string, unknown>) => ({
          id: row.id,
          // FuelTransactionRow shape:
          transaction_date: row.transaction_at,
          driver_name: (row.driver_name as string | null) ?? "Unassigned",
          // gallons is nullable in the canonical table: imported/manual rows can carry a real
          // total cost before volume is known. Preserve that distinction for every mounted
          // history/reverse/export consumer instead of manufacturing a measured zero.
          gallons: row.gallons === null ? null : Number(row.gallons),
          amount_cents: Math.round(Number(row.total_cost ?? 0) * 100),
          station:
            (row.vendor_name as string | null) ??
            ([row.location_city, row.location_state].filter(Boolean).join(", ") || "Unknown"),
          // Drill-through linkage (Law of the Land — total connectivity): raw ids/refs alongside the
          // display shape so a consumer can link to the driver/unit/load without a second lookup.
          driver_id: row.driver_id,
          unit_id: row.unit_id,
          unit_number: row.unit_number,
          trailer_id: row.trailer_id,
          trailer_number: row.trailer_number,
          load_id: row.load_id,
          load_number: row.load_number,
          vendor_id: row.vendor_id,
          vendor_name: row.vendor_name,
          fuel_type: row.fuel_type,
          price_per_gallon: row.price_per_gallon === null ? null : Number(row.price_per_gallon),
          source: row.source,
          load_required: row.load_required,
          load_exemption_reason: row.load_exemption_reason,
          purchased_at: row.purchased_at,
          created_at: row.created_at,
        })),
        total: Number((countRes.rows[0] as { total?: number } | undefined)?.total ?? 0),
      };
    });

    if ("unavailable" in result) {
      return reply.code(501).send({ error: "fuel_transactions_unavailable" });
    }
    return {
      transactions: result.rows,
      total_count: result.total,
      has_more: q.offset + q.limit < result.total,
    };
  });
  /**
   * RANK3-FUEL-OFFICE-POST-CREATE — manual office entry of a single fuel purchase. Until this route,
   * fuel.fuel_transactions had a bulk-import writer (POST /api/v1/fuel/transactions/import) and a
   * load-assignment writer (PATCH /:id/load below) but no way for an office user to key in ONE
   * purchase by hand — verified live before building (grepped this file: GET + PATCH only).
   */
  app.post("/api/v1/fuel/transactions", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const body = createFuelTransactionBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;
    const amountCents = Math.round(b.total_cost * 100);

    const result = await withCompanyScope(authUser.uuid, b.operating_company_id, async (client) => {
      const tableExists = await client.query(`SELECT to_regclass('fuel.fuel_transactions') IS NOT NULL AS ok`);
      if (!(tableExists.rows[0] as { ok?: boolean } | undefined)?.ok) return { unavailable: true as const };

      if (b.driver_id) {
        const driverRes = (await client.query(
          `SELECT d.id::text AS id
             FROM mdata.drivers d
            WHERE d.id = $1::uuid
              AND d.deactivated_at IS NULL
              AND (
                d.operating_company_id = $2::uuid
                OR EXISTS (
                  SELECT 1
                    FROM mdata.driver_company_authorizations fuel_create_driver_dca
                   WHERE fuel_create_driver_dca.driver_id = d.id
                     AND fuel_create_driver_dca.company_id = $2::uuid
                     AND fuel_create_driver_dca.is_authorized = true
                     AND fuel_create_driver_dca.deactivated_at IS NULL
                )
              )
            LIMIT 1`,
          [b.driver_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!driverRes.rows[0]) return { error: "driver_not_found_for_company" as const };
      }

      if (b.unit_id) {
        const unitRes = (await client.query(
          `SELECT fuel_create_unit.id::text AS id FROM mdata.units fuel_create_unit
            WHERE fuel_create_unit.id = $1::uuid
              AND fuel_create_unit.deactivated_at IS NULL
              AND COALESCE(fuel_create_unit.currently_leased_to_company_id, fuel_create_unit.owner_company_id) = $2::uuid
            LIMIT 1`,
          [b.unit_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!unitRes.rows[0]) return { error: "unit_not_found_for_company" as const };
      }

      if (b.vendor_id) {
        const vendorRes = (await client.query(
          `SELECT fuel_create_vendor.id::text AS id FROM mdata.vendors fuel_create_vendor
            WHERE fuel_create_vendor.id = $1::uuid
              AND fuel_create_vendor.operating_company_id = $2::uuid
              AND fuel_create_vendor.deactivated_at IS NULL
            LIMIT 1`,
          [b.vendor_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!vendorRes.rows[0]) return { error: "vendor_not_found_for_company" as const };
      }

      if (b.load_id) {
        const loadRes = (await client.query(
          `SELECT id::text AS id FROM mdata.loads
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
            LIMIT 1`,
          [b.load_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!loadRes.rows[0]) return { error: "load_not_found_for_company" as const };
      }

      if (b.trailer_id) {
        const trailerRes = (await client.query(
          `SELECT id::text AS id FROM mdata.equipment
            WHERE id = $1::uuid
              AND deactivated_at IS NULL
              AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
            LIMIT 1`,
          [b.trailer_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!trailerRes.rows[0]) return { error: "trailer_not_found_for_company" as const };
      }

      const insertRes = (await client.query(
        `
          INSERT INTO fuel.fuel_transactions (
            operating_company_id,
            transaction_at,
            purchased_at,
            load_id,
            driver_id,
            unit_id,
            trailer_id,
            vendor_id,
            fuel_card_id,
            fuel_type,
            gallons,
            price_per_gallon,
            total_cost,
            location_city,
            location_state,
            transaction_reference,
            source,
            notes,
            load_required,
            load_exemption_reason,
            created_by_user_id
          )
          VALUES (
            $1::uuid, $2::timestamptz, $2::timestamptz, $3, $4, $5, $6, $7, $8, $9,
            $10, $11, $12, $13, $14, $15, 'manual', $16, $18, $17, $19::uuid
          )
          RETURNING id::text AS id
        `,
        [
          b.operating_company_id,
          b.transaction_at,
          b.load_id ?? null,
          b.driver_id ?? null,
          b.unit_id ?? null,
          b.trailer_id ?? null,
          b.vendor_id ?? null,
          b.fuel_card_id ?? null,
          b.fuel_type,
          b.gallons ?? null,
          b.price_per_gallon ?? null,
          b.total_cost,
          b.location_city ?? null,
          b.location_state ?? null,
          b.transaction_reference ?? null,
          b.notes ?? null,
          b.load_id ? null : b.load_exemption_reason,
          // load_required tracks "still owes a load" — false only when the row is legitimately
          // exempt (no load_id, exemption reason given per the G18 refine above); previously this
          // was hardcoded `true` for every manual row, so an exempt entry (e.g. yard fuel, no
          // active trip) still claimed it needed a load it will never get (CLS-LINKAGE-ONEWAY /
          // verify-disp-wire-06-load-expense-link).
          Boolean(b.load_id),
          authUser.uuid,
        ]
      )) as { rows: Array<{ id: string }> };
      const fuelTransactionId = insertRes.rows[0]?.id;
      if (!fuelTransactionId) return { error: "fuel_transaction_create_failed" as const };

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.transaction.manual_create",
        {
          resource_type: "fuel.fuel_transactions",
          resource_id: fuelTransactionId,
          operating_company_id: b.operating_company_id,
          amount_cents: amountCents,
          fuel_type: b.fuel_type,
          load_id: b.load_id ?? null,
          load_exemption_reason: b.load_id ? null : b.load_exemption_reason ?? null,
        },
        "info",
        "RANK3-FUEL-OFFICE-POST-CREATE"
      );

      return {
        row: {
          id: fuelTransactionId,
          operating_company_id: b.operating_company_id,
          driver_id: b.driver_id ?? null,
          fuel_type: b.fuel_type,
          transaction_at: b.transaction_at,
          amount_cents: amountCents,
          location_state: b.location_state ?? null,
          gallons: b.gallons ?? null,
          cash_advance: b.cash_advance,
        },
      };
    });

    if ("unavailable" in result) return reply.code(501).send({ error: "fuel_transactions_unavailable" });
    if ("error" in result) {
      const status = result.error === "fuel_transaction_create_failed" ? 500 : 400;
      return reply.code(status).send({ error: result.error });
    }

    // AFTER COMMIT — TMS GL only (EXPENSE_GL_POSTING_ENABLED), same as the bulk importer. Class-by-
    // unit/trailer is resolved inside the poster (RANK2-FUEL-JE-CLASS) from the row just written.
    await flushFuelGlPostsAfterCommit(
      [
        {
          operating_company_id: b.operating_company_id,
          actor_user_id: authUser.uuid,
          fuel_transaction_id: result.row.id,
          fuel_type: b.fuel_type,
          transaction_at: b.transaction_at,
          amount_cents: amountCents,
          driver_id: b.driver_id ?? null,
          location_state: b.location_state ?? null,
          gallons: b.gallons ?? null,
          cash_advance: b.cash_advance,
          fuel_card_id: b.fuel_card_id ?? null,
        },
      ],
      req.log
    );

    return reply.code(201).send(result.row);
  });

  /**
   * G18 — attribute a fuel transaction to a load, or detach it with a recorded reason.
   *
   * WHY THIS EXISTS: G18 requires every diesel/roadside expense to reach a load. The ONLY linkage
   * path was automatic (resolveLoadId: the load whose stop window brackets the purchase, matched on
   * unit or driver). On prod 2026-08-03 that matched 0 of 1,547 transactions — $625,546.39 entirely
   * unattributed — and every row carries the importer's own blanket exemption
   * `relay_ingest_no_load_link`. With no manual path, a human could not correct a single one: the
   * control was unsatisfiable by construction, not merely unsatisfied.
   *
   * The auto-matcher is not at fault and is left alone — TRANSP holds 4 loads against 5 months of
   * fuel, so there is frequently nothing correct to match. That is an operational data gap. What was
   * missing is the human fallback for when the machine cannot know.
   *
   * AN ASSIGNED LOAD CLEARS THE EXEMPTION. Leaving `relay_ingest_no_load_link` on an attributed row
   * would keep asserting the transaction is exempt from a rule it now satisfies — a stale exemption
   * is worse than none, because it silently suppresses the row from every future compliance sweep.
   */
  app.patch(
    "/api/v1/fuel/transactions/:id/load",
    { config: { rateLimit: { max: 120, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const authUser = currentAuthUser(req, reply);
    if (!authUser) return reply;
    if (!requireFuelWriteRole(reply, String(authUser.role ?? ""))) return;
    const params = idParamSchema.safeParse(req.params ?? {});
    if (!params.success) return sendValidationError(reply, params.error);
    const body = assignLoadBodySchema.safeParse(req.body ?? {});
    if (!body.success) return sendValidationError(reply, body.error);
    const b = body.data;

    const result = await withCompanyScope(authUser.uuid, b.operating_company_id, async (client) => {
      const txRes = (await client.query(
        `SELECT id::text AS id, load_id::text AS load_id
           FROM fuel.fuel_transactions
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL
          LIMIT 1`,
        [params.data.id, b.operating_company_id]
      )) as { rows: Array<{ id: string; load_id: string | null }> };
      const tx = txRes.rows[0] ?? null;
      if (!tx) return { error: "fuel_transaction_not_found" as const };

      if (b.load_id) {
        // The load must belong to the SAME entity. A fuel cost attributed across companies would
        // move real money between books.
        const loadRes = (await client.query(
          `SELECT id::text AS id FROM mdata.loads
            WHERE id = $1::uuid AND operating_company_id = $2::uuid AND soft_deleted_at IS NULL
            LIMIT 1`,
          [b.load_id, b.operating_company_id]
        )) as { rows: Array<{ id: string }> };
        if (!loadRes.rows[0]) return { error: "load_not_found_for_company" as const };
      }

      const updated = (await client.query(
        `UPDATE fuel.fuel_transactions
            SET load_id = $3::uuid,
                load_exemption_reason = CASE WHEN $3::uuid IS NOT NULL THEN NULL ELSE $4 END,
                updated_at = now(),
                updated_by_user_id = $5::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND archived_at IS NULL
          RETURNING id::text AS id, load_id::text AS load_id, load_exemption_reason`,
        [params.data.id, b.operating_company_id, b.load_id ?? null, b.exemption_reason ?? null, authUser.uuid]
      )) as { rows: Array<{ id: string; load_id: string | null; load_exemption_reason: string | null }> };
      const updatedRow = updated.rows[0] ?? null;
      if (!updatedRow) return { error: "fuel_transaction_changed_during_attribution" as const };

      await appendCrudAudit(
        client,
        authUser.uuid,
        "fuel.transaction.load_attributed",
        {
          resource_type: "fuel.fuel_transactions",
          resource_id: params.data.id,
          operating_company_id: b.operating_company_id,
          previous_load_id: tx.load_id,
          load_id: b.load_id ?? null,
          exemption_reason: b.load_id ? null : b.exemption_reason ?? null,
        },
        "info",
        "G18-FUEL-LOAD-ATTRIBUTION"
      );

      return { row: updatedRow };
    });

    if ("error" in result) {
      if (result.error === "fuel_transaction_not_found") return reply.code(404).send({ error: result.error });
      if (result.error === "fuel_transaction_changed_during_attribution") return reply.code(409).send({ error: result.error });
      return reply.code(400).send({ error: result.error });
    }
    return reply.code(200).send(result.row);
    }
  );

}
