/**
 * RULING 443.67 #1e — THE ONE MAP from a driver-pay component to its catalog item (detail in the item, rollup in the account).
 * Used by the live settlement engine (settlement-payrun-close loadSettlementPayItems: a pay row whose settlement line names no
 * item takes the item of its component), and by the Settlement Creator / the driver-bill mint through the same function, so a
 * component can never resolve to two different items on two paths. A line's own item always wins over the map.
 *
 * Component -> item (USMCA Mexico B1 drivers; the item's default account is "Cost of Labor–Mexico Drivers" (6890)):
 *   loaded       earnings / loaded miles            "Driver Pay-Mexico-B1 Driver-Loaded Miles"
 *   empty        deadhead_pay / empty miles         "Driver Pay-Mexico-B1 Driver-Empty Miles"
 *   salary       a local driver's weekly salary     "Local Driver-Weekly Salary"
 *   extra / tarp / layover / bonus are extra_pay lines, which the DB already refuses without their own item
 *   (settlement_lines_extra_pay_requires_item) — the writer picks them; they are never guessed here.
 */
type Q = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export const PAY_COMPONENT_ITEM_NAMES = {
  loaded: "Driver Pay-Mexico-B1 Driver-Loaded Miles",
  empty: "Driver Pay-Mexico-B1 Driver-Empty Miles",
  salary: "Local Driver-Weekly Salary",
} as const;
export type PayComponent = keyof typeof PAY_COMPONENT_ITEM_NAMES;

const SALARIED_RE = /^(salaried|local driver — weekly salary)/i;

/** The component of a settlement pay line, or null when the line must carry its own item (extra pay, detention, …). */
export function payComponentOfLine(lineType: string, description: string | null | undefined): PayComponent | null {
  if (SALARIED_RE.test((description ?? "").trim())) return "salary";
  if (lineType === "earnings") return "loaded";
  if (lineType === "deadhead_pay") return "empty";
  return null;
}

/** This company's ONE active item for the component (exactly one by name), else null — never a guess. */
export async function resolvePayComponentItem(client: Q, operatingCompanyId: string, component: PayComponent): Promise<string | null> {
  const r = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.items WHERE operating_company_id = $1::uuid AND item_name = $2 AND deactivated_at IS NULL LIMIT 2`,
    [operatingCompanyId, PAY_COMPONENT_ITEM_NAMES[component]]
  );
  return r.rows.length === 1 ? r.rows[0]!.id : null;
}
