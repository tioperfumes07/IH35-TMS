/**
 * ROUND 321 (CC-1) — lease-to-own BUYOUT close, ASC 842 lessee (migration 202615210100 + 202615210000).
 *
 * Owner-only (the route reuses the lease engine's Owner gate). Two idempotent phases:
 *   A. the purchase bill to the lessor vendor (createBill, key BUYOUT:<lease>): per asset line, class = unit / trailer,
 *        Dr lease_liability  (the liability still carried — the fixed price for a finance lease, zero for operating)
 *        Dr fixed_asset_default (price above that liability: capitalized into the owned asset's cost)
 *        Cr A/P             (the owner pays it with the normal Pay Bill flow)
 *   B. one transaction: reclass JE per asset line  Dr accumulated_rou_amortization / Dr fixed_asset_default (ROU net)
 *        / Cr rou_asset (gross); title to the lessee (owner_company_id, leased-to cleared); fixed asset registered
 *        (cost = ROU net + price above the liability); asset lines + lease closed; bought_out_at / bill / JE stamped.
 *   Re-running after a phase-B failure finds the phase-A bill by key and finishes B (never a second bill).
 * Refuses by name: not a capitalized lease-to-own, already bought out, unposted periods up to the buyout month (generate
 * the remaining lease bills first), FMV buyout without a price, unbound roles, migration not applied.
 */
import { withCurrentUser } from "../auth/db.js";
import { createBill } from "../accounting/bills.service.js";
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";
import { resolveRoleAccountOptional } from "../accounting/coa-roles/resolver.service.js";
import { registerOwnedUnitAsFixedAsset } from "../accounting/owned-unit-fixed-asset-register.service.js";
import { appendCrudAudit } from "../audit/crud-audit.js";
import { allocateByShare, legPair, lesseeSchemaReady, LesseePostingError } from "./lessee-posting.service.js";
import { ensureAssetClass } from "./lease-bill-engine.service.js";

type DbClient = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[]; rowCount?: number | null }> };

type AssetState = {
  id: string; unit_id: string | null; equipment_id: string | null; label: string; monthly: number;
  liability: number; rou_gross: number; rou_net: number; unposted: number;
};

async function role(client: DbClient, opco: string, name: string): Promise<string> {
  const id = await resolveRoleAccountOptional(client as never, opco, name as never).catch(() => null);
  if (!id) throw new LesseePostingError("lessee_role_unbound", `Bind the "${name}" account on Accounting → CoA Roles before this buyout can post.`, 409);
  return id;
}

async function buyoutSchemaReady(client: DbClient): Promise<boolean> {
  if (!(await lesseeSchemaReady(client))) return false;
  const r = await client.query<{ ok: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'lease_contract' AND column_name = 'bought_out_at')
        AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'accounting' AND table_name = 'fixed_assets' AND column_name = 'equipment_id') AS ok`
  );
  return Boolean(r.rows[0]?.ok);
}

/** The owned asset's GL account: its fixed-asset class default (truck / trailer), else the fixed_asset_default role —
 *  the same account on the bill, the reclass JE and the register row, so the register ties to the GL. */
async function assetAccountFor(client: DbClient, opco: string, a: { unit_id: string | null }): Promise<string> {
  const r = await client.query<{ acct: string | null }>(
    `SELECT default_asset_account_id::text AS acct FROM accounting.fixed_asset_classes
      WHERE operating_company_id = $1::uuid AND class_code = $2 AND is_active AND deleted_at IS NULL LIMIT 1`,
    [opco, a.unit_id ? "truck" : "trailer"]
  );
  return r.rows[0]?.acct ?? role(client, opco, "fixed_asset_default");
}

/** Pure: the price above the carried liability is capitalized; a price below it is refused (not a buyout). */
export function buyoutSplit(price: number, liability: number): { settle: number; capitalize: number } {
  if (price < liability) throw new LesseePostingError("lease_buyout_price_below_liability", `The purchase price (${(price / 100).toFixed(2)}) is below the lease liability still carried (${(liability / 100).toFixed(2)}).`);
  return { settle: liability, capitalize: price - liability };
}

async function loadState(client: DbClient, opco: string, leaseId: string, buyoutDate: string) {
  const c = (await client.query<{
    display: string; lease_type: string | null; classification: string | null; kind: string | null; price: string | null;
    vendor_id: string | null; lessee: string | null; bought_out_at: string | null; status: string;
  }>(
    `SELECT COALESCE(display_id, left(id::text, 8)) AS display, lease_type, lessee_classification AS classification, purchase_option_kind AS kind,
            purchase_option_price_cents::text AS price, lessor_vendor_id::text AS vendor_id, lessee_operating_company_id::text AS lessee,
            bought_out_at::text, status
       FROM accounting.lease_contract WHERE id = $1::uuid AND operating_company_id = $2::uuid AND voided_at IS NULL FOR UPDATE`,
    [leaseId, opco]
  )).rows[0];
  if (!c) throw new LesseePostingError("lease_not_found", "Lease contract not found.", 404);
  if (c.lease_type !== "lease_to_own" || !c.classification) throw new LesseePostingError("lease_buyout_not_lease_to_own", "Only a signed (capitalized) lease-to-own can be bought out.");
  if (c.bought_out_at) throw new LesseePostingError("lease_already_bought_out", "This lease-to-own was already bought out.");
  if (c.status !== "active") throw new LesseePostingError("lease_not_active", `Only an active lease can be bought out (this one is ${c.status}).`);
  if (!c.vendor_id) throw new LesseePostingError("lease_buyout_vendor_required", "The lease has no lessor vendor to bill the purchase to.");
  const month = `${buyoutDate.slice(0, 7)}-01`;
  const assets = (await client.query<{ id: string; unit_id: string | null; equipment_id: string | null; label: string; monthly: string; liability: string | null; rou_gross: string | null; rou_net: string | null; unposted: string }>(
    `SELECT a.id::text, a.unit_uuid::text AS unit_id, a.equipment_id::text, COALESCE(u.unit_number, e.equipment_number, left(a.id::text, 8)) AS label,
            COALESCE(a.monthly_amount_cents, 0)::text AS monthly,
            (SELECT s.liability_close_cents FROM accounting.lease_lessee_schedule_period s WHERE s.lease_asset_line_id = a.id AND s.voided_at IS NULL AND s.posted_at IS NOT NULL ORDER BY s.period_no DESC LIMIT 1)::text AS liability,
            (SELECT s.liability_open_cents FROM accounting.lease_lessee_schedule_period s WHERE s.lease_asset_line_id = a.id AND s.voided_at IS NULL AND s.period_no = 1)::text AS rou_gross,
            (SELECT s.rou_close_cents FROM accounting.lease_lessee_schedule_period s WHERE s.lease_asset_line_id = a.id AND s.voided_at IS NULL AND s.posted_at IS NOT NULL ORDER BY s.period_no DESC LIMIT 1)::text AS rou_net,
            (SELECT count(*) FROM accounting.lease_lessee_schedule_period s WHERE s.lease_asset_line_id = a.id AND s.voided_at IS NULL AND s.posted_at IS NULL AND s.period_start <= $3::date)::text AS unposted
       FROM accounting.lease_asset_line a
       LEFT JOIN mdata.units u ON u.id = a.unit_uuid
       LEFT JOIN mdata.equipment e ON e.id = a.equipment_id
      WHERE a.lease_contract_id = $1::uuid AND a.operating_company_id = $2::uuid AND a.is_active AND a.deleted_at IS NULL
      ORDER BY label`,
    [leaseId, opco, month]
  )).rows;
  const state: AssetState[] = assets.map((a) => ({
    id: a.id, unit_id: a.unit_id, equipment_id: a.equipment_id, label: a.label, monthly: Number(a.monthly),
    // No posted period yet (buyout in the first month): the liability and ROU are still the commencement amounts.
    liability: a.liability != null ? Number(a.liability) : Number(a.rou_gross ?? 0),
    rou_gross: Number(a.rou_gross ?? 0),
    rou_net: a.rou_net != null ? Number(a.rou_net) : Number(a.rou_gross ?? 0),
    unposted: Number(a.unposted),
  }));
  const pending = state.filter((a) => a.unposted > 0);
  if (pending.length) throw new LesseePostingError("lease_buyout_unposted_periods", `Generate the remaining lease bills through ${month.slice(0, 7)} first — ${pending.map((a) => a.label).join(", ")} still have unposted periods.`);
  return { c, assets: state };
}

export type BuyoutInput = { buyout_date: string; price_cents?: number | null };

export async function buyOutLeaseToOwn(opco: string, actorUserId: string, leaseId: string, input: BuyoutInput) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.buyout_date)) throw new LesseePostingError("lease_buyout_date_required", "Enter the buyout date.");
  const inTx = <T>(fn: (c: DbClient) => Promise<T>) =>
    withCurrentUser(actorUserId, async (client) => {
      await client.query(`SELECT set_config('app.operating_company_id', $1::text, true)`, [opco]);
      return fn(client as DbClient);
    });

  // Phase A — the purchase bill (once, by key).
  const planned = await inTx(async (client) => {
    if (!(await buyoutSchemaReady(client))) throw new LesseePostingError("lease_to_own_asc842_not_applied", "Lease-to-own buyout (migrations 202615210000 + 202615210100) is not applied on this database yet — ask the Lead to apply them.");
    const { c, assets } = await loadState(client, opco, leaseId, input.buyout_date);
    const price = c.kind === "fixed" ? Number(c.price ?? 0) : Number(input.price_cents ?? NaN);
    if (!(Number.isInteger(price) && price >= 0)) throw new LesseePostingError("lease_buyout_price_required", "Enter the purchase price (fair market value) for this buyout.");
    const prices = allocateByShare(price, assets.map((a) => a.monthly));
    const splits = assets.map((a, i) => buyoutSplit(prices[i], a.liability));
    const liability = await role(client, opco, "lease_liability");
    const assetAccounts: string[] = [];
    for (const a of assets) assetAccounts.push(await assetAccountFor(client, opco, a));
    const classes: string[] = [];
    for (const a of assets) classes.push(await ensureAssetClass(client as never, opco, { unitId: a.unit_id, equipmentId: a.equipment_id, label: a.label }, actorUserId));
    const existing = (await client.query<{ id: string }>(
      `SELECT id::text FROM accounting.bills WHERE operating_company_id = $1::uuid AND lease_bill_key = $2 AND voided_at IS NULL LIMIT 1`,
      [opco, `BUYOUT:${leaseId}`]
    )).rows[0];
    return { c, assets, price, prices, splits, liability, assetAccounts, classes, existingBillId: existing?.id ?? null };
  });
  let billId = planned.existingBillId;
  if (!billId && planned.price > 0) {
    const lines = planned.assets.flatMap((a, i) => {
      const out: Array<Record<string, unknown>> = [];
      const common = { classId: planned.classes[i], unitId: a.unit_id, equipmentId: a.equipment_id, leaseContractId: leaseId, leaseAssetLineId: a.id, loadExemptionReason: "LEASE_RENT_NOT_LOAD_COST" };
      if (planned.splits[i].settle) out.push({ accountId: planned.liability, amountCents: planned.splits[i].settle, description: `Lease-to-own ${planned.c.display} · ${a.label} · buyout settles the lease liability`, ...common });
      if (planned.splits[i].capitalize) out.push({ accountId: planned.assetAccounts[i], amountCents: planned.splits[i].capitalize, description: `Lease-to-own ${planned.c.display} · ${a.label} · buyout price above the liability (asset cost)`, ...common });
      return out;
    });
    const bill = await createBill(
      {
        operatingCompanyId: opco,
        vendorId: planned.c.vendor_id as string,
        billNumber: `BUYOUT-${planned.c.display}`,
        billDate: input.buyout_date,
        amountCents: planned.price,
        memo: `Lease-to-own ${planned.c.display} — buyout (${planned.assets.length} ${planned.assets.length === 1 ? "unit" : "units"})`,
        leaseContractId: leaseId,
        leaseBillKey: `BUYOUT:${leaseId}`,
        lines,
      } as Parameters<typeof createBill>[0],
      actorUserId
    );
    billId = String((bill as { id?: string }).id);
  }

  // Phase B — reclass, title, register, close (one transaction).
  return inTx(async (client) => {
    const { c, assets } = await loadState(client, opco, leaseId, input.buyout_date);
    const rou = await role(client, opco, "rou_asset");
    const accum = await role(client, opco, "accumulated_rou_amortization");
    const postings = assets.flatMap((a, i) => [
      ...legPair(a.rou_gross - a.rou_net, accum, rou, planned.classes[i], `Lease-to-own ${c.display} · ${a.label} · close accumulated ROU amortization`),
      ...legPair(a.rou_net, planned.assetAccounts[i], rou, planned.classes[i], `Lease-to-own ${c.display} · ${a.label} · ROU asset to owned fixed asset`),
    ]);
    let jeId: string | null = null;
    if (postings.length >= 2) {
      const je = await createJournalEntryOnClient(
        client as never,
        {
          operating_company_id: opco,
          entry_date: input.buyout_date,
          memo: `Lease-to-own ${c.display} — buyout: ROU asset reclassified to owned fixed assets`,
          source: "auto",
          source_transaction_type: "lease_contract",
          source_transaction_id: leaseId,
          postings,
        },
        { userId: actorUserId, role: "system" }
      );
      jeId = je.id;
    }
    const registered: Array<{ label: string; fixed_asset_id: string | null; reason?: string }> = [];
    for (const [i, a] of assets.entries()) {
      const cost = a.rou_net + planned.splits[i].capitalize;
      if (a.unit_id) {
        await client.query(`UPDATE mdata.units SET owner_company_id = $2::uuid, currently_leased_to_company_id = NULL, updated_at = now() WHERE id = $1::uuid`, [a.unit_id, opco]);
        const r = cost > 0 ? await registerOwnedUnitAsFixedAsset(client as never, { operating_company_id: opco, owner_operating_company_id: opco, unit_uuid: a.unit_id, purchase_price_cents: cost, purchase_date: input.buyout_date, in_service_date: input.buyout_date, actor_user_id: actorUserId }) : { created: false, reason: "invalid_price" as const };
        if (r.fixed_asset_id) await client.query(`UPDATE accounting.fixed_assets SET asset_account_id = COALESCE(asset_account_id, $2::uuid) WHERE id = $1::uuid`, [r.fixed_asset_id, planned.assetAccounts[i]]);
        registered.push({ label: a.label, fixed_asset_id: r.fixed_asset_id ?? null, reason: r.created ? undefined : r.reason });
      } else if (a.equipment_id) {
        await client.query(`UPDATE mdata.equipment SET owner_company_id = $2::uuid, currently_leased_to_company_id = NULL, updated_at = now() WHERE id = $1::uuid`, [a.equipment_id, opco]);
        registered.push({ label: a.label, ...(cost > 0 ? await registerTrailer(client, opco, a, cost, input.buyout_date, actorUserId, planned.assetAccounts[i]) : { fixed_asset_id: null, reason: "invalid_price" }) });
      }
      await client.query(`UPDATE accounting.lease_asset_line SET end_date = $2::date, updated_at = now(), updated_by_user_id = $3::uuid WHERE id = $1::uuid`, [a.id, input.buyout_date, actorUserId]);
    }
    await client.query(
      `UPDATE accounting.lease_contract
          SET status = 'ended', closed_at = $3::date, closed_by_user_id = $4::uuid, close_reason = 'Lease-to-own buyout',
              bought_out_at = now(), buyout_bill_id = $5::uuid, buyout_je_id = $6::uuid, updated_at = now(), updated_by_user_id = $4::uuid
        WHERE id = $1::uuid AND operating_company_id = $2::uuid`,
      [leaseId, opco, input.buyout_date, actorUserId, billId, jeId]
    );
    await appendCrudAudit(client as never, actorUserId, "lease.bought_out",
      { resource_type: "accounting.lease_contract", resource_id: leaseId, operating_company_id: opco, price_cents: planned.price, bill_id: billId, je_id: jeId, assets: registered },
      "warning", "ROUND-321-LEASE-TO-OWN");
    return { lease_id: leaseId, bill_id: billId, je_id: jeId, price_cents: planned.price, assets: registered };
  });
}

/** A bought-out trailer in the fixed-asset register (class 'trailer', same shape as the unit register). */
async function registerTrailer(client: DbClient, opco: string, a: AssetState, cost: number, date: string, actorUserId: string, assetAccount: string): Promise<{ fixed_asset_id: string | null; reason?: string }> {
  const existing = (await client.query<{ id: string }>(
    `SELECT id::text FROM accounting.fixed_assets WHERE operating_company_id = $1::uuid AND equipment_id = $2::uuid AND deleted_at IS NULL AND voided_at IS NULL LIMIT 1`,
    [opco, a.equipment_id]
  )).rows[0];
  if (existing) return { fixed_asset_id: existing.id, reason: "already_registered" };
  const cls = (await client.query<{ id: string; method: string | null; life: number | null; asset: string | null; accum: string | null; expense: string | null }>(
    `SELECT id::text, default_method AS method, default_useful_life_months AS life, default_asset_account_id::text AS asset,
            default_accum_depr_account_id::text AS accum, default_depr_expense_account_id::text AS expense
       FROM accounting.fixed_asset_classes WHERE operating_company_id = $1::uuid AND class_code = 'trailer' AND is_active AND deleted_at IS NULL LIMIT 1`,
    [opco]
  )).rows[0];
  if (!cls) return { fixed_asset_id: null, reason: "class_missing" };
  const vin = (await client.query<{ vin: string | null }>(`SELECT vin FROM mdata.equipment WHERE id = $1::uuid`, [a.equipment_id])).rows[0]?.vin ?? null;
  const ins = await client.query<{ id: string }>(
    `INSERT INTO accounting.fixed_assets (
        operating_company_id, owner_operating_company_id, asset_number, name, class_id, equipment_id, vin_serial, purchase_price_cents,
        salvage_value_cents, purchase_date, in_service_date, method, useful_life_months, convention, asset_account_id, accum_depr_account_id,
        depr_expense_account_id, status, is_active, created_by_user_id, updated_by_user_id)
     VALUES ($1::uuid, $1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7, 0, $8::date, $8::date, $9, $10, 'half_month', $11::uuid, $12::uuid, $13::uuid, 'active', true, $14::uuid, $14::uuid)
     RETURNING id::text`,
    [opco, `FA-${a.label}`, `Trailer ${a.label}`, cls.id, a.equipment_id, vin, cost, date, cls.method || "straight_line", cls.life || 60, cls.asset ?? assetAccount, cls.accum, cls.expense, actorUserId]
  );
  await appendCrudAudit(client as never, actorUserId, "accounting.fixed_assets.registered",
    { resource_type: "accounting.fixed_assets", resource_id: ins.rows[0].id, operating_company_id: opco, equipment_id: a.equipment_id, purchase_price_cents: cost, source: "lease_to_own_buyout" },
    "info", "ROUND-321-LEASE-TO-OWN");
  return { fixed_asset_id: ins.rows[0].id };
}
