// U25 (owner UI register 2026-10-03; owner 2026-10-03: "nothing on the books but it does affect the categorization. We can
// receive a credit for the reefer fuel from the US government so we need to have it detailed — how many gallons etc.")
//
// Diesel burned by a trailer's reefer unit is an off-highway, nontaxable use: its federal excise tax is claimed back on
// IRS Form 4136 (gallons × the per-gallon rate, with the actual fuel cost). Truck diesel and reefer diesel post to the
// same account (5000 Fuel & Diesel), so the ledger does not move — what must be right is the CATEGORY and the GALLONS:
//   * a reefer fuel line carries its gallons (quantity, unit "gal") and the trailer it fueled
//   * the fuel-card transaction behind it is fuel_type 'reefer_diesel' — which the IFTA aggregator already excludes
//     (reefer fuel does not move the truck, so it is not IFTA road fuel)
// One function keeps the fuel transaction in step with the line's item; the credit report reads both sources.
// Minimal client: works with a pg PoolClient and with the reclassify engine's DbClient.
type Db = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

/** SQL predicate: the item (alias) is reefer FUEL (not a reefer washout / repair). */
export const REEFER_FUEL_ITEM_SQL = (alias: string) =>
  `(${alias}.item_name ~* 'reefer' AND ${alias}.item_name ~* '(fuel|diesel)' AND ${alias}.item_name !~* '(wash|repair|service|def)')`;
/** SQL predicate: the item is truck (road) diesel. */
export const TRUCK_DIESEL_ITEM_SQL = (alias: string) =>
  `(${alias}.item_name ~* 'diesel' AND ${alias}.item_name !~* '(reefer|def|exhaust|fee|code)')`;

export function isReeferFuelItemName(name: string): boolean {
  return /reefer/i.test(name) && /(fuel|diesel)/i.test(name) && !/(wash|repair|service|def)/i.test(name);
}

/**
 * After an expense line's item changed: keep the linked fuel transaction's category and the line's gallons / trailer in
 * step. Money never moves (the amount stays; rate = amount / gallons). Returns a note for the batch, or null.
 */
export async function syncReeferFuelForExpenseLine(client: Db, companyId: string, expenseLineId: string): Promise<string | null> {
  const r = await client.query<{
    is_reefer: boolean;
    is_truck: boolean;
    fuel_txn_id: string | null;
    fuel_type: string | null;
    gallons: string | null;
    ft_trailer: string | null;
    line_trailer: string | null;
    amount_cents: string;
    unit_of_measure: string | null;
  }>(
    `SELECT ${REEFER_FUEL_ITEM_SQL("i")} AS is_reefer, ${TRUCK_DIESEL_ITEM_SQL("i")} AS is_truck,
            ft.id::text AS fuel_txn_id, ft.fuel_type, ft.gallons::text AS gallons, ft.trailer_id::text AS ft_trailer,
            el.trailer_id::text AS line_trailer, el.amount_cents::text AS amount_cents, el.unit_of_measure
       FROM accounting.expense_lines el
       JOIN accounting.expenses e ON e.id = el.expense_id AND e.operating_company_id = el.operating_company_id
       LEFT JOIN catalogs.items i ON i.id = el.item_id
       LEFT JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id AND ft.operating_company_id = e.operating_company_id
      WHERE el.id = $1::uuid AND el.operating_company_id = $2::uuid`,
    [expenseLineId, companyId],
  );
  const row = r.rows[0];
  if (!row || !row.fuel_txn_id) return null;
  if (row.is_reefer && row.fuel_type !== "reefer_diesel") {
    await client.query(`UPDATE fuel.fuel_transactions SET fuel_type = 'reefer_diesel' WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [
      row.fuel_txn_id,
      companyId,
    ]);
    const gallons = Number(row.gallons);
    if (gallons > 0) {
      await client.query(
        `UPDATE accounting.expense_lines
            SET quantity = $3::numeric, unit_of_measure = 'gal', rate_cents = round(amount_cents::numeric / $3::numeric, 4),
                -- the fill's trailer only when this company owns or leases it (ROUND 373.5 cross-company refusal)
                trailer_id = COALESCE(trailer_id, (SELECT eq.id FROM mdata.equipment eq WHERE eq.id = $4::uuid AND eq.equipment_type ~* 'reefer'
                                                     AND (eq.owner_company_id = $2::uuid OR eq.currently_leased_to_company_id = $2::uuid)))
          WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
        [expenseLineId, companyId, gallons, row.ft_trailer],
      );
    }
    return `fuel transaction marked reefer diesel (${gallons > 0 ? `${gallons} gal` : "gallons missing"}; out of IFTA)`;
  }
  if (row.is_truck && row.fuel_type === "reefer_diesel") {
    await client.query(`UPDATE fuel.fuel_transactions SET fuel_type = 'diesel' WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [
      row.fuel_txn_id,
      companyId,
    ]);
    return "fuel transaction back to truck diesel (IFTA road fuel)";
  }
  return null;
}

export type ReeferCreditRow = {
  source: "fuel_card" | "expense" | "relay_feed";
  source_id: string;
  expense_id: string | null;
  expense_line_id: string | null;
  document_number: string | null;
  date: string;
  vendor_name: string | null;
  location: string | null;
  unit_id: string | null;
  unit_number: string | null;
  trailer_id: string | null;
  trailer_number: string | null;
  /** mdata.equipment.equipment_type of the trailer — a reefer fill on a non-Reefer trailer is flagged. */
  trailer_type: string | null;
  load_id: string | null;
  load_number: string | null;
  gallons: number | null;
  cost_cents: number;
  price_per_gallon_cents: number | null;
};

/**
 * Every reefer fill in [from, to]: fuel-card transactions categorized reefer_diesel (gallons from the card), plus reefer
 * fuel expense lines that no fuel transaction backs (gallons recorded on the line, or MISSING). A line backed by a
 * reefer fuel transaction is counted once, from the card.
 */
export async function listReeferFuelForCredit(client: Db, companyId: string, from: string, to: string): Promise<ReeferCreditRow[]> {
  const res = await client.query(
    `WITH card AS (
       SELECT 'fuel_card'::text AS source, ft.id::text AS source_id, e.id::text AS expense_id, el.id::text AS expense_line_id,
              e.expense_number AS document_number, COALESCE(ft.purchased_at, ft.transaction_at)::date AS d,
              v.vendor_name, NULLIF(concat_ws(', ', ft.location_city, ft.location_state), '') AS location,
              ft.unit_id, ft.trailer_id, COALESCE(ft.load_id, el.load_id, e.load_id) AS load_id,
              ft.gallons::numeric AS gallons, round(COALESCE(ft.total_cost, 0) * 100)::bigint AS cost_cents
         FROM fuel.fuel_transactions ft
         LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.operating_company_id = ft.operating_company_id AND e.voided_at IS NULL
         LEFT JOIN LATERAL (SELECT x.id, x.load_id FROM accounting.expense_lines x WHERE x.expense_id = e.id ORDER BY x.line_sequence LIMIT 1) el ON true
         LEFT JOIN mdata.vendors v ON v.id = ft.vendor_id
        WHERE ft.operating_company_id = $1::uuid AND ft.fuel_type = 'reefer_diesel' AND ft.voided_at IS NULL AND ft.archived_at IS NULL
          AND COALESCE(ft.purchased_at, ft.transaction_at)::date BETWEEN $2::date AND $3::date
     ),
     manual AS (
       SELECT 'expense'::text AS source, el.id::text AS source_id, e.id::text AS expense_id, el.id::text AS expense_line_id,
              e.expense_number AS document_number, e.transaction_date::date AS d,
              COALESCE(v.vendor_name, mdata.resolve_vendor_label_same_company(e.vendor_uuid, e.operating_company_id)) AS vendor_name,
              NULL::text AS location,
              COALESCE(el.unit_id, e.unit_id) AS unit_id, COALESCE(el.trailer_id, e.trailer_id) AS trailer_id,
              COALESCE(el.load_id, e.load_id) AS load_id,
              CASE WHEN el.unit_of_measure IN ('gal', 'gallon', 'gallons') THEN el.quantity END AS gallons,
              el.amount_cents::bigint AS cost_cents
         FROM accounting.expense_lines el
         JOIN accounting.expenses e ON e.id = el.expense_id AND e.operating_company_id = el.operating_company_id
         JOIN catalogs.items i ON i.id = el.item_id
         LEFT JOIN fuel.fuel_transactions ft ON ft.id = e.source_fuel_transaction_id AND ft.fuel_type = 'reefer_diesel'
         LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid AND v.operating_company_id = e.operating_company_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND ${REEFER_FUEL_ITEM_SQL("i")}
          AND ft.id IS NULL
          AND e.transaction_date::date BETWEEN $2::date AND $3::date
     )
     ,
     -- ROUND 391.2 — the Relay feed's own Reefer product lines (product code 033) that no reefer fuel row carries yet:
     -- real reefer purchases the fuel table never received. Counted from the feed so the quarter's gallons are whole;
     -- a feed line that matches a reefer_diesel fuel row (same unit, +/-1 day, same gallons) is counted once, from the row.
     feed AS (
       SELECT 'relay_feed'::text AS source, l.id::text AS source_id, NULL::text AS expense_id, NULL::text AS expense_line_id,
              t.relay_fuel_code AS document_number, (t.relay_created_at)::date AS d, t.merchant_name AS vendor_name,
              NULLIF(concat_ws(', ', t.location_city, t.location_state), '') AS location,
              t.matched_unit_id AS unit_id, NULL::uuid AS trailer_id, NULL::uuid AS load_id,
              l.volume::numeric AS gallons, COALESCE(l.total_discounted_price_cents, l.total_retail_price_cents, 0)::bigint AS cost_cents
         FROM integrations.relay_fuel_transaction_lines l
         JOIN integrations.relay_fuel_transactions t ON t.id = l.relay_fuel_transaction_id
        WHERE l.operating_company_id = $1::uuid AND l.fuel_type = 'reefer' AND l.voided_at IS NULL AND t.voided_at IS NULL
          AND l.volume > 0
          AND (t.relay_created_at)::date BETWEEN $2::date AND $3::date
          AND NOT EXISTS (
            SELECT 1 FROM fuel.fuel_transactions ft
             WHERE ft.operating_company_id = t.operating_company_id AND ft.fuel_type = 'reefer_diesel' AND ft.voided_at IS NULL
               AND ft.unit_id = t.matched_unit_id AND round(ft.gallons::numeric, 3) = round(l.volume::numeric, 3)
               AND abs(COALESCE(ft.purchased_at, ft.transaction_at)::date - (t.relay_created_at)::date) <= 1)
     )
     SELECT x.source, x.source_id, x.expense_id, x.expense_line_id, x.document_number, x.d::text AS date, x.vendor_name, x.location,
            x.unit_id::text, u.unit_number, x.trailer_id::text, tr.equipment_number AS trailer_number, tr.equipment_type AS trailer_type,
            x.load_id::text, l.load_number, x.gallons::float AS gallons, x.cost_cents::bigint AS cost_cents
       FROM (SELECT * FROM card UNION ALL SELECT * FROM manual UNION ALL SELECT * FROM feed) x
       LEFT JOIN mdata.units u ON u.id = x.unit_id
       LEFT JOIN mdata.equipment tr ON tr.id = x.trailer_id
       LEFT JOIN mdata.loads l ON l.id = x.load_id
      ORDER BY x.d, x.document_number NULLS LAST`,
    [companyId, from, to],
  );
  return res.rows.map((r: Record<string, unknown>) => {
    const gallons = r.gallons == null ? null : Number(r.gallons);
    const cost = Number(r.cost_cents ?? 0);
    return {
      ...(r as Omit<ReeferCreditRow, "gallons" | "cost_cents" | "price_per_gallon_cents">),
      gallons,
      cost_cents: cost,
      price_per_gallon_cents: gallons && gallons > 0 ? Math.round((cost / gallons) * 100) / 100 : null,
    } as ReeferCreditRow;
  });
}

export class ReeferGallonsError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/** The trailer must be this company's (owned or leased) and a Reefer — reefer fuel on a dry van is refused. */
async function assertReeferTrailer(client: Db, companyId: string, trailerId: string): Promise<void> {
  const t = await client.query<{ equipment_type: string | null }>(
    `SELECT equipment_type FROM mdata.equipment WHERE id = $1::uuid AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)`,
    [trailerId, companyId],
  );
  if (!t.rows[0]) throw new ReeferGallonsError("TRAILER_NOT_FOUND", "Trailer not found among this company's owned or leased trailers.");
  if (!/reefer/i.test(t.rows[0].equipment_type ?? "")) {
    throw new ReeferGallonsError("TRAILER_NOT_REEFER", `That trailer is a ${t.rows[0].equipment_type ?? "non-reefer"} trailer — reefer fuel goes to a Reefer trailer.`);
  }
}

/**
 * ROUND 391.2 — "trailer_id on every reefer row": set the Reefer trailer a reefer fill went into, on the fuel transaction
 * (and its expense line) or on a reefer fuel expense line. No money moves.
 */
export async function setReeferTrailer(
  client: Db,
  companyId: string,
  input: { source: "fuel_card" | "expense"; source_id: string; trailer_id: string },
): Promise<{ updated: number }> {
  await assertReeferTrailer(client, companyId, input.trailer_id);
  if (input.source === "fuel_card") {
    const r = await client.query(
      `UPDATE fuel.fuel_transactions SET trailer_id = $3::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid AND fuel_type = 'reefer_diesel' AND voided_at IS NULL`,
      [input.source_id, companyId, input.trailer_id],
    );
    if ((r.rowCount ?? 0) === 0) throw new ReeferGallonsError("LINE_NOT_FOUND", "Reefer fuel transaction not found in this company.");
    await client.query(
      `UPDATE accounting.expense_lines el SET trailer_id = $3::uuid
         FROM accounting.expenses e
        WHERE e.id = el.expense_id AND e.source_fuel_transaction_id = $1::uuid AND e.operating_company_id = $2::uuid AND e.voided_at IS NULL`,
      [input.source_id, companyId, input.trailer_id],
    );
    return { updated: r.rowCount ?? 0 };
  }
  const r = await client.query(
    `UPDATE accounting.expense_lines el SET trailer_id = $3::uuid
       FROM catalogs.items i
      WHERE el.id = $1::uuid AND el.operating_company_id = $2::uuid AND i.id = el.item_id AND ${REEFER_FUEL_ITEM_SQL("i")}`,
    [input.source_id, companyId, input.trailer_id],
  );
  if ((r.rowCount ?? 0) === 0) throw new ReeferGallonsError("LINE_NOT_FOUND", "Reefer fuel expense line not found in this company.");
  return { updated: r.rowCount ?? 0 };
}

/**
 * Record the gallons (and the trailer) of a reefer fuel expense line from its receipt. The amount never changes; the
 * line becomes quantity = gallons, unit "gal", rate = amount / gallons. The audit trigger records the change.
 */
export async function recordReeferGallons(
  client: Db,
  companyId: string,
  expenseLineId: string,
  input: { gallons: number; trailer_id?: string | null },
): Promise<{ expense_line_id: string; gallons: number; rate_cents: number }> {
  if (!(input.gallons > 0) || input.gallons > 2000) throw new ReeferGallonsError("GALLONS_INVALID", "Gallons must be more than 0 and at most 2,000.");
  const line = await client.query<{ is_reefer: boolean; amount_cents: string; voided: boolean }>(
    `SELECT ${REEFER_FUEL_ITEM_SQL("i")} AS is_reefer, el.amount_cents::text AS amount_cents, (e.voided_at IS NOT NULL) AS voided
       FROM accounting.expense_lines el
       JOIN accounting.expenses e ON e.id = el.expense_id AND e.operating_company_id = el.operating_company_id
       LEFT JOIN catalogs.items i ON i.id = el.item_id
      WHERE el.id = $1::uuid AND el.operating_company_id = $2::uuid`,
    [expenseLineId, companyId],
  );
  const row = line.rows[0];
  if (!row) throw new ReeferGallonsError("LINE_NOT_FOUND", "Expense line not found in this company.");
  if (row.voided) throw new ReeferGallonsError("EXPENSE_VOIDED", "The expense is voided.");
  if (!row.is_reefer) throw new ReeferGallonsError("NOT_REEFER_FUEL", "Gallons are recorded here only for a reefer fuel line.");
  if (input.trailer_id) await assertReeferTrailer(client, companyId, input.trailer_id);
  const upd = await client.query<{ rate_cents: string }>(
    `UPDATE accounting.expense_lines
        SET quantity = $3::numeric, unit_of_measure = 'gal', rate_cents = round(amount_cents::numeric / $3::numeric, 4),
            trailer_id = COALESCE($4::uuid, trailer_id)
      WHERE id = $1::uuid AND operating_company_id = $2::uuid
      RETURNING rate_cents::text`,
    [expenseLineId, companyId, input.gallons, input.trailer_id ?? null],
  );
  return { expense_line_id: expenseLineId, gallons: input.gallons, rate_cents: Number(upd.rows[0].rate_cents) };
}
