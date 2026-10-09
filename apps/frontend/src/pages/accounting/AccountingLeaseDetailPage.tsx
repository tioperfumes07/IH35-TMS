import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { leasesApi, type LeaseAssetRow, type LeaseBillRow, type LesseeSchedulePeriodRow } from "../../api/leases";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { companyToday, companyWallClockToIso } from "../../lib/businessDate";
import { formatDateUS, formatDateTimeUS } from "../../lib/formatDate";
import { formatUsdCentsTable } from "../../lib/money";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { userFacingApiError } from "../../lib/api-error-message";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

/**
 * ROUND 316 — one lease contract: terms, its units / trailers (each with its monthly amount), every monthly
 * lease bill (EntityLink to the bill and its last payment), and the Owner-only Sign (backdating allowed — signing
 * bills every month from commencement to now) and Close actions.
 */
const assetColumns: Array<ParityColumn<LeaseAssetRow>> = [
  {
    key: "asset",
    label: "Unit / trailer",
    alwaysVisible: true,
    render: (r) =>
      r.unit_id ? <EntityLink kind="unit" id={r.unit_id} label={r.unit_number ?? "Unit"} className="underline" />
      : r.equipment_id ? <EntityLink kind="trailer" id={r.equipment_id} label={r.equipment_number ?? "Trailer"} className="underline" /> : "—",
  },
  { key: "monthly_amount_cents", label: "Monthly amount", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.monthly_amount_cents ?? 0) },
  { key: "start_date", label: "From", sortable: true, render: (r) => (r.start_date ? formatDateUS(r.start_date) : "—") },
  { key: "end_date", label: "To", sortable: true, render: (r) => (r.end_date ? formatDateUS(r.end_date) : "Open") },
];
const billColumns: Array<ParityColumn<LeaseBillRow>> = [
  { key: "bill", label: "Bill", alwaysVisible: true, render: (r) => <EntityLink kind="bill" id={r.id} label={r.display_id ?? r.bill_number ?? "Bill"} className="underline" /> },
  { key: "lease_period_start", label: "Lease month", sortable: true, render: (r) => (r.lease_period_start ? formatDateUS(r.lease_period_start).slice(0, 2) + "/" + r.lease_period_start.slice(0, 4) : "—") },
  { key: "amount_cents", label: "Amount", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.amount_cents) },
  { key: "paid_cents", label: "Paid", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.paid_cents) },
  { key: "status", label: "Status", sortable: true, render: (r) => r.status },
  { key: "last_payment_id", label: "Payment", render: (r) => (r.last_payment_id ? <EntityLink kind="bill_payment" id={r.last_payment_id} label="Payment" className="underline" /> : "—") },
];

// ROUND 321: the ASC 842 lessee schedule (lease-to-own) — each period with its bill and JE, both ways.
function scheduleColumns(labels: Map<string, string>): Array<ParityColumn<LesseeSchedulePeriodRow>> {
  return [
    { key: "period_start", label: "Month", alwaysVisible: true, render: (r) => `${r.period_start.slice(5, 7)}/${r.period_start.slice(0, 4)}` },
    { key: "lease_asset_line_id", label: "Unit / trailer", sortable: true, render: (r) => labels.get(r.lease_asset_line_id) ?? "—" },
    { key: "payment_cents", label: "Payment", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.payment_cents) },
    { key: "interest_cents", label: "Interest", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.interest_cents) },
    { key: "principal_cents", label: "Principal", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.principal_cents) },
    { key: "liability_close_cents", label: "Lease liability", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.liability_close_cents) },
    { key: "rou_amortization_cents", label: "ROU amortization", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.rou_amortization_cents) },
    { key: "rou_close_cents", label: "ROU asset", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.rou_close_cents) },
    { key: "lease_cost_cents", label: "Lease cost", sortable: true, className: "text-right", render: (r) => formatUsdCentsTable(r.lease_cost_cents) },
    { key: "bill_id", label: "Bill", render: (r) => (r.bill_id ? <EntityLink kind="bill" id={r.bill_id} label={r.bill_display_id ?? "Bill"} className="underline" /> : "—") },
    { key: "accretion_je_id", label: "Journal entry", render: (r) => (r.accretion_je_id ? <EntityLink kind="journal_entry" id={r.accretion_je_id} label="JE" className="underline" /> : r.posted_at ? "posted (zero)" : "—") },
  ];
}

export function AccountingLeaseDetailPage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const [signedAt, setSignedAt] = useState(companyToday());
  const [closing, setClosing] = useState<{ on: string; reason: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["leases", "detail", companyId, id], queryFn: () => leasesApi.get(companyId, id), enabled: Boolean(companyId && id) });
  const refresh = () => void qc.invalidateQueries({ queryKey: ["leases"] });
  const sign = useMutation({
    mutationFn: () => leasesApi.sign(companyId, id, companyWallClockToIso(`${signedAt}T12:00`)),
    onSuccess: (r) => {
      const refused = r.bills.flatMap((b) => b.refused);
      const created = r.bills.reduce((s, b) => s + b.created.length, 0);
      setMsg(`Signed. ${created} monthly bill(s) created${refused.length ? `; refused: ${refused.map((x) => x.reason).join("; ")}` : ""}.`);
      refresh();
    },
    onError: (e) => setMsg(userFacingApiError(e, "Could not sign the lease.")),
  });
  const close = useMutation({
    mutationFn: () => leasesApi.close(companyId, id, String(closing?.on), String(closing?.reason)),
    onSuccess: () => { setClosing(null); setMsg("Lease closed."); refresh(); },
    onError: (e) => setMsg(userFacingApiError(e, "Could not close the lease.")),
  });
  const bills = useMutation({
    mutationFn: () => leasesApi.generateBills(companyId, undefined, id),
    onSuccess: (r) => { setMsg(`${r.created.length} bill(s) created, ${r.skipped_existing.length} already existed${r.refused.length ? `; refused: ${r.refused.map((x) => x.reason).join("; ")}` : ""}.`); refresh(); },
    onError: (e) => setMsg(userFacingApiError(e, "Could not generate bills.")),
  });
  const [buyout, setBuyout] = useState<{ on: string; price: number | null } | null>(null);
  const buy = useMutation({
    mutationFn: () => leasesApi.buyout(companyId, id, String(buyout?.on), buyout?.price ?? null),
    onSuccess: (r) => { setBuyout(null); setMsg(`Bought out. Purchase bill created for ${formatUsdCentsTable(r.price_cents)}; ${r.assets.length} asset(s) moved to owned fixed assets.`); refresh(); },
    onError: (e) => setMsg(userFacingApiError(e, "Could not buy out the lease.")),
  });
  const l = query.data?.lease;
  const assetLabels = new Map((query.data?.assets ?? []).map((a) => [a.id, String((a as Record<string, unknown>).unit_number ?? (a as Record<string, unknown>).equipment_number ?? "—")]));
  const monthly = (query.data?.assets ?? []).reduce((s, a) => s + (a.monthly_amount_cents ?? 0), 0);

  return (
    <AccountingSubNavWrapper title={l ? `Lease ${l.display_id ?? ""}`.trim() : "Lease"} subtitle="Lease contract — units / trailers, monthly bills, signing and close">
      {query.isError ? <ListErrorState {...formatQueryErrorDetail(query.error)} onRetry={() => void query.refetch()} /> : null}
      {l ? (
        <div className="space-y-3 text-xs" data-testid="lease-detail">
          <section className="grid grid-cols-2 gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-4">
            {[
              ["Status", l.status],
              ["Type", l.lease_type ?? "—"],
              ["Billing", l.billing_mode === "one_bill_per_unit" ? "One bill per unit" : l.billing_mode === "one_bill_all_units" ? "One bill for all units" : "—"],
              ["Term", `${formatDateUS(l.commencement_date)} – ${formatDateUS(l.end_date)}`],
              ["Lessor company", l.lessor_company ?? "—"],
              ["Monthly total", formatUsdCentsTable(monthly)],
              ["Deposit", l.deposit_cents != null ? formatUsdCentsTable(l.deposit_cents) : "—"],
              ["ASC 842 class", l.lessee_classification ? `Lessee — ${l.lessee_classification}` : l.election],
              ...(l.lease_type === "lease_to_own"
                ? ([
                    ["Purchase option", l.purchase_option_kind === "fixed" ? `Fixed ${formatUsdCentsTable(Number(l.purchase_option_price_cents ?? 0))}` : l.purchase_option_kind === "fmv" ? "Fair market value" : l.purchase_option_kind === "none" ? "None" : "—"],
                    ["Discount rate", l.discount_rate_bps != null ? `${(Number(l.discount_rate_bps) / 100).toFixed(2)}%` : "—"],
                    ["Lease liability at commencement", l.lessee_liability_initial_cents != null ? formatUsdCentsTable(Number(l.lessee_liability_initial_cents)) : "—"],
                  ] as Array<[string, string]>)
                : []),
              ["Signed", l.signed_at ? formatDateTimeUS(String(l.signed_at)) : "Not signed"],
              ["Expense account", l.expense_account_name ?? "rent_expense role"],
            ].map(([k, v]) => (
              <div key={k}><div className="text-section-header font-bold uppercase text-[#4B5563]">{k}</div><div className="font-semibold text-[#0F1219]">{v}</div></div>
            ))}
            <div>
              <div className="text-section-header font-bold uppercase text-[#4B5563]">Lessor vendor</div>
              {l.lessor_vendor_id ? <EntityLink kind="vendor" id={l.lessor_vendor_id} label={l.lessor_vendor ?? "Vendor"} className="font-semibold underline" /> : "—"}
            </div>
            <div>
              <div className="text-section-header font-bold uppercase text-[#4B5563]">Signed contract</div>
              {l.contract_instance_id ? <EntityLink kind="legal_contract" id={l.contract_instance_id} label="Contract" className="font-semibold underline" /> : "—"}
            </div>
          </section>

          <section className="flex flex-wrap items-end gap-2 rounded-sm border border-gray-200 bg-white p-3" data-testid="lease-actions">
            {l.status === "draft" ? (
              <>
                <label className="flex flex-col gap-1 font-semibold text-gray-600">Signed on (backdating allowed)<DatePicker value={signedAt} onChange={setSignedAt} /></label>
                <Button onClick={() => { setMsg(null); sign.mutate(); }} disabled={sign.isPending}>{sign.isPending ? "Signing…" : "Sign lease (Owner)"}</Button>
              </>
            ) : null}
            {l.status === "active" && l.lease_type === "lease_to_own" && l.lessee_classification ? (
              buyout ? (
                <>
                  <label className="flex flex-col gap-1 font-semibold text-gray-600">Buyout date<DatePicker value={buyout.on} onChange={(v) => setBuyout({ ...buyout, on: v })} /></label>
                  {l.purchase_option_kind === "fixed" ? (
                    <span className="text-gray-700">Price: {formatUsdCentsTable(Number(l.purchase_option_price_cents ?? 0))} (fixed in the contract)</span>
                  ) : (
                    <label className="flex flex-col gap-1 font-semibold text-gray-600">Purchase price (fair market value)<MoneyInput valueCents={buyout.price} onChangeCents={(c) => setBuyout({ ...buyout, price: c })} /></label>
                  )}
                  <Button onClick={() => { setMsg(null); buy.mutate(); }} disabled={buy.isPending || (l.purchase_option_kind !== "fixed" && buyout.price == null)}>{buy.isPending ? "Buying out…" : "Buy out (Owner)"}</Button>
                  <Button variant="secondary" onClick={() => setBuyout(null)}>Cancel</Button>
                </>
              ) : (
                <Button variant="secondary" onClick={() => setBuyout({ on: companyToday(), price: null })}>Buy out…</Button>
              )
            ) : null}
            {l.status === "active" ? (
              <>
                <Button variant="secondary" onClick={() => { setMsg(null); bills.mutate(); }} disabled={bills.isPending}>Generate this month's bill(s)</Button>
                {closing ? (
                  <>
                    <label className="flex flex-col gap-1 font-semibold text-gray-600">Closed on<DatePicker value={closing.on} onChange={(v) => setClosing({ ...closing, on: v })} /></label>
                    <label className="flex flex-col gap-1 font-semibold text-gray-600">Reason<input className="rounded-sm border border-gray-300 px-2 py-1" value={closing.reason} onChange={(e) => setClosing({ ...closing, reason: e.target.value })} /></label>
                    <Button onClick={() => close.mutate()} disabled={closing.reason.trim().length < 3 || close.isPending}>Close lease (Owner)</Button>
                    <Button variant="secondary" onClick={() => setClosing(null)}>Cancel</Button>
                  </>
                ) : (
                  <Button variant="secondary" onClick={() => setClosing({ on: companyToday(), reason: "" })}>Close lease…</Button>
                )}
              </>
            ) : null}
            {msg ? <span className="text-gray-700">{msg}</span> : null}
          </section>

          <ParityTable embedded rows={query.data?.assets ?? []} columns={assetColumns} rowKey={(r) => r.id} storageKey="lease-assets" exportFilename="lease-assets" tableTestId="lease-assets-table" emptyText="No units or trailers on this lease." />
          {l.lessee_commencement_je_id || l.buyout_bill_id || l.buyout_je_id ? (
            <section className="flex flex-wrap gap-4 rounded-sm border border-gray-200 bg-white p-3">
              {l.lessee_commencement_je_id ? <span>Commencement: <EntityLink kind="journal_entry" id={String(l.lessee_commencement_je_id)} label="ROU / lease liability JE" className="font-semibold underline" /></span> : null}
              {l.buyout_bill_id ? <span>Buyout: <EntityLink kind="bill" id={String(l.buyout_bill_id)} label="purchase bill" className="font-semibold underline" /></span> : null}
              {l.buyout_je_id ? <span><EntityLink kind="journal_entry" id={String(l.buyout_je_id)} label="ROU to fixed asset JE" className="font-semibold underline" /></span> : null}
            </section>
          ) : null}
          {l.lease_type === "lease_to_own" && query.data?.schedule_unavailable_reason ? (
            <div className="rounded border border-[#E5E7EB] bg-[#F7F8FA] px-3 py-2 text-xs text-[#1F2A44]" role="status" data-testid="lease-lessee-schedule-unavailable">{query.data.schedule_unavailable_reason}</div>
          ) : null}
          {(query.data?.schedule ?? []).length ? (
            <ParityTable embedded rows={query.data?.schedule ?? []} columns={scheduleColumns(assetLabels)} rowKey={(r) => r.id} storageKey="lease-lessee-schedule" exportFilename="lease-asc842-schedule" tableTestId="lease-lessee-schedule-table" emptyText="No ASC 842 schedule." />
          ) : null}
          <ParityTable embedded rows={query.data?.bills ?? []} columns={billColumns} rowKey={(r) => r.id} storageKey="lease-bills" exportFilename="lease-bills" tableTestId="lease-bills-table" emptyText="No lease bills yet — they are created when the lease is signed and every month after." />
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
