/**
 * ROUND 443.4 b — the driver-pay ITEM, never a string literal in the engine.
 *
 * catalogs.items carries one family per pay type: "Driver Pay-CDL-Loaded Miles" / "-Empty Miles" and
 * "Driver Pay-Mexico-B1 Driver-Loaded Miles" / "-Empty Miles". LEAD RULING (bus c890d88, 2026-10-10): no new column —
 * the family comes from mdata.drivers.has_b1_visa: true -> Mexico-B1, false -> CDL, NULL -> refuse
 * driver_pay_item_unresolved naming the driver. The Creator never writes the flag; the owner supplies who is B1.
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
  const flag = (
    await client.query<{ b1: boolean | null }>(
      `SELECT has_b1_visa AS b1 FROM mdata.drivers WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [driverId, companyId],
    )
  ).rows[0]?.b1;
  const family: PayItemFamily | null = flag === true ? "mexico_b1" : flag === false ? "cdl" : null;
  if (!family) {
    throw new SettlementCreatorError(
      "driver_pay_item_unresolved",
      `Driver ${who}: the driver profile does not say whether this driver holds a B1 visa (has_b1_visa is not set), so the driver-pay item (CDL or Mexico B1) cannot be chosen.`,
    );
  }
  const names = PAY_ITEM_FAMILIES[family];
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
  return { family, loaded: { id: loaded.id, name: loaded.item_name }, empty: { id: empty.id, name: empty.item_name } };
}
