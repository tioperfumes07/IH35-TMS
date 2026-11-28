/**
 * Fixed asset register for assets that are not trucks — ROUND L.31 M14 (ScentsX store fixtures, furniture, computers, leasehold
 * improvements). Writes one accounting.fixed_assets row in a class of the same company, with the class's accounts and defaults; no JE
 * (the purchase is the bill / expense / check coded to the asset account; depreciation posts through the existing FIN-21 poster
 * postDepreciation, POST /api/v1/accounting/amortization-posting/depreciation/post). Never guesses a price; salvage ≤ cost.
 */
import { z } from "zod";

type Db = { query: <T = Record<string, unknown>>(sql: string, args?: unknown[]) => Promise<{ rows: T[]; rowCount: number | null }> };

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const registerAssetSchema = z.object({
  operating_company_id: z.string().uuid(),
  class_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  asset_number: z.string().trim().max(60).nullable().optional(),
  serial: z.string().trim().max(120).nullable().optional(),
  purchase_price_cents: z.number().int().positive(),
  salvage_value_cents: z.number().int().min(0).default(0),
  purchase_date: isoDate,
  in_service_date: isoDate,
  useful_life_months: z.number().int().min(1).max(600).optional(),
}).refine((x) => x.salvage_value_cents <= x.purchase_price_cents, { message: "Salvage value cannot be more than the cost.", path: ["salvage_value_cents"] })
  .refine((x) => x.in_service_date >= x.purchase_date, { message: "In service cannot be before the purchase date.", path: ["in_service_date"] });

export class FixedAssetRegisterError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

export async function registerFixedAsset(c: Db, uid: string, x: z.infer<typeof registerAssetSchema>) {
  const cls = (await c.query<{ id: string; default_method: string; default_useful_life_months: number; a: string | null; ad: string | null; de: string | null }>(
    `SELECT id::text, default_method, default_useful_life_months, default_asset_account_id::text AS a, default_accum_depr_account_id::text AS ad,
            default_depr_expense_account_id::text AS de
       FROM accounting.fixed_asset_classes WHERE id = $1::uuid AND operating_company_id = $2::uuid AND is_active = true AND deleted_at IS NULL`,
    [x.class_id, x.operating_company_id])).rows[0];
  if (!cls) throw new FixedAssetRegisterError("class_not_found", "That asset class is not in this company.");
  if (!cls.a || !cls.ad || !cls.de) throw new FixedAssetRegisterError("class_accounts_missing", "The class has no asset / accumulated depreciation / expense account.");
  if (x.asset_number) {
    const dup = await c.query(`SELECT 1 FROM accounting.fixed_assets WHERE operating_company_id = $1::uuid AND asset_number = $2 AND is_active = true`, [x.operating_company_id, x.asset_number]);
    if (dup.rowCount) throw new FixedAssetRegisterError("asset_number_taken", `Asset number ${x.asset_number} is already used.`);
  }
  const r = await c.query<{ id: string }>(
    `INSERT INTO accounting.fixed_assets (operating_company_id, owner_operating_company_id, asset_number, name, class_id, vin_serial,
       purchase_price_cents, salvage_value_cents, purchase_date, in_service_date, method, useful_life_months, convention,
       asset_account_id, accum_depr_account_id, depr_expense_account_id, status, is_active, created_by_user_id, updated_by_user_id)
     VALUES ($1::uuid, $1::uuid, $2, $3, $4::uuid, $5, $6, $7, $8::date, $9::date, $10, $11, 'full_month', $12::uuid, $13::uuid, $14::uuid, 'active', true, $15::uuid, $15::uuid)
     RETURNING id::text`,
    [x.operating_company_id, x.asset_number ?? null, x.name, cls.id, x.serial ?? null, x.purchase_price_cents, x.salvage_value_cents,
      x.purchase_date, x.in_service_date, cls.default_method, x.useful_life_months ?? cls.default_useful_life_months, cls.a, cls.ad, cls.de, uid]);
  return { id: r.rows[0]!.id };
}
