import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { leasesApi, type BillingMode, type LeaseType } from "../../api/leases";
import { listEquipment, listUnits, listVendors } from "../../api/mdata";
import { listCoaAccountsForJe } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { companyToday } from "../../lib/businessDate";
import { formatUsdCentsTable } from "../../lib/money";
import { userFacingApiError } from "../../lib/api-error-message";
import { Button } from "../Button";
import { ParityDrawer } from "../parity/ParityDrawer";
import { ReferenceSelect, type ReferenceOption } from "../parity/ReferenceSelect";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";

/**
 * ROUND 316 — Truck Lease / Trailer Lease / Lease-to-Own creator. Owner-only (the API refuses everyone else).
 * The lessee is the entity you are in (USMCA); the lessor is the company that owns the equipment AND its vendor
 * record (the monthly lease bill is owed to that vendor). Owner 2026-10-01: you choose ONE BILL PER UNIT or ONE
 * BILL FOR ALL UNITS. Multi-select the lessor's trucks / trailers, each with its own monthly amount.
 */
const TYPE_LABEL: Record<LeaseType, string> = { truck_lease: "Truck lease", trailer_lease: "Trailer lease", lease_to_own: "Lease-to-own" };
type AssetRow = { id: string; label: string; kind: "unit" | "equipment" };

export function LeaseContractCreator({ open, onClose, onCreated, defaultType = "truck_lease" }: { open: boolean; onClose: () => void; onCreated?: (id: string) => void; defaultType?: LeaseType }) {
  const { selectedCompanyId, companies } = useCompanyContext();
  const opco = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [leaseType, setLeaseType] = useState<LeaseType>(defaultType);
  const [billingMode, setBillingMode] = useState<BillingMode | null>(null);
  const [lessorCompanyId, setLessorCompanyId] = useState<string | null>(null);
  const [lessorVendorId, setLessorVendorId] = useState<string | null>(null);
  const [start, setStart] = useState(companyToday());
  const [end, setEnd] = useState("");
  const [deposit, setDeposit] = useState<number | null>(null);
  const [escPct, setEscPct] = useState("");
  const [escEvery, setEscEvery] = useState("");
  // ROUND 321 lease-to-own (ASC 842 lessee): FMV purchase option -> operating, fixed price -> finance (owner B1 rule).
  const [ratePct, setRatePct] = useState("");
  const [optKind, setOptKind] = useState<"" | "none" | "fmv" | "fixed">("");
  const [optPrice, setOptPrice] = useState<number | null>(null);
  const isLto = leaseType === "lease_to_own";
  const [election, setElection] = useState<"operating" | "sales_type">("operating");
  const [accountId, setAccountId] = useState<string | null>(null);
  const [displayId, setDisplayId] = useState("");
  const [picked, setPicked] = useState<Record<string, number | null>>({});
  const [error, setError] = useState<string | null>(null);

  const lessorOptions: ReferenceOption[] = useMemo(
    () => companies.filter((c) => c.id !== opco).map((c) => ({ value: c.id, label: c.short_name ?? c.legal_name })),
    [companies, opco]
  );
  const vendors = useQuery({ queryKey: ["vendors", "lease-lessor", opco], queryFn: () => listVendors({ operating_company_id: opco, limit: 2000 }), enabled: open && Boolean(opco) });
  const vendorOptions: ReferenceOption[] = useMemo(() => {
    const raw = vendors.data as unknown;
    const rows = Array.isArray(raw) ? raw : ((raw as { vendors?: unknown[] })?.vendors ?? []);
    return (rows as Array<{ id: string; name: string }>).map((v) => ({ value: v.id, label: v.name }));
  }, [vendors.data]);
  const accounts = useQuery({ queryKey: ["coa", "lease-expense", opco], queryFn: () => listCoaAccountsForJe(opco, { postableOnly: true }), enabled: open && Boolean(opco) });
  const accountOptions: ReferenceOption[] = useMemo(
    () => (accounts.data?.accounts ?? []).map((a) => ({ value: a.id, label: formatAccountDisplayLabel(a), type: a.account_type ?? undefined })),
    [accounts.data]
  );
  const wantTrailers = leaseType === "trailer_lease";
  const fleet = useQuery({
    queryKey: ["fleet", "lease-assets", lessorCompanyId, wantTrailers],
    enabled: open && Boolean(lessorCompanyId),
    queryFn: async (): Promise<AssetRow[]> => {
      if (wantTrailers) {
        const r = await listEquipment({ operating_company_id: String(lessorCompanyId), limit: 1000 });
        return (r.equipment ?? [])
          .filter((e) => (e as { owner_company_id?: string }).owner_company_id === lessorCompanyId)
          .map((e) => ({ id: e.id, label: e.equipment_number ?? e.id.slice(0, 8), kind: "equipment" as const }));
      }
      const r = await listUnits({ operating_company_id: lessorCompanyId });
      return (r.units as Array<{ id: string; unit_number?: string; owner_company_id?: string; kind?: string }>)
        .filter((u) => u.kind !== "trailer" && u.owner_company_id === lessorCompanyId)
        .map((u) => ({ id: u.id, label: u.unit_number ?? u.id.slice(0, 8), kind: "unit" as const }));
    },
  });
  const assets = fleet.data ?? [];
  const selected = Object.entries(picked);
  const monthlyTotal = selected.reduce((s, [, c]) => s + (c ?? 0), 0);

  const create = useMutation({
    mutationFn: () =>
      leasesApi.create({
        operating_company_id: opco,
        lease_type: leaseType,
        billing_mode: billingMode as BillingMode,
        lessor_operating_company_id: String(lessorCompanyId),
        lessor_vendor_id: String(lessorVendorId),
        commencement_date: start,
        end_date: end,
        deposit_cents: deposit,
        escalation_pct_bps: escPct ? Math.round(Number(escPct) * 100) : null,
        escalation_every_months: escEvery ? Number(escEvery) : null,
        election,
        expense_account_id: accountId,
        display_id: displayId.trim() || null,
        ...(isLto
          ? { discount_rate_bps: Math.round(Number(ratePct) * 100), purchase_option_kind: optKind || null, purchase_option_price_cents: optKind === "fixed" ? optPrice : null }
          : {}),
        assets: selected.map(([id, cents]) => {
          const a = assets.find((x) => x.id === id);
          return a?.kind === "equipment" ? { equipment_id: id, monthly_amount_cents: cents ?? 0 } : { unit_id: id, monthly_amount_cents: cents ?? 0 };
        }),
      }),
    onSuccess: (r) => {
      void qc.invalidateQueries({ queryKey: ["leases"] });
      onCreated?.(r.id);
      onClose();
    },
    onError: (e) => setError(userFacingApiError(e, "Could not save the lease.")),
  });
  const missing = [
    !billingMode && "choose one bill per unit or one bill for all units",
    !lessorCompanyId && "lessor company",
    !lessorVendorId && "lessor vendor",
    !end && "end date",
    !selected.length && "at least one unit / trailer",
    selected.some(([, c]) => c == null) && "a monthly amount for every selected unit / trailer",
    isLto && (ratePct === "" || !(Number(ratePct) >= 0)) && "discount rate",
    isLto && !optKind && "purchase option",
    isLto && optKind === "fixed" && optPrice == null && "purchase price",
  ].filter(Boolean) as string[];

  return (
    <ParityDrawer open={open} onClose={onClose} title={`New ${TYPE_LABEL[leaseType]}`} subtitle="Saves as a draft; sign it (backdating allowed) from the lease page. Owner only." size="wide">
      <div className="space-y-3 text-xs" data-testid="lease-contract-creator">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 font-semibold text-gray-600">
            Lease type
            <select className="rounded-sm border border-gray-300 px-2 py-1" value={leaseType} onChange={(e) => { setLeaseType(e.target.value as LeaseType); setPicked({}); }}>
              {(Object.keys(TYPE_LABEL) as LeaseType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1 font-semibold text-gray-600">
            Lessor company (owns the equipment)
            <select className="rounded-sm border border-gray-300 px-2 py-1" value={lessorCompanyId ?? ""} onChange={(e) => { setLessorCompanyId(e.target.value || null); setPicked({}); }}>
              <option value="">Select…</option>
              {lessorOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1 font-semibold text-gray-600">
            Lessor vendor (bill is owed to)
            <ReferenceSelect value={lessorVendorId} onChange={setLessorVendorId} options={vendorOptions} createKind="vendor" operatingCompanyId={opco} placeholder="Select…" loading={vendors.isLoading} onOptionCreated={() => void vendors.refetch()} />
          </div>
        </div>

        <fieldset className="rounded-sm border border-gray-200 p-2" data-testid="lease-billing-mode">
          <legend className="px-1 font-semibold text-slate-900">How should this lease be billed each month?</legend>
          <label className="mr-4 inline-flex items-center gap-1">
            <input type="radio" name="billing_mode" checked={billingMode === "one_bill_per_unit"} onChange={() => setBillingMode("one_bill_per_unit")} /> One bill for each unit
          </label>
          <label className="inline-flex items-center gap-1">
            <input type="radio" name="billing_mode" checked={billingMode === "one_bill_all_units"} onChange={() => setBillingMode("one_bill_all_units")} /> One bill for all the units
          </label>
        </fieldset>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <label className="flex flex-col gap-1 font-semibold text-gray-600">Commencement (backdating allowed)<DatePicker value={start} onChange={setStart} /></label>
          <label className="flex flex-col gap-1 font-semibold text-gray-600">End<DatePicker value={end} onChange={setEnd} /></label>
          <label className="flex flex-col gap-1 font-semibold text-gray-600">Deposit<MoneyInput valueCents={deposit} onChangeCents={setDeposit} /></label>
          <label className="flex flex-col gap-1 font-semibold text-gray-600">Contract number<input className="rounded-sm border border-gray-300 px-2 py-1" value={displayId} onChange={(e) => setDisplayId(e.target.value)} placeholder="optional" /></label>
          <label className="flex flex-col gap-1 font-semibold text-gray-600">Escalation %<input className="rounded-sm border border-gray-300 px-2 py-1" inputMode="decimal" value={escPct} onChange={(e) => setEscPct(e.target.value)} placeholder="e.g. 3" /></label>
          <label className="flex flex-col gap-1 font-semibold text-gray-600">Every (months)<input className="rounded-sm border border-gray-300 px-2 py-1" inputMode="numeric" value={escEvery} onChange={(e) => setEscEvery(e.target.value)} placeholder="e.g. 12" /></label>
          {isLto ? (
            <>
              <label className="flex flex-col gap-1 font-semibold text-gray-600">Discount rate % (annual)<input className="rounded-sm border border-gray-300 px-2 py-1" inputMode="decimal" value={ratePct} onChange={(e) => setRatePct(e.target.value)} placeholder="rate in the contract, e.g. 8" /></label>
              <label className="flex flex-col gap-1 font-semibold text-gray-600">
                Purchase option
                <select className="rounded-sm border border-gray-300 px-2 py-1" value={optKind} onChange={(e) => setOptKind(e.target.value as "" | "none" | "fmv" | "fixed")}>
                  <option value="">Choose…</option>
                  <option value="fmv">Fair market value at the end (operating lease)</option>
                  <option value="fixed">Fixed price (finance lease)</option>
                  <option value="none">No purchase option (operating lease)</option>
                </select>
              </label>
              {optKind === "fixed" ? <label className="flex flex-col gap-1 font-semibold text-gray-600">Purchase price<MoneyInput valueCents={optPrice} onChangeCents={setOptPrice} /></label> : null}
            </>
          ) : null}
          <label className="flex flex-col gap-1 font-semibold text-gray-600">
            ASC 842 class
            <select className="rounded-sm border border-gray-300 px-2 py-1" value={election} onChange={(e) => setElection(e.target.value as "operating" | "sales_type")}>
              <option value="operating">Operating</option>
              <option value="sales_type">Sales-type / finance</option>
            </select>
          </label>
          <div className="flex flex-col gap-1 font-semibold text-gray-600">
            Lease expense account
            <ReferenceSelect value={accountId} onChange={setAccountId} options={accountOptions} createKind="account" operatingCompanyId={opco} placeholder="Default: rent_expense role" loading={accounts.isLoading} onOptionCreated={() => void accounts.refetch()} />
          </div>
        </div>

        <div className="rounded-sm border border-gray-200" data-testid="lease-asset-multiselect">
          <div className="flex items-center justify-between border-b border-gray-200 px-2 py-1">
            <span className="font-semibold text-slate-900">{wantTrailers ? "Trailers" : "Trucks"} owned by the lessor — select and enter each monthly amount</span>
            <span className="text-gray-600">{selected.length} selected · monthly total {formatUsdCentsTable(monthlyTotal)}</span>
          </div>
          {!lessorCompanyId ? (
            <p className="p-2 text-gray-500">Choose the lessor company to list its equipment.</p>
          ) : fleet.isLoading ? (
            <p className="p-2 text-gray-500">Loading…</p>
          ) : (
            <ul className="max-h-72 divide-y divide-gray-100 overflow-auto">
              {assets.map((a) => {
                const on = a.id in picked;
                return (
                  <li key={a.id} className="flex items-center gap-2 px-2 py-1">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => setPicked((p) => { const n = { ...p }; if (e.target.checked) n[a.id] = null; else delete n[a.id]; return n; })}
                      aria-label={`Lease ${a.label}`}
                    />
                    <span className="w-28 font-semibold">{a.label}</span>
                    {on ? (
                      <span className="w-40"><MoneyInput valueCents={picked[a.id]} onChangeCents={(c) => setPicked((p) => ({ ...p, [a.id]: c }))} /></span>
                    ) : null}
                  </li>
                );
              })}
              {assets.length === 0 ? <li className="p-2 text-gray-500">This company owns no active {wantTrailers ? "trailers" : "trucks"}.</li> : null}
            </ul>
          )}
        </div>

        {error ? <p className="text-red-700">{error}</p> : null}
        <div className="flex items-center justify-end gap-2">
          {missing.length ? <span className="text-gray-500">Still needed: {missing.join(", ")}</span> : null}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button disabled={missing.length > 0 || create.isPending} onClick={() => { setError(null); create.mutate(); }}>{create.isPending ? "Saving…" : "Save draft"}</Button>
        </div>
      </div>
    </ParityDrawer>
  );
}
