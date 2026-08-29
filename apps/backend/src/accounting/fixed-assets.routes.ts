/**
 * Fixed Assets (ASC 360) — register + read/compute
 * GET  /api/v1/accounting/fixed-assets             list asset register (per-entity)
 * GET  /api/v1/accounting/fixed-assets/:id         detail + computed depreciation schedule + disposal + JE preview
 * GET  /api/v1/accounting/fixed-asset-classes      class catalog (read)
 * POST /api/v1/accounting/fixed-assets/register-unit   ND-FA-01 — register one owned unit (requires purchase_price_cents)
 * POST /api/v1/accounting/fixed-assets/register-trk-units  ND-FA-01 — bulk TRK register (pricesByUnitNumber required)
 *
 * Register writes accounting.fixed_assets rows only (no JE). Depreciation schedule is computed for display
 * (book-value roll-forward), annotated per-period with `posted`/`posted_journal_entry_id` from
 * `accounting.depreciation_schedule_rows` when the ALREADY-BUILT poster (`postDepreciation` in
 * amortization-posting.service.ts, "FIN-21") has actually posted that period. `FIXED_ASSET_AUTOPOST_ENABLED`
 * gates only the (unbuilt) monthly cron — the manual per-asset poster is gated by the SEPARATE
 * `AMORTIZATION_GL_POSTING_ENABLED` flag, already ON for TRK/USMCA (see docs/specs/depreciation-BLOCK-01-DESIGN.md).
 * Money = integer cents. Entity-scoped. RLS enforced. Owner vs operator distinction preserved
 * (owner_operating_company_id).
 */
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { z } from "zod";
import { companyQuerySchema, currentAuthUser, validationError, withCompanyScope } from "./shared.js";
import { isEnabled } from "../lib/feature-flags/service.js";
// FIN-21: the depreciation schedule math is shared with the GL poster (single source of truth).
import { computeDepreciationSchedule, asOfToday } from "./fixed-assets.math.js";
import { AMORTIZATION_GL_POSTING_FLAG_KEY } from "./amortization-posting/amortization-posting.math.js";
import {
  registerOwnedUnitAsFixedAsset,
  registerRealTrkOwnedUnits,
} from "./owned-unit-fixed-asset-register.service.js";

const AUTOPOST_FLAG = "FIXED_ASSET_AUTOPOST_ENABLED";

function accountingRoles(role: string) {
  return ["Owner", "Administrator", "Accountant"].includes(role);
}

const listQuerySchema = companyQuerySchema.extend({
  status: z.enum(["active", "fully_depreciated", "disposed", "voided"]).optional(),
  class_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const detailParamsSchema = z.object({ id: z.string().uuid() });

/** Row shape returned by the fixed-assets LIST query (money columns cast ::text). */
interface FixedAssetListRow {
  id: string;
  asset_number: string | null;
  name: string;
  owner_operating_company_id: string;
  owner_company_name: string | null;
  class_id: string;
  class_name: string | null;
  purchase_price_cents: string;
  salvage_value_cents: string;
  prior_accumulated_depr_cents: string;
  purchase_date: string;
  in_service_date: string;
  method: string;
  useful_life_months: number;
  convention: string;
  total_expected_units: string | null;
  status: string;
  created_at: string;
}

/** Row shape returned by the fixed-asset DETAIL query (fa.* plus ::text aliases). */
interface FixedAssetDetailRow {
  id: string;
  asset_number: string | null;
  name: string;
  class_id: string;
  class_name: string | null;
  owner_company_name: string | null;
  unit_uuid: string | null;
  vin_serial: string | null;
  method: string;
  useful_life_months: number;
  convention: string;
  status: string;
  depr_expense_account_id: string | null;
  accum_depr_account_id: string | null;
  purchase_price_s: string;
  salvage_s: string;
  prior_accum_s: string;
  total_units_s: string | null;
  purchase_date_s: string;
  in_service_date_s: string;
  created_at_s: string;
  owner_id_s: string;
}

/** Row shape returned by the latest-disposal query. */
interface FixedAssetDisposalRow {
  id: string;
  disposal_date: string;
  disposal_type: string;
  proceeds_cents: string;
  book_value_at_disposal_cents: string;
  gain_loss_cents: string;
  posting_status: string;
  notes: string | null;
}

async function registerFixedAssetsRoutes(app: FastifyInstance) {
  // CLASS CATALOG (read)
  app.get("/api/v1/accounting/fixed-asset-classes", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = companyQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT id, class_code, class_name, is_depreciable, default_method,
                default_useful_life_months
         FROM accounting.fixed_asset_classes
         WHERE operating_company_id = $1::uuid AND is_active = true
         ORDER BY class_code`,
        [parsed.data.operating_company_id]
      );
      return { classes: res.rows };
    });
  });

  // LIST
  app.get("/api/v1/accounting/fixed-assets", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const parsed = listQuerySchema.safeParse(req.query ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    const { operating_company_id, status, class_id, limit, offset } = parsed.data;

    return withCompanyScope(user.uuid, operating_company_id, async (client) => {
      const conds = ["fa.operating_company_id = $1::uuid", "fa.is_active = true"];
      const params: unknown[] = [operating_company_id];
      let pi = 2;
      if (status) { conds.push(`fa.status = $${pi++}`); params.push(status); }
      if (class_id) { conds.push(`fa.class_id = $${pi++}`); params.push(class_id); }
      const where = conds.join(" AND ");

      const countRes = await client.query(
        `SELECT COUNT(*)::text AS total FROM accounting.fixed_assets fa WHERE ${where}`,
        params
      );
      const total = Number((countRes.rows[0] as { total: string }).total ?? 0);

      params.push(limit, offset);
      const listRes = await client.query(
        `SELECT
          fa.id, fa.asset_number, fa.name,
          fa.owner_operating_company_id::text AS owner_operating_company_id,
          COALESCE(owner.short_name, owner.legal_name) AS owner_company_name,
          fa.class_id::text                    AS class_id,
          fac.class_name,
          fa.purchase_price_cents::text        AS purchase_price_cents,
          fa.salvage_value_cents::text         AS salvage_value_cents,
          fa.prior_accumulated_depr_cents::text AS prior_accumulated_depr_cents,
          fa.purchase_date::text               AS purchase_date,
          fa.in_service_date::text             AS in_service_date,
          fa.method, fa.useful_life_months, fa.convention,
          fa.total_expected_units::text        AS total_expected_units,
          fa.status, fa.created_at::text        AS created_at
        FROM accounting.fixed_assets fa
        LEFT JOIN accounting.fixed_asset_classes fac ON fac.id = fa.class_id
        LEFT JOIN org.companies owner ON owner.id = fa.owner_operating_company_id
        WHERE ${where}
        ORDER BY fa.in_service_date DESC, fa.created_at DESC
        LIMIT $${pi++} OFFSET $${pi++}`,
        params
      );

      return {
        total, limit, offset,
        items: listRes.rows.map((r: FixedAssetListRow) => {
          const compute = computeDepreciationSchedule({
            purchase_price_cents: Number(r.purchase_price_cents),
            salvage_value_cents: Number(r.salvage_value_cents),
            in_service_date: r.in_service_date,
            method: r.method,
            useful_life_months: r.useful_life_months,
            convention: r.convention,
            prior_accumulated_depr_cents: Number(r.prior_accumulated_depr_cents),
          });
          const now = asOfToday(compute.rows);
          return {
            id: r.id as string,
            asset_number: r.asset_number as string | null,
            name: r.name as string,
            owner_operating_company_id: r.owner_operating_company_id as string,
            owner_company_name: r.owner_company_name as string | null,
            is_owner_operated: r.owner_operating_company_id === operating_company_id,
            class_id: r.class_id as string,
            class_name: r.class_name as string | null,
            purchase_price_cents: Number(r.purchase_price_cents),
            salvage_value_cents: Number(r.salvage_value_cents),
            purchase_date: r.purchase_date as string,
            in_service_date: r.in_service_date as string,
            method: r.method as string,
            useful_life_months: r.useful_life_months as number,
            convention: r.convention as string,
            status: r.status as string,
            created_at: r.created_at as string,
            depreciation_to_date_cents: now.depr_to_date_cents,
            net_book_value_cents: compute.rows.length ? now.book_value_now_cents : Number(r.purchase_price_cents) - Number(r.prior_accumulated_depr_cents),
          };
        }),
      };
    });
  });

  // DETAIL + computed schedule + disposal + gated JE preview
  app.get("/api/v1/accounting/fixed-assets/:id", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (!accountingRoles(user.role)) return reply.code(403).send({ error: "forbidden" });

    const pp = detailParamsSchema.safeParse(req.params);
    if (!pp.success) return validationError(reply, pp.error);
    const qp = companyQuerySchema.safeParse(req.query ?? {});
    if (!qp.success) return validationError(reply, qp.error);

    return withCompanyScope(user.uuid, qp.data.operating_company_id, async (client) => {
      const res = await client.query(
        `SELECT fa.*,
          fa.purchase_price_cents::text         AS purchase_price_s,
          fa.salvage_value_cents::text          AS salvage_s,
          fa.prior_accumulated_depr_cents::text AS prior_accum_s,
          fa.total_expected_units::text         AS total_units_s,
          fa.purchase_date::text                AS purchase_date_s,
          fa.in_service_date::text              AS in_service_date_s,
          fa.created_at::text                   AS created_at_s,
          fa.owner_operating_company_id::text   AS owner_id_s,
          fac.class_name, COALESCE(owner.short_name, owner.legal_name) AS owner_company_name
         FROM accounting.fixed_assets fa
         LEFT JOIN accounting.fixed_asset_classes fac ON fac.id = fa.class_id
         LEFT JOIN org.companies owner ON owner.id = fa.owner_operating_company_id
         WHERE fa.id = $1 AND fa.operating_company_id = $2::uuid AND fa.is_active = true`,
        [pp.data.id, qp.data.operating_company_id]
      );
      if (!res.rows[0]) return reply.code(404).send({ error: "not_found" });
      const a = res.rows[0] as FixedAssetDetailRow;

      const compute = computeDepreciationSchedule({
        purchase_price_cents: Number(a.purchase_price_s),
        salvage_value_cents: Number(a.salvage_s),
        in_service_date: a.in_service_date_s,
        method: a.method,
        useful_life_months: a.useful_life_months,
        convention: a.convention,
        prior_accumulated_depr_cents: Number(a.prior_accum_s),
      });
      const now = asOfToday(compute.rows);

      // ACCT-F5302 / FIXED-ASSETS-DEPRECIATION-GL-POSTING-NOT-BUILT: the poster
      // (postDepreciation, "FIN-21") already exists and is already live for TRK/USMCA — it just never
      // told this READ route which periods it actually posted. Read the real persisted rows so the FE
      // can drill from a posted period to its real JE instead of only ever showing a computed preview.
      const postedRes = await client.query(
        `SELECT period_number, posted, posted_journal_entry_id::text AS posted_journal_entry_id
           FROM accounting.depreciation_schedule_rows
          WHERE operating_company_id = $1::uuid AND asset_id = $2::uuid AND is_active = true`,
        [qp.data.operating_company_id, pp.data.id]
      );
      const postedRows = postedRes.rows as Array<{ period_number: number; posted: boolean; posted_journal_entry_id: string | null }>;
      const postedByPeriod = new Map(postedRows.map((r) => [r.period_number, r]));
      const schedule = compute.rows.map((r) => {
        const p = postedByPeriod.get(r.period_number);
        return { ...r, posted: p?.posted ?? false, posted_journal_entry_id: p?.posted_journal_entry_id ?? null };
      });
      const lastPosted = postedRows.filter((r) => r.posted).sort((x, y) => y.period_number - x.period_number)[0];

      const dispRes = await client.query(
        `SELECT id, disposal_date::text AS disposal_date, disposal_type,
                proceeds_cents::text AS proceeds_cents,
                book_value_at_disposal_cents::text AS book_value_at_disposal_cents,
                gain_loss_cents::text AS gain_loss_cents,
                posting_status, notes
         FROM accounting.fixed_asset_disposals
         WHERE asset_id = $1 AND is_active = true
         ORDER BY disposal_date DESC LIMIT 1`,
        [pp.data.id]
      );
      const disposal = dispRes.rows[0] as FixedAssetDisposalRow | undefined;

      const autopostEnabled = await isEnabled(client, AUTOPOST_FLAG, {
        operating_company_id: qp.data.operating_company_id,
        user_uuid: user.uuid,
      });
      // The manual poster (postDepreciation) books on the OWNER/title-holder's flag+ledger (FLT-04),
      // not the request's operating_company_id — check the SAME flag on the SAME entity it actually posts to.
      const manualPostingEnabled = a.owner_id_s
        ? await isEnabled(client, AMORTIZATION_GL_POSTING_FLAG_KEY, {
            operating_company_id: a.owner_id_s,
            user_uuid: user.uuid,
          })
        : false;
      const periodAmount = compute.rows.find((r) => r.depreciation_amount_cents > 0)?.depreciation_amount_cents ?? 0;

      const je_preview = {
        // autopost_enabled = the (unbuilt) monthly cron gate; manual_posting_enabled = whether
        // POST .../depreciation/post would actually post today (already ON for TRK/USMCA).
        posting_enabled: autopostEnabled,
        autopost_enabled: autopostEnabled,
        manual_posting_enabled: manualPostingEnabled,
        depreciation_je_template: a.depr_expense_account_id && a.accum_depr_account_id ? {
          balanced: true,
          lines: [
            { account_id: a.depr_expense_account_id, debit_cents: periodAmount, credit_cents: 0, memo: "Depreciation expense" },
            { account_id: a.accum_depr_account_id, debit_cents: 0, credit_cents: periodAmount, memo: "Accumulated depreciation" },
          ],
        } : null,
      };

      return {
        id: a.id,
        asset_number: a.asset_number,
        name: a.name,
        class_id: a.class_id,
        class_name: a.class_name,
        owner_operating_company_id: a.owner_id_s,
        owner_company_name: a.owner_company_name,
        is_owner_operated: a.owner_id_s === qp.data.operating_company_id,
        unit_uuid: a.unit_uuid,
        vin_serial: a.vin_serial,
        purchase_price_cents: Number(a.purchase_price_s),
        salvage_value_cents: Number(a.salvage_s),
        prior_accumulated_depr_cents: Number(a.prior_accum_s),
        purchase_date: a.purchase_date_s,
        in_service_date: a.in_service_date_s,
        method: a.method,
        useful_life_months: a.useful_life_months,
        convention: a.convention,
        total_expected_units: a.total_units_s ? Number(a.total_units_s) : null,
        status: a.status,
        created_at: a.created_at_s,
        depreciation_to_date_cents: now.depr_to_date_cents,
        net_book_value_cents: compute.rows.length ? now.book_value_now_cents : Number(a.purchase_price_s) - Number(a.prior_accum_s),
        schedule: schedule,
        schedule_note: compute.note,
        last_posted_journal_entry_id: lastPosted?.posted_journal_entry_id ?? null,
        last_posted_period_number: lastPosted?.period_number ?? null,
        disposal: disposal ? {
          id: disposal.id,
          disposal_date: disposal.disposal_date,
          disposal_type: disposal.disposal_type,
          proceeds_cents: Number(disposal.proceeds_cents),
          book_value_at_disposal_cents: Number(disposal.book_value_at_disposal_cents),
          gain_loss_cents: Number(disposal.gain_loss_cents),
          posting_status: disposal.posting_status,
          notes: disposal.notes,
        } : null,
        je_preview,
      };
    });
  });

  // ND-FA-01 — register one owned unit onto accounting.fixed_assets (no JE; price required)
  const registerUnitBody = z.object({
    operating_company_id: z.string().uuid(),
    owner_operating_company_id: z.string().uuid(),
    unit_uuid: z.string().uuid(),
    purchase_price_cents: z.number().int().positive(),
    salvage_value_cents: z.number().int().min(0).optional(),
    purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    in_service_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  });

  app.post("/api/v1/accounting/fixed-assets/register-unit", { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner" && user.role !== "Administrator") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = registerUnitBody.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      const result = await registerOwnedUnitAsFixedAsset(client, {
        ...parsed.data,
        actor_user_id: user.uuid,
      });
      if (!result.created && result.reason === "unit_not_found") {
        return reply.code(404).send({ error: "unit_not_found" });
      }
      if (!result.created && result.reason === "class_missing") {
        return reply.code(409).send({ error: "truck_class_missing" });
      }
      if (!result.created && result.reason === "invalid_price") {
        return reply.code(400).send({ error: "invalid_price" });
      }
      return result;
    });
  });

  // ND-FA-01 — bulk TRK register; never invents purchase prices
  const bulkBody = z.object({
    operating_company_id: z.string().uuid(),
    owner_operating_company_id: z.string().uuid(),
    pricesByUnitNumber: z.record(z.string(), z.number().int().positive()),
  });

  app.post("/api/v1/accounting/fixed-assets/register-trk-units", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
    const user = currentAuthUser(req, reply);
    if (!user) return;
    if (user.role !== "Owner" && user.role !== "Administrator") {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = bulkBody.safeParse(req.body ?? {});
    if (!parsed.success) return validationError(reply, parsed.error);

    return withCompanyScope(user.uuid, parsed.data.operating_company_id, async (client) => {
      // ACCT-F5392 backend residual — the FE gate (canBulkRegister requires the selected entity
      // === TRK) only stops the button rendering; nothing here stopped a direct API call with a
      // non-TRK operating_company_id. registerRealTrkOwnedUnits is a TRK-books action by name and
      // by design (register-density UI language), so refuse anything that doesn't resolve to the
      // TRK / asset_holder company. Checks both ids: the FE always sends them equal, and a caller
      // splitting them (posting AS one entity, registering units OWNED by another) is exactly the
      // cross-entity mismatch this endpoint must never allow.
      const companyRows = await client.query(
        `SELECT id::text AS id, code, company_type FROM org.companies WHERE id = ANY($1::uuid[])`,
        [[parsed.data.operating_company_id, parsed.data.owner_operating_company_id]]
      );
      type CompanyRow = { id: string; code: string | null; company_type: string | null };
      const isTrk = (row: CompanyRow | undefined) =>
        Boolean(row) && (row!.code === "TRK" || row!.company_type === "asset_holder");
      const byId = new Map((companyRows.rows as CompanyRow[]).map((r) => [r.id, r]));
      if (!isTrk(byId.get(parsed.data.operating_company_id)) || !isTrk(byId.get(parsed.data.owner_operating_company_id))) {
        return reply.code(403).send({ error: "trk_asset_holder_required" });
      }

      return registerRealTrkOwnedUnits(client, {
        ...parsed.data,
        actor_user_id: user.uuid,
      });
    });
  });
}

export default fp(registerFixedAssetsRoutes);
