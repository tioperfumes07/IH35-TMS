/**
 * E-22 registry addition — fuel card -> truck (+ driver) over effective dates (fuel.fuel_card_assignments,
 * migration 202615140600). "So a card alone can resolve a unit."
 *
 * Only a card's LAST DIGITS are ever stored or compared; a statement's card field may be masked
 * ("XXXX-XXXX-XXXX-1234") or full, and both reduce to their trailing digits here. Resolution needs
 * exactly one active assignment covering the transaction time; none or several is a named reason,
 * never a guess. Rows are voided, never deleted (the table refuses DELETE).
 */

/** A unit / driver that is not this company's — refused by name, never inserted on the FK alone. */
export class FuelCardAssignmentScopeError extends Error {
  constructor(public code: "unit_not_found_for_company" | "driver_not_found_for_company", message: string) {
    super(message);
  }
}

type DbClient = {
  query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }>;
};

export type FuelCardAssignment = {
  id: string;
  operating_company_id: string;
  fuel_card_type_id: string | null;
  fuel_card_type_name: string | null;
  card_last_digits: string;
  unit_id: string;
  unit_number: string | null;
  driver_id: string | null;
  driver_name: string | null;
  effective_from: string;
  effective_to: string | null;
  notes: string | null;
  created_at: string;
  voided_at: string | null;
  void_reason: string | null;
};

export type CardResolution =
  | { resolved: true; assignment_id: string; unit_id: string; driver_id: string | null; card_last_digits: string }
  | { resolved: false; reason: "no_card_digits" | "registry_not_deployed" | "no_assignment_at_time" | "ambiguous_assignment"; card_last_digits: string | null };

/** Trailing digits of a raw card field, or null when it carries fewer than 4 digits. */
export function cardDigits(raw: string | null | undefined): string | null {
  const digits = String(raw ?? "").replace(/\D+/g, "");
  return digits.length >= 4 ? digits : null;
}

let tableReady: boolean | null = null;
async function registryReady(client: DbClient): Promise<boolean> {
  if (tableReady) return true;
  const r = await client.query<{ ok: boolean }>(`SELECT to_regclass('fuel.fuel_card_assignments') IS NOT NULL AS ok`);
  tableReady = Boolean(r.rows[0]?.ok);
  return tableReady;
}

/**
 * Card at a moment -> truck. A registry entry matches when its stored last digits are the tail of the
 * card's digits; card type narrows the match when both sides carry one.
 */
export async function resolveUnitByCard(
  client: DbClient,
  operatingCompanyId: string,
  rawCard: string | null,
  at: string | Date,
  fuelCardTypeId: string | null = null
): Promise<CardResolution> {
  const digits = cardDigits(rawCard);
  if (!digits) return { resolved: false, reason: "no_card_digits", card_last_digits: null };
  if (!(await registryReady(client))) return { resolved: false, reason: "registry_not_deployed", card_last_digits: digits.slice(-4) };
  const res = await client.query<{ id: string; unit_id: string; driver_id: string | null; card_last_digits: string }>(
    `SELECT a.id::text, a.unit_id::text, a.driver_id::text, a.card_last_digits
       FROM fuel.fuel_card_assignments a
      WHERE a.operating_company_id = $1::uuid
        AND a.voided_at IS NULL
        AND right($2::text, length(a.card_last_digits)) = a.card_last_digits
        AND ($4::uuid IS NULL OR a.fuel_card_type_id IS NULL OR a.fuel_card_type_id = $4::uuid)
        AND a.effective_from <= $3::timestamptz
        AND (a.effective_to IS NULL OR a.effective_to > $3::timestamptz)
      LIMIT 2`,
    [operatingCompanyId, digits, new Date(at).toISOString(), fuelCardTypeId]
  );
  if (res.rows.length === 0) return { resolved: false, reason: "no_assignment_at_time", card_last_digits: digits.slice(-4) };
  if (res.rows.length > 1) return { resolved: false, reason: "ambiguous_assignment", card_last_digits: digits.slice(-4) };
  const a = res.rows[0]!;
  return { resolved: true, assignment_id: a.id, unit_id: a.unit_id, driver_id: a.driver_id, card_last_digits: a.card_last_digits };
}

const SELECT_ASSIGNMENTS = `
  SELECT a.id::text, a.operating_company_id::text, a.fuel_card_type_id::text, t.display_name AS fuel_card_type_name,
         a.card_last_digits, a.unit_id::text, u.unit_number, a.driver_id::text,
         NULLIF(trim(concat_ws(' ', d.first_name, d.last_name)), '') AS driver_name,
         a.effective_from::text, a.effective_to::text, a.notes, a.created_at::text, a.voided_at::text, a.void_reason
    FROM fuel.fuel_card_assignments a
    JOIN mdata.units u ON u.id = a.unit_id
    LEFT JOIN mdata.drivers d ON d.id = a.driver_id
    LEFT JOIN catalogs.fuel_card_types t ON t.id = a.fuel_card_type_id`;

/** Forward (card list) and reverse (unit -> its cards, driver -> their cards) in one read. */
export async function listFuelCardAssignments(
  client: DbClient,
  operatingCompanyId: string,
  filter: { unit_id?: string; driver_id?: string; card_last_digits?: string; include_voided?: boolean } = {}
): Promise<FuelCardAssignment[]> {
  if (!(await registryReady(client))) return [];
  const res = await client.query<FuelCardAssignment>(
    `${SELECT_ASSIGNMENTS}
      WHERE a.operating_company_id = $1::uuid
        AND ($2::uuid IS NULL OR a.unit_id = $2::uuid)
        AND ($3::uuid IS NULL OR a.driver_id = $3::uuid)
        AND ($4::text IS NULL OR a.card_last_digits = $4::text)
        AND ($5::boolean OR a.voided_at IS NULL)
      ORDER BY a.card_last_digits, a.effective_from DESC`,
    [operatingCompanyId, filter.unit_id ?? null, filter.driver_id ?? null, filter.card_last_digits ?? null, Boolean(filter.include_voided)]
  );
  return res.rows;
}

export async function getFuelCardAssignment(client: DbClient, operatingCompanyId: string, id: string): Promise<FuelCardAssignment | null> {
  const res = await client.query<FuelCardAssignment>(`${SELECT_ASSIGNMENTS} WHERE a.operating_company_id = $1::uuid AND a.id = $2::uuid`, [operatingCompanyId, id]);
  return res.rows[0] ?? null;
}

export async function createFuelCardAssignment(
  client: DbClient,
  operatingCompanyId: string,
  actorUserId: string,
  input: { card_last_digits: string; unit_id: string; driver_id?: string | null; fuel_card_type_id?: string | null; effective_from: string; effective_to?: string | null; notes?: string | null }
): Promise<FuelCardAssignment> {
  // Entity scope: the FK alone accepts any company's unit / driver (FK checks bypass RLS, and an Owner session sees
  // every company). Same predicates as the manual fuel-transaction create.
  const unit = await client.query<{ id: string }>(
    `SELECT u.id::text AS id FROM mdata.units u
      WHERE u.id = $1::uuid AND u.deactivated_at IS NULL
        AND COALESCE(u.currently_leased_to_company_id, u.owner_company_id) = $2::uuid
      LIMIT 1`,
    [input.unit_id, operatingCompanyId]
  );
  if (!unit.rows[0]) throw new FuelCardAssignmentScopeError("unit_not_found_for_company", "That truck is not an active unit owned by or leased to this company.");
  if (input.driver_id) {
    const driver = await client.query<{ id: string }>(
      `SELECT d.id::text AS id FROM mdata.drivers d
        WHERE d.id = $1::uuid AND d.deactivated_at IS NULL
          AND (d.operating_company_id = $2::uuid
               OR EXISTS (SELECT 1 FROM mdata.driver_company_authorizations dca
                           WHERE dca.driver_id = d.id AND dca.company_id = $2::uuid
                             AND dca.is_authorized = true AND dca.deactivated_at IS NULL))
        LIMIT 1`,
      [input.driver_id, operatingCompanyId]
    );
    if (!driver.rows[0]) throw new FuelCardAssignmentScopeError("driver_not_found_for_company", "That driver is not an active driver of, or authorized for, this company.");
  }
  const res = await client.query<{ id: string }>(
    `INSERT INTO fuel.fuel_card_assignments
       (operating_company_id, card_last_digits, unit_id, driver_id, fuel_card_type_id, effective_from, effective_to, notes, created_by_user_id)
     VALUES ($1::uuid, $2, $3::uuid, $4::uuid, $5::uuid, $6::timestamptz, $7::timestamptz, $8, $9::uuid)
     RETURNING id::text`,
    [operatingCompanyId, input.card_last_digits, input.unit_id, input.driver_id ?? null, input.fuel_card_type_id ?? null, input.effective_from, input.effective_to ?? null, input.notes ?? null, actorUserId]
  );
  return (await getFuelCardAssignment(client, operatingCompanyId, res.rows[0]!.id))!;
}

/** Hand-over: close an open assignment at a moment (the card moves to another truck from then on). */
export async function endFuelCardAssignment(client: DbClient, operatingCompanyId: string, id: string, effectiveTo: string): Promise<FuelCardAssignment | null> {
  const res = await client.query<{ id: string }>(
    `UPDATE fuel.fuel_card_assignments SET effective_to = $3::timestamptz
      WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL AND effective_to IS NULL
      RETURNING id::text`,
    [operatingCompanyId, id, effectiveTo]
  );
  return res.rows[0] ? getFuelCardAssignment(client, operatingCompanyId, id) : null;
}

/** A wrong entry is voided with a reason; the row stays (nothing is deletable). */
export async function voidFuelCardAssignment(client: DbClient, operatingCompanyId: string, id: string, actorUserId: string, reason: string): Promise<FuelCardAssignment | null> {
  const res = await client.query<{ id: string }>(
    `UPDATE fuel.fuel_card_assignments SET voided_at = now(), voided_by_user_id = $3::uuid, void_reason = $4
      WHERE operating_company_id = $1::uuid AND id = $2::uuid AND voided_at IS NULL
      RETURNING id::text`,
    [operatingCompanyId, id, actorUserId, reason]
  );
  return res.rows[0] ? getFuelCardAssignment(client, operatingCompanyId, id) : null;
}
