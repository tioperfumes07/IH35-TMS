/**
 * ROUND 321 (CC-1) — lease-to-own money side, ASC 842 LESSEE posting. Reuses createJournalEntryOnClient (no new GL
 * math beyond the schedule in lessee-schedule.ts) and the monthly lease bill engine.
 *
 *   SIGN (lease_to_own):  schedule per asset line -> commencement JE, per asset line, class = unit/trailer:
 *                           Dr rou_asset / Cr lease_liability  (PV)       — same transaction as the sign.
 *   EACH MONTHLY BILL:    the bill line debits lease_liability (the payment reduces the liability) instead of rent.
 *   PERIOD JE (per bill): FINANCE    Dr lease_interest_expense / Cr lease_liability            (interest accretion)
 *                                    Dr amortization_expense_default / Cr accumulated_rou_amortization
 *                         OPERATING  Dr rent_expense (straight-line lease cost) / Cr lease_liability (interest)
 *                                                                              / Cr accumulated_rou_amortization
 *                         The schedule row then carries bill_id + accretion_je_id (lease <-> bill <-> JE both ways).
 *   Idempotent: a period posts once (schedule row FOR UPDATE, accretion_je_id IS NULL); the cron re-runs heal a
 *   period whose bill committed but whose JE did not.
 * Fails closed by name: migration 202615210000 not applied, no discount rate, an unbound role.
 */
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { buildLesseeSchedule, classifyLessee, type LesseeClassification, type PurchaseOptionKind } from "./lessee-schedule.js";
import { ensureAssetClass } from "./lease-bill-engine.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

export class LesseePostingError extends Error {
  constructor(public code: string, message: string, public status = 409) {
    super(message);
  }
}

/** The lessee schema (migration 202615210000) is applied on this database. */
export async function lesseeSchemaReady(client: DbClient): Promise<boolean> {
  const r = await client.query<{ ok: boolean }>(
    `SELECT to_regclass('accounting.lease_lessee_schedule_period') IS NOT NULL
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'lease_contract' AND column_name = 'lessee_classification') AS ok`
  );
  return Boolean(r.rows[0]?.ok);
}

async function role(client: DbClient, opco: string, name: string): Promise<string> {
  const id = await resolveRoleAccountOptional(client as never, opco, name as never).catch(() => null);
  if (!id) throw new LesseePostingError("lessee_role_unbound", `Bind the "${name}" account on Accounting → CoA Roles before this lease-to-own can post.`, 409);
  return id;
}

/** Pure: months from commencement (YYYY-MM-01) through the end date's month, inclusive. */
export function leaseTermMonths(commencement: string, endDate: string): number {
  const [y0, m0] = commencement.split("-").map(Number);
  const [y1, m1] = endDate.split("-").map(Number);
  return (y1 - y0) * 12 + (m1 - m0) + 1;
}

/** Pure: allocate a contract-level purchase price across asset lines by monthly share, remainder on the last. */
export function allocateByShare(total: number, shares: number[]): number[] {
  const sum = shares.reduce((a, b) => a + b, 0);
  if (sum <= 0) return shares.map((_, i) => (i === shares.length - 1 ? total : 0));
  let used = 0;
  return shares.map((s, i) => {
    if (i === shares.length - 1) return total - used;
    const part = Math.round((total * s) / sum);
    used += part;
    return part;
  });
}

/** Pure: a JE line pair, flipping sides for a negative amount and dropping zero. */
export function legPair(amount: number, debitAccount: string, creditAccount: string, classId: string | null, description: string) {
  if (!amount) return [];
  const [dr, cr] = amount > 0 ? [debitAccount, creditAccount] : [creditAccount, debitAccount];
  const a = Math.abs(amount);
  return [
    { account_id: dr, class_id: classId, debit_or_credit: "debit" as const, amount_cents: a, description },
    { account_id: cr, class_id: classId, debit_or_credit: "credit" as const, amount_cents: a, description },
  ];
}

/**
 * Called inside signLease's transaction for a lease_to_own: builds the schedule per asset line, posts the commencement
 * JE and stamps the contract. Refuses (rolling the sign back) rather than signing an uncapitalized lease-to-own.
 */
export async function capitalizeLeaseToOwnOnSign(client: DbClient, opco: string, actorUserId: string, leaseId: string) {
  if (!(await lesseeSchemaReady(client))) {
    throw new LesseePostingError("lease_to_own_asc842_not_applied", "Lease-to-own accounting (migration 202615210000) is not applied on this database yet — ask the Lead to apply it, then sign.", 503);
  }
  const c = (await client.query<{
    display: string; commencement: string; end_date: string | null; rate: number | null; kind: string | null; price: string | null;
    esc_bps: number | null; esc_every: number | null; classified: string | null;
  }>(
    `SELECT COALESCE(display_id, left(id::text, 8)) AS display, commencement_date::text AS commencement, end_date::text AS end_date,
            discount_rate_bps AS rate, purchase_option_kind AS kind, purchase_option_price_cents::text AS price,
            escalation_pct_bps AS esc_bps, escalation_every_months AS esc_every, lessee_classification AS classified
       FROM accounting.lease_contract WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco]
  )).rows[0];
  if (!c) throw new LesseePostingError("lease_not_found", "Lease contract not found.", 404);
  if (c.classified) return { classification: c.classified as LesseeClassification, already: true };
  if (!c.end_date) throw new LesseePostingError("lease_to_own_end_date_required", "A lease-to-own needs an end date (the term) before it can be signed.");
  if (c.rate == null) throw new LesseePostingError("lease_to_own_rate_required", "A lease-to-own needs a discount rate (the rate in the contract, else the borrowing rate) before it can be signed.");
  const commencement = `${c.commencement.slice(0, 7)}-01`;
  const periods = leaseTermMonths(commencement, c.end_date);
  const classification = classifyLessee((c.kind ?? "none") as PurchaseOptionKind);
  const assets = (await client.query<{ id: string; unit_id: string | null; equipment_id: string | null; label: string; monthly: string }>(
    `SELECT a.id::text, a.unit_uuid::text AS unit_id, a.equipment_id::text, COALESCE(u.unit_number, e.equipment_number, left(a.id::text, 8)) AS label,
            COALESCE(a.monthly_amount_cents, 0)::text AS monthly
       FROM accounting.lease_asset_line a
       LEFT JOIN mdata.units u ON u.id = a.unit_uuid
       LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
      WHERE a.lease_contract_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.is_active AND a.deleted_at IS NULL
      ORDER BY label`,
    [leaseId, opco]
  )).rows;
  if (!assets.length) throw new LesseePostingError("lease_to_own_assets_required", "A lease-to-own needs at least one unit or trailer.");
  const rouAccount = await role(client, opco, "rou_asset");
  const liabilityAccount = await role(client, opco, "lease_liability");
  const options = allocateByShare(classification === "finance" ? Number(c.price ?? 0) : 0, assets.map((a) => Number(a.monthly)));

  const postings: ReturnType<typeof legPair> = [];
  const built: Array<{ asset: (typeof assets)[number]; classId: string; schedule: ReturnType<typeof buildLesseeSchedule> }> = [];
  let total = 0;
  for (let i = 0; i < assets.length; i++) {
    const a = assets[i];
    const schedule = buildLesseeSchedule({
      commencement, periods, baseMonthlyCents: Number(a.monthly), escalationBps: c.esc_bps, escalationEveryMonths: c.esc_every,
      annualRateBps: c.rate, classification, purchaseOptionCents: options[i],
    });
    const classId = await ensureAssetClass(client as never, opco, { unitId: a.unit_id, equipmentId: a.equipment_id, label: a.label }, actorUserId);
    postings.push(...legPair(schedule.liability_initial_cents, rouAccount, liabilityAccount, classId, `Lease ${c.display} · ${a.label} · ROU / lease liability at commencement`));
    built.push({ asset: a, classId, schedule });
    total += schedule.liability_initial_cents;
  }
  const je = await createJournalEntryOnClient(
    client as never,
    {
      operating_company_id: opco,
      entry_date: c.commencement,
      memo: `Lease-to-own ${c.display} — ASC 842 commencement (${classification}): ROU asset / lease liability`,
      source: "auto",
      source_transaction_type: "lease_contract",
      source_transaction_id: leaseId,
      postings,
    },
    { userId: actorUserId, role: "system" }
  );
  for (const b of built) {
    for (const p of b.schedule.periods) {
      await client.query(
        `INSERT INTO accounting.lease_lessee_schedule_period (
            operating_company_id, lease_contract_id, lease_asset_line_id, period_no, period_start, payment_cents, interest_cents,
            principal_cents, liability_open_cents, liability_close_cents, rou_amortization_cents, rou_close_cents, lease_cost_cents, created_by_user_id)
         VALUES ($1::uuid,$2::uuid,$3::uuid,$4,$5::date,$6,$7,$8,$9,$10,$11,$12,$13,$14::uuid)`,
        [opco, leaseId, b.asset.id, p.period_no, p.period_start, p.payment_cents, p.interest_cents, p.principal_cents,
          p.liability_open_cents, p.liability_close_cents, p.rou_amortization_cents, p.rou_close_cents, p.lease_cost_cents, actorUserId]
      );
    }
  }
  await client.query(
    `UPDATE accounting.lease_contract SET lessee_classification = $3, lessee_commencement_je_id = $4::uuid, lessee_liability_initial_cents = $5,
            purchase_option_kind = COALESCE(purchase_option_kind, 'none'), updated_at = now(), updated_by_user_id = $6::uuid
      WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco, classification, je.id, total, actorUserId]
  );
  await appendCrudAudit(client as never, actorUserId, "lease.capitalized",
    { resource_type: "accounting.lease_contract", resource_id: leaseId, operating_company_id: opco, classification, liability_initial_cents: total, commencement_je_id: je.id, periods, assets: assets.length },
    "info", "ROUND-321-LEASE-TO-OWN");
  return { classification, already: false, commencement_je_id: je.id, liability_initial_cents: total };
}

/** The bill engine's debit account for a capitalized contract (the payment reduces the liability). */
export async function capitalizedBillAccount(client: DbClient, opco: string, leaseId: string): Promise<string | null> {
  if (!(await lesseeSchemaReady(client))) return null;
  const r = await client.query<{ c: string | null }>(
    `SELECT lessee_classification AS c FROM accounting.lease_contract WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
    [leaseId, opco]
  );
  if (!r.rows[0]?.c) return null;
  return role(client, opco, "lease_liability");
}

/**
 * Posts the period JE for one capitalized asset line's billed period and links the schedule row to its bill + JE.
 * Idempotent; returns null when the line is not capitalized or the period already posted.
 */
export async function postLesseePeriod(client: DbClient, opco: string, actorUserId: string, args: { leaseAssetLineId: string; periodStart: string; billId: string }) {
  if (!(await lesseeSchemaReady(client))) return null;
  const row = (await client.query<{
    id: string; lease_contract_id: string; interest: string; amort: string; cost: string; accretion_je_id: string | null; posted: boolean;
    classification: string; display: string; expense_account_id: string | null; unit_id: string | null; equipment_id: string | null; label: string;
  }>(
    `SELECT s.id::text, s.lease_contract_id::text, s.interest_cents::text AS interest, s.rou_amortization_cents::text AS amort,
            s.lease_cost_cents::text AS cost, s.accretion_je_id::text, s.posted_at IS NOT NULL AS posted, lc.lessee_classification AS classification,
            COALESCE(lc.display_id, left(lc.id::text, 8)) AS display, lc.expense_account_id::text,
            a.unit_uuid::text AS unit_id, a.equipment_id::text, COALESCE(u.unit_number, e.equipment_number, left(a.id::text, 8)) AS label
       FROM accounting.lease_lessee_schedule_period s
       JOIN accounting.lease_contract lc ON lc.id = s.lease_contract_id
       JOIN accounting.lease_asset_line a ON a.id = s.lease_asset_line_id
       LEFT JOIN mdata.units u ON u.id = a.unit_uuid
       LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
      WHERE s.operating_company_id = $1::uuid AND s.lease_asset_line_id = $2::uuid AND s.period_start = $3::date AND s.voided_at IS NULL
      FOR UPDATE OF s`,
    [opco, args.leaseAssetLineId, args.periodStart]
  )).rows[0];
  if (!row || !row.classification) return null;
  if (row.accretion_je_id || row.posted) {
    await client.query(`UPDATE accounting.lease_lessee_schedule_period SET bill_id = COALESCE(bill_id, $2::uuid) WHERE id = $1::uuid`, [row.id, args.billId]);
    return null;
  }
  const liability = await role(client, opco, "lease_liability");
  const accum = await role(client, opco, "accumulated_rou_amortization");
  const classId = await ensureAssetClass(client as never, opco, { unitId: row.unit_id, equipmentId: row.equipment_id, label: row.label }, actorUserId);
  const what = `Lease ${row.display} · ${row.label} · ${args.periodStart.slice(0, 7)}`;
  const interest = Number(row.interest);
  const amort = Number(row.amort);
  let postings: ReturnType<typeof legPair>;
  if (row.classification === "finance") {
    const interestExp = await role(client, opco, "lease_interest_expense");
    const amortExp = await role(client, opco, "amortization_expense_default");
    postings = [...legPair(interest, interestExp, liability, classId, `${what} · interest`), ...legPair(amort, amortExp, accum, classId, `${what} · ROU amortization`)];
  } else {
    const leaseExp = row.expense_account_id ?? (await role(client, opco, "rent_expense"));
    postings = [...legPair(interest, leaseExp, liability, classId, `${what} · lease cost (interest)`), ...legPair(amort, leaseExp, accum, classId, `${what} · lease cost (ROU)`)];
  }
  let jeId: string | null = null;
  if (postings.length >= 2) {
    const je = await createJournalEntryOnClient(
      client as never,
      {
        operating_company_id: opco,
        entry_date: args.periodStart,
        memo: `Lease-to-own ${row.display} — ${args.periodStart.slice(0, 7)} ASC 842 ${row.classification} period (${row.label})`,
        source: "auto",
        source_transaction_type: "lease_contract",
        source_transaction_id: row.lease_contract_id,
        postings,
      },
      { userId: actorUserId, role: "system" }
    );
    jeId = je.id;
  }
  await client.query(
    `UPDATE accounting.lease_lessee_schedule_period SET bill_id = $2::uuid, accretion_je_id = $3::uuid, posted_at = now() WHERE id = $1::uuid`,
    [row.id, args.billId, jeId]
  );
  return { schedule_period_id: row.id, accretion_je_id: jeId };
}
