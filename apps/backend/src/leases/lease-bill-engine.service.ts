/**
 * ROUND 316 — MONTHLY LEASE BILL ENGINE. Each month, every live lease produces real vendor bills through the
 * CANONICAL bill engine (accounting/bills.service.ts createBill -> bill GL poster: Dr lease expense / Cr A/P):
 *   billing_mode one_bill_all_units  -> one bill per contract per month, a line per unit / trailer
 *   billing_mode one_bill_per_unit   -> one bill per unit / trailer per month
 * Every line carries its unit or trailer, its Class (class = unit: catalogs.classes.unit_id / equipment_id, found
 * or created), the lease contract and the asset line; the bill carries lease_contract_id, lease_period_start and an
 * idempotency key (bills_one_live_lease_bill_per_key), so re-running a month never duplicates.
 * GATE (owner's Feed Gate contract applied to lease bills): a bill posts only with vendor, unit/trailer, period,
 * account and class — otherwise it is refused with the reason, never posted half-formed.
 * Account: the contract's expense_account_id, else the entity's rent_expense role (fails closed until designated).
 * Escalation: monthly amount x (1 + escalation_pct_bps / 10000) ^ floor(months since commencement / every N).
 */
import { withCurrentUser, withLuciaBypass } from "../auth/db.js";
import { createBill } from "../accounting/bills.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { SYSTEM_ACTOR_USER_ID } from "../lib/system-actor.js";
import { assertTenantContext } from "../cron/_helpers/tenant-context-guard.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type LeaseBillLinePlan = {
  lease_contract_id: string;
  lease_asset_line_id: string;
  unit_id: string | null;
  equipment_id: string | null;
  asset_label: string;
  amount_cents: number;
  class_id: string | null;
  account_id: string | null;
};
export type LeaseBillPlan = {
  key: string;
  lease_contract_id: string;
  lease_display: string;
  vendor_id: string | null;
  period_start: string;
  lines: LeaseBillLinePlan[];
};
export type GateResult = { ok: true } | { ok: false; reason: string };

/** Pure: the escalated monthly amount for a month. */
export function escalatedAmount(baseCents: number, commencement: string, periodStart: string, bps: number | null, everyMonths: number | null): number {
  if (!bps || !everyMonths || everyMonths <= 0) return baseCents;
  const [y0, m0] = commencement.split("-").map(Number);
  const [y1, m1] = periodStart.split("-").map(Number);
  const elapsed = Math.max(0, (y1 - y0) * 12 + (m1 - m0));
  const steps = Math.floor(elapsed / everyMonths);
  return Math.round(baseCents * Math.pow(1 + bps / 10000, steps));
}

/** Pure: the gate — vendor, unit/trailer, period, account, class on every line. */
export function gateLeaseBill(plan: LeaseBillPlan): GateResult {
  if (!plan.vendor_id) return { ok: false, reason: "no lessor vendor on the contract" };
  if (!/^\d{4}-\d{2}-01$/.test(plan.period_start)) return { ok: false, reason: "no lease period" };
  if (!plan.lines.length) return { ok: false, reason: "no unit or trailer is leased in this month" };
  for (const l of plan.lines) {
    if (!l.unit_id && !l.equipment_id) return { ok: false, reason: `line ${l.asset_label}: no unit or trailer` };
    if (!l.account_id) return { ok: false, reason: `line ${l.asset_label}: no lease expense account (set the contract's account or designate the rent_expense role)` };
    if (!l.class_id) return { ok: false, reason: `line ${l.asset_label}: no class for the unit / trailer` };
    if (!(l.amount_cents > 0)) return { ok: false, reason: `line ${l.asset_label}: monthly amount is zero` };
  }
  return { ok: true };
}

/** Pure: group the month's lines into bills by the contract's billing mode. */
export function groupIntoBills(
  contract: { id: string; display: string; vendor_id: string | null; billing_mode: string | null },
  periodStart: string,
  lines: LeaseBillLinePlan[]
): LeaseBillPlan[] {
  const ym = periodStart.slice(0, 7);
  if (contract.billing_mode === "one_bill_per_unit") {
    return lines.map((l) => ({ key: `A:${l.lease_asset_line_id}:${ym}`, lease_contract_id: contract.id, lease_display: contract.display, vendor_id: contract.vendor_id, period_start: periodStart, lines: [l] }));
  }
  return [{ key: `C:${contract.id}:${ym}`, lease_contract_id: contract.id, lease_display: contract.display, vendor_id: contract.vendor_id, period_start: periodStart, lines }];
}

/** Class = unit: the unit's / trailer's class in this entity, created on first use (name = unit / trailer number). */
export async function ensureAssetClass(client: DbClient, opco: string, asset: { unitId?: string | null; equipmentId?: string | null; label: string }, actorUserId: string): Promise<string> {
  const col = asset.unitId ? "unit_id" : "equipment_id";
  const id = asset.unitId ?? asset.equipmentId;
  const found = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.classes WHERE operating_company_id = $1::uuid AND ${col} = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
    [opco, id]
  );
  if (found.rows[0]) return found.rows[0].id;
  const made = await client.query<{ id: string }>(
    `INSERT INTO catalogs.classes (class_name, class_code, operating_company_id, ${col}, notes, created_by_user_id)
     VALUES ($1, $1, $2::uuid, $3::uuid, 'Class = unit (lease bill engine)', $4::uuid)
     ON CONFLICT DO NOTHING
     RETURNING id::text`,
    [asset.label, opco, id, actorUserId]
  );
  if (made.rows[0]) return made.rows[0].id;
  const again = await client.query<{ id: string }>(
    `SELECT id::text FROM catalogs.classes WHERE operating_company_id = $1::uuid AND ${col} = $2::uuid AND deactivated_at IS NULL LIMIT 1`,
    [opco, id]
  );
  return again.rows[0].id;
}

/** Plans the month's bills for an entity (optionally one contract). Writes only classes (find-or-create). */
export async function planLeaseBills(client: DbClient, opco: string, periodStart: string, actorUserId: string, leaseId?: string): Promise<LeaseBillPlan[]> {
  const contracts = await client.query<{
    id: string; display: string; vendor_id: string | null; billing_mode: string | null; commencement: string;
    escalation_pct_bps: number | null; escalation_every_months: number | null; expense_account_id: string | null;
  }>(
    `SELECT c.id::text, COALESCE(c.display_id, left(c.id::text, 8)) AS display, c.lessor_vendor_id::text AS vendor_id, c.billing_mode,
            c.commencement_date::text AS commencement, c.escalation_pct_bps, c.escalation_every_months, c.expense_account_id::text
       FROM accounting.lease_contract c
      WHERE c.operating_company_id = $1::uuid AND c.voided_at IS NULL AND c.deleted_at IS NULL
        AND c.status IN ('active', 'ended') AND c.signed_at IS NOT NULL
        AND c.commencement_date <= ($2::date + interval '1 month' - interval '1 day')
        AND c.end_date >= $2::date
        AND (c.closed_at IS NULL OR c.closed_at >= $2::date)
        AND ($3::uuid IS NULL OR c.id = $3::uuid)
      ORDER BY c.commencement_date, c.id`,
    [opco, periodStart, leaseId ?? null]
  );
  const roleAccount = await resolveRoleAccountOptional(client as never, opco, "rent_expense" as never).catch(() => null);
  const plans: LeaseBillPlan[] = [];
  for (const c of contracts.rows) {
    const assets = await client.query<{ id: string; unit_id: string | null; equipment_id: string | null; label: string; monthly: string }>(
      `SELECT a.id::text, a.unit_uuid::text AS unit_id, a.equipment_id::text, COALESCE(u.unit_number, e.equipment_number, left(a.id::text, 8)) AS label,
              COALESCE(a.monthly_amount_cents, 0)::text AS monthly
         FROM accounting.lease_asset_line a
         LEFT JOIN mdata.units u ON u.id = a.unit_uuid
         LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
        WHERE a.lease_contract_id = $1::uuid AND a.deleted_at IS NULL AND a.is_active
          AND COALESCE(a.start_date, $3::date) <= ($2::date + interval '1 month' - interval '1 day')
          AND (a.end_date IS NULL OR a.end_date >= $2::date)
        ORDER BY label`,
      [c.id, periodStart, c.commencement]
    );
    const lines: LeaseBillLinePlan[] = [];
    for (const a of assets.rows) {
      const classId = await ensureAssetClass(client, opco, { unitId: a.unit_id, equipmentId: a.equipment_id, label: a.label }, actorUserId);
      lines.push({
        lease_contract_id: c.id,
        lease_asset_line_id: a.id,
        unit_id: a.unit_id,
        equipment_id: a.equipment_id,
        asset_label: a.label,
        amount_cents: escalatedAmount(Number(a.monthly), c.commencement, periodStart, c.escalation_pct_bps, c.escalation_every_months),
        class_id: classId,
        account_id: c.expense_account_id ?? roleAccount ?? null,
      });
    }
    plans.push(...groupIntoBills({ id: c.id, display: c.display, vendor_id: c.vendor_id, billing_mode: c.billing_mode }, periodStart, lines));
  }
  return plans;
}

export type LeaseBillRunResult = { period_start: string; created: Array<{ key: string; bill_id: string; amount_cents: number }>; skipped_existing: string[]; refused: Array<{ key: string; reason: string }> };

/** Generates the month's lease bills for one entity. Idempotent per key. */
export async function generateLeaseBills(opco: string, periodStart: string, actorUserId: string, leaseId?: string): Promise<LeaseBillRunResult> {
  const out: LeaseBillRunResult = { period_start: periodStart, created: [], skipped_existing: [], refused: [] };
  const plans = await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    return planLeaseBills(client as DbClient, opco, periodStart, actorUserId, leaseId);
  });
  for (const plan of plans) {
    const exists = await withCurrentUser(actorUserId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      return (await (client as DbClient).query(
        `SELECT 1 FROM accounting.bills WHERE operating_company_id = $1::uuid AND lease_bill_key = $2 AND voided_at IS NULL AND revoked_at IS NULL`,
        [opco, plan.key]
      )).rows.length > 0;
    });
    if (exists) { out.skipped_existing.push(plan.key); continue; }
    const gate = gateLeaseBill(plan);
    if (!gate.ok) { out.refused.push({ key: plan.key, reason: gate.reason }); continue; }
    const total = plan.lines.reduce((s, l) => s + l.amount_cents, 0);
    const single = plan.lines.length === 1 ? plan.lines[0] : null;
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: plan.vendor_id as string,
        billNumber: `LEASE-${plan.lease_display}-${plan.period_start.slice(0, 7)}${single ? `-${single.asset_label}` : ""}`,
        billDate: plan.period_start,
        amountCents: total,
        memo: `Lease ${plan.lease_display} — ${plan.period_start.slice(0, 7)} (${plan.lines.length} ${plan.lines.length === 1 ? "unit" : "units"})`,
        unitId: single?.unit_id ?? null,
        trailerId: single?.equipment_id ?? null,
        classId: single?.class_id ?? null,
        leasePeriodStart: plan.period_start,
        leaseContractId: plan.lease_contract_id,
        leaseBillKey: plan.key,
        lines: plan.lines.map((l) => ({
          accountId: l.account_id,
          amountCents: l.amount_cents,
          description: `Lease ${plan.lease_display} · ${l.asset_label} · ${plan.period_start.slice(0, 7)}`,
          loadExemptionReason: "LEASE_RENT_NOT_LOAD_COST",
          classId: l.class_id,
          unitId: l.unit_id,
          equipmentId: l.equipment_id,
          leaseContractId: l.lease_contract_id,
          leaseAssetLineId: l.lease_asset_line_id,
        })),
      } as Parameters<typeof createBill>[0],
      actorUserId
    );
    out.created.push({ key: plan.key, bill_id: String((bill as { id?: string }).id), amount_cents: total });
  }
  await withCurrentUser(actorUserId, async (client) => {
    await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
    await appendCrudAudit(client as never, actorUserId, "lease.bills_generated",
      { resource_type: "accounting.bills", operating_company_id: opco, period_start: periodStart, created: out.created.length, skipped: out.skipped_existing.length, refused: out.refused },
      out.refused.length ? "warning" : "info", "ROUND-316-LEASE-BILLS");
  });
  return out;
}

/** First day of the current month in America/Chicago. */
export function currentPeriodStartCT(now = new Date()): string {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
  return `${d.slice(0, 7)}-01`;
}

/** Cron: the current month, every entity that has a live lease; one entity at a time. */
export async function runLeaseBillCronTick(): Promise<void> {
  const period = currentPeriodStartCT();
  const companies = await withLuciaBypass(async (client) =>
    (await (client as DbClient).query<{ id: string }>(
      `SELECT DISTINCT operating_company_id::text AS id FROM accounting.lease_contract WHERE status = 'active' AND voided_at IS NULL ORDER BY 1`
    )).rows
  );
  for (const c of companies) {
    assertTenantContext(c.id, "leases.monthly_bill_cron");
    await generateLeaseBills(c.id, period, SYSTEM_ACTOR_USER_ID);
  }
}
