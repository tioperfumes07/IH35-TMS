/**
 * ROUND 443.4 b — the driver-pay ITEM comes from the driver's pay card, never a string literal.
 *
 * catalogs.items carries one family per pay type: "Driver Pay-CDL-Loaded Miles" / "-Empty Miles" and
 * "Driver Pay-Mexico-B1 Driver-Loaded Miles" / "-Empty Miles". The pay card (driver_finance.driver_pay_rates, the row
 * getDriverPayCard reads) names the family in pay_item_family. MEASURED 2026-10-10: the pay card has no such column
 * yet and no other field tells a B1 driver from a CDL driver (has_b1_visa false on all 12 active USMCA drivers), so
 * this refuses driver_pay_item_unresolved naming the driver — it never defaults to CDL. Posted to the Lead as a blocker.
 */
import type { DbClient } from "../dispatch/presettlement-link.service.js";
import { SettlementCreatorError } from "./settlement-creator.service.js";

export const PAY_ITEM_FAMILIES = {
  cdl: { loaded: "Driver Pay-CDL-Loaded Miles", empty: "Driver Pay-CDL-Empty Miles" },
  mexico_b1: { loaded: "Driver Pay-Mexico-B1 Driver-Loaded Miles", empty: "Driver Pay-Mexico-B1 Driver-Empty Miles" },
} as const;
export type PayItemFamily = keyof typeof PAY_ITEM_FAMILIES;
export type ResolvedPayItems = { family: PayItemFamily; loaded: { id: string; name: string }; empty: { id: string; name: string } };

export async function resolveDriverPayItems(client: DbClient, companyId: string, driverId: string): Promise<ResolvedPayItems> {
  const who = (
    await client.query<{ name: string }>(
      `SELECT trim(concat_ws(' ', first_name, last_name)) AS name FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [driverId, companyId],
    )
  ).rows[0]?.name || driverId;
  const hasColumn = (
    await client.query(
      `SELECT 1 FROM information_schema.columns WHERE table_schema = 'driver_finance' AND table_name = 'driver_pay_rates' AND column_name = 'pay_item_family'`,
    )
  ).rows.length > 0;
  let family: string | null = null;
  if (hasColumn) {
    family = (
      await client.query<{ f: string | null }>(
        `SELECT pay_item_family AS f FROM driver_finance.driver_pay_rates
          WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid AND is_active AND effective_to IS NULL
          ORDER BY effective_from DESC LIMIT 1`,
        [companyId, driverId],
      )
    ).rows[0]?.f ?? null;
  }
  if (!family || !(family in PAY_ITEM_FAMILIES)) {
    throw new SettlementCreatorError(
      "driver_pay_item_unresolved",
      `Driver ${who}: the pay card does not say whether this driver is paid as CDL or Mexico B1, so the driver-pay item cannot be chosen. Set it on the driver's pay card.`,
    );
  }
  const names = PAY_ITEM_FAMILIES[family as PayItemFamily];
  const rows = (
    await client.query<{ id: string; item_name: string }>(
      `SELECT id::text, item_name FROM catalogs.items WHERE operating_company_id = $1::uuid AND item_name = ANY($2::text[]) AND deactivated_at IS NULL`,
      [companyId, [names.loaded, names.empty]],
    )
  ).rows;
  const loaded = rows.find((r) => r.item_name === names.loaded);
  const empty = rows.find((r) => r.item_name === names.empty);
  if (!loaded || !empty) {
    throw new SettlementCreatorError("driver_pay_item_unresolved", `Driver ${who}: catalog item "${!loaded ? names.loaded : names.empty}" is missing.`);
  }
  return { family: family as PayItemFamily, loaded: { id: loaded.id, name: loaded.item_name }, empty: { id: empty.id, name: empty.item_name } };
}
