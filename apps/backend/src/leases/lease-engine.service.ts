/**
 * ROUND 316 — LEASE ENGINE (contracts). Owner 2026-10-01: every unit / trailer is leased to USMCA; the owner
 * creates each lease contract himself, BACKDATED, once the engine is complete. Owner-only create / sign / close
 * (any other role: 403 + an audit row). Contracts are recorded in the LESSEE's books (operating_company_id =
 * lessee); the lessor is a company (IH 35 Trucking / IH 35 Transportation, lessor_operating_company_id) AND the
 * lessee's vendor record for it (lessor_vendor_id) — that vendor is who the monthly lease bill is owed to.
 *
 * Single source of truth: mdata.units / mdata.equipment.currently_leased_to_company_id is written HERE, from the
 * live contract (on sign) and cleared on close when no other live contract covers the asset.
 *
 * Linkage (§10-B): lessor company + vendor, lessee company, units, trailers, expense account, legal contract
 * instance, signer / closer users, audit row per mutation; bills link back via bills.lease_contract_id and
 * bill_lines.lease_asset_line_id (lease-bill-engine.service.ts).
 */
import { appendCrudAudit } from "../audit/crud-audit.js";
import { capitalizeLeaseToOwnOnSign, lesseeSchemaReady, LesseePostingError } from "./lessee-posting.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export const LEASE_TYPES = ["truck_lease", "trailer_lease", "lease_to_own"] as const;
export const BILLING_MODES = ["one_bill_per_unit", "one_bill_all_units"] as const;
export type LeaseType = (typeof LEASE_TYPES)[number];
export type BillingMode = (typeof BILLING_MODES)[number];

export class LeaseEngineError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

export type LeaseAssetInput = { unit_id?: string | null; equipment_id?: string | null; monthly_amount_cents: number; start_date?: string | null };
export type CreateLeaseAgreementInput = {
  lease_type: LeaseType;
  billing_mode: BillingMode;
  lessor_operating_company_id: string;
  lessor_vendor_id: string;
  commencement_date: string;
  end_date: string;
  deposit_cents?: number | null;
  escalation_pct_bps?: number | null;
  escalation_every_months?: number | null;
  election?: "operating" | "sales_type";
  expense_account_id?: string | null;
  display_id?: string | null;
  contract_instance_id?: string | null;
  /** ROUND 321 lease-to-own (ASC 842 lessee): discount rate + purchase option (FMV -> operating, fixed -> finance). */
  discount_rate_bps?: number | null;
  purchase_option_kind?: "none" | "fmv" | "fixed" | null;
  purchase_option_price_cents?: number | null;
  assets: LeaseAssetInput[];
};

/** Pure: validates an agreement before it touches the database. */
export function validateAgreement(input: CreateLeaseAgreementInput, lesseeCompanyId: string): string[] {
  const p: string[] = [];
  if (!LEASE_TYPES.includes(input.lease_type)) p.push("lease_type must be truck_lease, trailer_lease or lease_to_own");
  if (!BILLING_MODES.includes(input.billing_mode)) p.push("billing_mode must be one_bill_per_unit or one_bill_all_units");
  if (!input.lessor_operating_company_id) p.push("lessor company is required");
  if (input.lessor_operating_company_id === lesseeCompanyId) p.push("a company cannot lease to itself");
  if (!input.lessor_vendor_id) p.push("lessor vendor is required (the vendor the lease bill is owed to)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.commencement_date) || !/^\d{4}-\d{2}-\d{2}$/.test(input.end_date)) p.push("commencement and end dates are required");
  else if (input.end_date < input.commencement_date) p.push("end date is before the commencement date");
  if (!input.assets?.length) p.push("select at least one unit or trailer");
  if (input.lease_type === "lease_to_own") {
    if (!(Number.isInteger(input.discount_rate_bps) && (input.discount_rate_bps as number) >= 0)) p.push("lease-to-own needs a discount rate (the contract rate, else the borrowing rate)");
    if (!["none", "fmv", "fixed"].includes(String(input.purchase_option_kind))) p.push("lease-to-own needs a purchase option: none, fair market value, or a fixed price");
    if (input.purchase_option_kind === "fixed" && !(Number.isInteger(input.purchase_option_price_cents) && (input.purchase_option_price_cents as number) >= 0)) p.push("a fixed purchase option needs its price");
  }
  const seen = new Set<string>();
  for (const [i, a] of (input.assets ?? []).entries()) {
    const kinds = [a.unit_id, a.equipment_id].filter(Boolean).length;
    if (kinds !== 1) p.push(`asset ${i + 1}: choose exactly one unit or one trailer`);
    if (!(Number.isInteger(a.monthly_amount_cents) && a.monthly_amount_cents >= 0)) p.push(`asset ${i + 1}: monthly amount must be a non-negative amount`);
    const key = a.unit_id ? `u:${a.unit_id}` : `e:${a.equipment_id}`;
    if (seen.has(key)) p.push(`asset ${i + 1}: the same unit / trailer is listed twice`);
    seen.add(key);
  }
  if (input.lease_type === "truck_lease" && input.assets?.some((a) => a.equipment_id)) p.push("a truck lease lists trucks; use a trailer lease for trailers");
  if (input.lease_type === "trailer_lease" && input.assets?.some((a) => a.unit_id)) p.push("a trailer lease lists trailers; use a truck lease for trucks");
  if (input.deposit_cents != null && input.deposit_cents < 0) p.push("deposit cannot be negative");
  return p;
}

/** Pure: whole months in [start, end] (a lease from 01/01 to 12/31 is 12 periods). */
export function monthsInTerm(start: string, end: string): number {
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  let months = (ye - ys) * 12 + (me - ms);
  const lastDayOfEndMonth = new Date(Date.UTC(ye, me, 0)).getUTCDate();
  if (de >= ds - 1 || de === lastDayOfEndMonth) months += 1;
  return Math.max(1, months);
}

export async function refuseNonOwner(client: DbClient, user: { uuid: string; role?: string | null }, action: string, opco: string): Promise<void> {
  if (user.role === "Owner") return;
  await appendCrudAudit(
    client as never,
    user.uuid,
    "lease.refused_non_owner",
    { resource_type: "accounting.lease_contract", action, operating_company_id: opco, role: user.role ?? null },
    "warning",
    "ROUND-316-OWNER-ONLY"
  );
  throw new LeaseEngineError("owner_only", "Only the Owner can create, sign or close a lease contract.", 403);
}

export async function createLeaseAgreement(client: DbClient, opco: string, actorUserId: string, input: CreateLeaseAgreementInput): Promise<{ id: string }> {
  const problems = validateAgreement(input, opco);
  if (problems.length) throw new LeaseEngineError("invalid_lease", problems.join("; "));

  const vendor = await client.query<{ id: string }>(
    `SELECT id::text FROM mdata.vendors WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [input.lessor_vendor_id, opco]
  );
  if (!vendor.rows[0]) throw new LeaseEngineError("vendor_not_in_company", "The lessor vendor is not one of this company's vendors.");
  if (input.expense_account_id) {
    const acct = await client.query(`SELECT 1 FROM catalogs.accounts WHERE id = $1::uuid AND operating_company_id = $2::uuid`, [input.expense_account_id, opco]);
    if (!acct.rows.length) throw new LeaseEngineError("account_not_in_company", "The lease expense account is not one of this company's accounts.");
  }
  // Every asset must exist, be live, and be owned by the lessor company (the lessor leases what it owns).
  for (const a of input.assets) {
    const t = a.unit_id ? "mdata.units" : "mdata.equipment";
    const id = a.unit_id ?? a.equipment_id;
    const r = await client.query<{ owner: string | null; label: string | null }>(
      `SELECT owner_company_id::text AS owner, ${a.unit_id ? "unit_number" : "equipment_number"} AS label
         FROM ${t} WHERE id = $1::uuid AND deactivated_at IS NULL AND COALESCE(is_sample_data, false) = false`,
      [id]
    );
    if (!r.rows[0]) throw new LeaseEngineError("asset_not_found", `Unit / trailer ${id} is not an active asset.`);
    if (r.rows[0].owner !== input.lessor_operating_company_id) {
      throw new LeaseEngineError("asset_not_owned_by_lessor", `${r.rows[0].label ?? id} is not owned by the lessor company.`);
    }
  }
  const lessee = await client.query<{ name: string }>(`SELECT COALESCE(short_name, legal_name, id::text) AS name FROM org.companies WHERE id = $1::uuid`, [opco]);
  const periods = monthsInTerm(input.commencement_date, input.end_date);
  const monthly = input.assets.reduce((s, a) => s + a.monthly_amount_cents, 0);

  const res = await client.query<{ id: string }>(
    `INSERT INTO accounting.lease_contract
       (operating_company_id, lessor_operating_company_id, lessor_vendor_id, lessee_name, lessee_operating_company_id, display_id,
        lease_type, billing_mode, election, commencement_date, end_date, payment_amount_cents, payment_frequency, number_of_periods,
        total_lease_payments_cents, deposit_cents, escalation_pct_bps, escalation_every_months, expense_account_id,
        contract_instance_id, unit_count_basis, status, is_active, created_by_user_id, discount_rate_bps)
     VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $1::uuid, $5, $6, $7, $8, $9::date, $10::date, $11, 'monthly', $12,
             $13, $14, $15, $16, $17::uuid, $18::uuid, $19, 'draft', true, $20::uuid, $21)
     RETURNING id::text`,
    [
      opco, input.lessor_operating_company_id, input.lessor_vendor_id, lessee.rows[0]?.name ?? "Lessee", input.display_id ?? null,
      input.lease_type, input.billing_mode, input.election ?? "operating", input.commencement_date, input.end_date, monthly, periods,
      monthly * periods, input.deposit_cents ?? null, input.escalation_pct_bps ?? null, input.escalation_every_months ?? null,
      input.expense_account_id ?? null, input.contract_instance_id ?? null, input.assets.length, actorUserId,
      input.discount_rate_bps ?? null,
    ]
  );
  const id = res.rows[0].id;
  if (input.lease_type === "lease_to_own") {
    if (!(await lesseeSchemaReady(client))) {
      throw new LeaseEngineError("lease_to_own_asc842_not_applied", "Lease-to-own accounting (migration 202615210000) is not applied on this database yet — ask the Lead to apply it.", 503);
    }
    await client.query(
      `UPDATE accounting.lease_contract SET purchase_option_kind = $3, purchase_option_price_cents = $4 WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [id, opco, input.purchase_option_kind, input.purchase_option_kind === "fixed" ? input.purchase_option_price_cents : null]
    );
  }
  await client.query(
    `INSERT INTO accounting.lease_classification (operating_company_id, lease_contract_id, election, determined_by_user_id, determined_at, created_by_user_id)
     VALUES ($1::uuid, $2::uuid, $3, $4::uuid, now(), $4::uuid)`,
    [opco, id, input.election ?? "operating", actorUserId]
  );
  for (const a of input.assets) {
    await client.query(
      `INSERT INTO accounting.lease_asset_line (operating_company_id, lease_contract_id, unit_uuid, equipment_id, monthly_amount_cents, start_date, is_active, created_by_user_id)
       VALUES ($1::uuid, $2::uuid, $3::uuid, $4::uuid, $5, COALESCE($6::date, $7::date), true, $8::uuid)`,
      [opco, id, a.unit_id ?? null, a.equipment_id ?? null, a.monthly_amount_cents, a.start_date ?? null, input.commencement_date, actorUserId]
    );
  }
  await appendCrudAudit(client as never, actorUserId, "lease.created",
    { resource_type: "accounting.lease_contract", resource_id: id, operating_company_id: opco, lease_type: input.lease_type, billing_mode: input.billing_mode, assets: input.assets.length, monthly_cents: monthly },
    "info", "ROUND-316-LEASE");
  return { id };
}

/** Sign (backdating allowed): draft -> active, stamps signer, links the legal contract, derives leased-to. */
export async function signLease(client: DbClient, opco: string, actorUserId: string, leaseId: string, signedAt: string, contractInstanceId?: string | null) {
  const l = await client.query<{ status: string; lessee: string | null; lease_type: string | null }>(
    `SELECT status, lessee_operating_company_id::text AS lessee, lease_type FROM accounting.lease_contract
      WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [leaseId, opco]
  );
  const row = l.rows[0];
  if (!row) throw new LeaseEngineError("lease_not_found", "Lease contract not found.", 404);
  if (row.status !== "draft") throw new LeaseEngineError("lease_not_draft", `Only a draft lease can be signed (this one is ${row.status}).`, 409);
  await client.query(
    `UPDATE accounting.lease_contract SET status = 'active', signed_at = $3::timestamptz, signed_by_user_id = $4::uuid,
            contract_instance_id = COALESCE($5::uuid, contract_instance_id), updated_at = now(), updated_by_user_id = $4::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco, signedAt, actorUserId, contractInstanceId ?? null]
  );
  if (contractInstanceId) {
    await client.query(
      `UPDATE legal.contract_instances SET lease_contract_id = $1::uuid, counterparty_company_id = $3::uuid, updated_at = now()
        WHERE id = $2::uuid AND operating_company_id = $3::uuid`,
      [leaseId, contractInstanceId, opco]
    );
  }
  await deriveLeasedTo(client, opco, leaseId, row.lessee);
  // ROUND 321: a lease-to-own is capitalized at signing (ASC 842 lessee) — same transaction, refuses rather than
  // signing an uncapitalized lease-to-own.
  if (row.lease_type === "lease_to_own") {
    try {
      await capitalizeLeaseToOwnOnSign(client, opco, actorUserId, leaseId);
    } catch (e) {
      if (e instanceof LesseePostingError) throw new LeaseEngineError(e.code, e.message, e.status);
      throw e;
    }
  }
  await appendCrudAudit(client as never, actorUserId, "lease.signed",
    { resource_type: "accounting.lease_contract", resource_id: leaseId, operating_company_id: opco, signed_at: signedAt, contract_instance_id: contractInstanceId ?? null },
    "info", "ROUND-316-LEASE");
}

/** Leased-to comes from the live contract — never typed on the unit. */
async function deriveLeasedTo(client: DbClient, opco: string, leaseId: string, lesseeCompanyId: string | null) {
  await client.query(
    `UPDATE mdata.units u SET currently_leased_to_company_id = $3::uuid, updated_at = now()
       FROM accounting.lease_asset_line a
      WHERE a.lease_contract_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.unit_uuid = u.id
        AND a.is_active AND a.deleted_at IS NULL AND a.end_date IS NULL`,
    [leaseId, opco, lesseeCompanyId]
  );
  await client.query(
    `UPDATE mdata.equipment e SET currently_leased_to_company_id = $3::uuid, updated_at = now()
       FROM accounting.lease_asset_line a
      WHERE a.lease_contract_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.equipment_id = e.id
        AND a.is_active AND a.deleted_at IS NULL AND a.end_date IS NULL`,
    [leaseId, opco, lesseeCompanyId]
  );
}

/** Close: active -> ended, end every asset line, clear leased-to where no other live contract covers the asset. */
export async function closeLease(client: DbClient, opco: string, actorUserId: string, leaseId: string, closedOn: string, reason: string) {
  if (!reason || reason.trim().length < 3) throw new LeaseEngineError("reason_required", "A close reason is required.");
  const l = await client.query<{ status: string }>(
    `SELECT status FROM accounting.lease_contract WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [leaseId, opco]
  );
  if (!l.rows[0]) throw new LeaseEngineError("lease_not_found", "Lease contract not found.", 404);
  if (l.rows[0].status !== "active") throw new LeaseEngineError("lease_not_active", `Only an active lease can be closed (this one is ${l.rows[0].status}).`, 409);
  await client.query(
    `UPDATE accounting.lease_contract SET status = 'ended', closed_at = $3::date, closed_by_user_id = $4::uuid, close_reason = $5,
            updated_at = now(), updated_by_user_id = $4::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco, closedOn, actorUserId, reason.trim()]
  );
  await client.query(
    `UPDATE accounting.lease_asset_line SET end_date = COALESCE(end_date, $3::date), updated_at = now(), updated_by_user_id = $4::uuid
      WHERE lease_contract_id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco, closedOn, actorUserId]
  );
  for (const [t, col] of [["mdata.units", "unit_uuid"], ["mdata.equipment", "equipment_id"]] as const) {
    await client.query(
      `UPDATE ${t} x SET currently_leased_to_company_id = NULL, updated_at = now()
         FROM accounting.lease_asset_line a
        WHERE a.lease_contract_id = $1::uuid AND a.${col} = x.id
          AND NOT EXISTS (SELECT 1 FROM accounting.lease_asset_line b JOIN accounting.lease_contract c ON c.id = b.lease_contract_id
                           WHERE b.${col} = x.id AND c.status = 'active' AND c.voided_at IS NULL AND b.end_date IS NULL AND b.is_active)`,
      [leaseId]
    );
  }
  await appendCrudAudit(client as never, actorUserId, "lease.closed",
    { resource_type: "accounting.lease_contract", resource_id: leaseId, operating_company_id: opco, closed_on: closedOn, reason: reason.trim() },
    "info", "ROUND-316-LEASE");
}

export async function listLeases(client: DbClient, opco: string) {
  return (await client.query(
    `SELECT c.id::text, c.display_id, c.lease_type, c.billing_mode, c.status, c.commencement_date::text, c.end_date::text,
            c.payment_amount_cents, c.deposit_cents, c.election, c.signed_at, c.closed_at::text,
            c.lessor_operating_company_id::text, lc.short_name AS lessor_company, c.lessor_vendor_id::text, v.vendor_name AS lessor_vendor,
            (SELECT count(*)::int FROM accounting.lease_asset_line a WHERE a.lease_contract_id = c.id AND a.deleted_at IS NULL) AS asset_count,
            (SELECT count(*)::int FROM accounting.bills b WHERE b.lease_contract_id = c.id AND b.voided_at IS NULL) AS bill_count
       FROM accounting.lease_contract c
       LEFT JOIN org.companies lc ON lc.id = c.lessor_operating_company_id
       LEFT JOIN mdata.vendors v ON v.id = c.lessor_vendor_id
      WHERE c.operating_company_id = $1::uuid AND c.voided_at IS NULL AND c.deleted_at IS NULL
      ORDER BY c.commencement_date DESC, c.created_at DESC`,
    [opco]
  )).rows;
}

export async function getLease(client: DbClient, opco: string, leaseId: string) {
  const head = (await client.query(
    `SELECT c.*, c.id::text AS id, lc.short_name AS lessor_company, v.vendor_name AS lessor_vendor, acct.account_name AS expense_account_name
       FROM accounting.lease_contract c
       LEFT JOIN org.companies lc ON lc.id = c.lessor_operating_company_id
       LEFT JOIN mdata.vendors v ON v.id = c.lessor_vendor_id
       LEFT JOIN catalogs.accounts acct ON acct.id = c.expense_account_id
      WHERE c.id = $1::uuid AND c.operating_company_id = $2::uuid`,
    [leaseId, opco]
  )).rows[0];
  if (!head) return null;
  const assets = (await client.query(
    `SELECT a.id::text, a.unit_uuid::text AS unit_id, u.unit_number, a.equipment_id::text, e.equipment_number,
            a.monthly_amount_cents, a.start_date::text, a.end_date::text
       FROM accounting.lease_asset_line a
       LEFT JOIN mdata.units u ON u.id = a.unit_uuid
       LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
      WHERE a.lease_contract_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.deleted_at IS NULL ORDER BY u.unit_number NULLS LAST, e.equipment_number`,
    [leaseId, opco]
  )).rows;
  const bills = (await client.query(
    `SELECT b.id::text, b.display_id, b.bill_number, b.bill_date::text, b.lease_period_start::text, b.amount_cents, b.paid_cents, b.status,
            (SELECT bp.id::text FROM accounting.bill_payments bp WHERE bp.bill_id = b.id AND bp.voided_at IS NULL ORDER BY bp.payment_date DESC LIMIT 1) AS last_payment_id
       FROM accounting.bills b
      WHERE b.lease_contract_id = $1::uuid AND b.operating_company_id = $2::uuid AND b.voided_at IS NULL
      ORDER BY b.lease_period_start DESC NULLS LAST, b.bill_date DESC`,
    [leaseId, opco]
  )).rows;
  // ROUND 321: the ASC 842 lessee schedule (lease-to-own), each period with its bill and JE (both ways).
  const lesseeReady = await lesseeSchemaReady(client);
  const schedule = lesseeReady
    ? (await client.query(
        `SELECT s.id::text, s.lease_asset_line_id::text, s.period_no, s.period_start::text, s.payment_cents, s.interest_cents, s.principal_cents,
                s.liability_open_cents, s.liability_close_cents, s.rou_amortization_cents, s.rou_close_cents, s.lease_cost_cents,
                s.bill_id::text, b.display_id AS bill_display_id, s.accretion_je_id::text, s.posted_at::text
           FROM accounting.lease_lessee_schedule_period s
           LEFT JOIN accounting.bills b ON b.id = s.bill_id
          WHERE s.lease_contract_id = $1::uuid AND s.operating_company_id = $2::uuid AND s.voided_at IS NULL
          ORDER BY s.lease_asset_line_id, s.period_no`,
        [leaseId, opco]
      )).rows
    : [];
  // ROUND 381.4 — an empty schedule says WHY when the lessee schema is not on this database, never silently [].
  const schedule_unavailable_reason = lesseeReady ? null : "Lease-to-own accounting (migration 202615210000) is not applied on this database yet.";
  return { lease: head, assets, bills, schedule, schedule_unavailable_reason };
}

/** Reverse: a unit / trailer profile's leases, their monthly amount, bills and payments. */
export async function leasesForAsset(client: DbClient, opco: string, asset: { unitId?: string; equipmentId?: string }) {
  const col = asset.unitId ? "unit_uuid" : "equipment_id";
  const id = asset.unitId ?? asset.equipmentId;
  const contracts = (await client.query(
    `SELECT c.id::text, c.display_id, c.lease_type, c.status, c.commencement_date::text, c.end_date::text, c.signed_at,
            a.id::text AS asset_line_id, a.monthly_amount_cents, a.start_date::text AS asset_start, a.end_date::text AS asset_end,
            c.lessor_vendor_id::text, v.vendor_name AS lessor_vendor, lc.short_name AS lessor_company
       FROM accounting.lease_asset_line a
       JOIN accounting.lease_contract c ON c.id = a.lease_contract_id AND c.voided_at IS NULL
       LEFT JOIN mdata.vendors v ON v.id = c.lessor_vendor_id
       LEFT JOIN org.companies lc ON lc.id = c.lessor_operating_company_id
      WHERE a.${col} = $1::uuid AND a.deleted_at IS NULL AND c.operating_company_id = $2::uuid
      ORDER BY c.commencement_date DESC`,
    [id, opco]
  )).rows;
  const bills = (await client.query(
    `SELECT b.id::text AS bill_id, b.display_id, b.bill_date::text, b.lease_period_start::text, bl.amount::text AS line_amount, b.status, b.paid_cents, b.amount_cents,
            (SELECT bp.id::text FROM accounting.bill_payments bp WHERE bp.bill_id = b.id AND bp.voided_at IS NULL ORDER BY bp.payment_date DESC LIMIT 1) AS last_payment_id
       FROM accounting.bill_lines bl JOIN accounting.bills b ON b.id = bl.bill_id
      WHERE bl.${asset.unitId ? "unit_id" : "equipment_id"} = $1::uuid AND bl.lease_asset_line_id IS NOT NULL AND bl.voided_at IS NULL
        AND b.operating_company_id = $2::uuid AND b.voided_at IS NULL
      ORDER BY b.lease_period_start DESC NULLS LAST`,
    [id, opco]
  )).rows;
  return { contracts, bills };
}
