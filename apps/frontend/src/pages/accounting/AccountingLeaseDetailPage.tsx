import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { leasesApi, type LeaseAssetRow, type LeaseBillRow } from "../../api/leases";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { Button } from "../../components/Button";
import { DatePicker } from "../../components/forms/DatePicker";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { companyToday } from "../../lib/businessDate";
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
  { key: "monthly_amount_cents", label: "Monthly amount", className: "text-right", render: (r) => formatUsdCentsTable(r.monthly_amount_cents ?? 0) },
  { key: "start_date", label: "From", render: (r) => (r.start_date ? formatDateUS(r.start_date) : "—") },
  { key: "end_date", label: "To", render: (r) => (r.end_date ? formatDateUS(r.end_date) : "Open") },
];
const billColumns: Array<ParityColumn<LeaseBillRow>> = [
  { key: "bill", label: "Bill", alwaysVisible: true, render: (r) => <EntityLink kind="bill" id={r.id} label={r.display_id ?? r.bill_number ?? "Bill"} className="underline" /> },
  { key: "lease_period_start", label: "Lease month", render: (r) => (r.lease_period_start ? formatDateUS(r.lease_period_start).slice(0, 2) + "/" + r.lease_period_start.slice(0, 4) : "—") },
  { key: "amount_cents", label: "Amount", className: "text-right", render: (r) => formatUsdCentsTable(r.amount_cents) },
  { key: "paid_cents", label: "Paid", className: "text-right", render: (r) => formatUsdCentsTable(r.paid_cents) },
  { key: "status", label: "Status", render: (r) => r.status },
  { key: "last_payment_id", label: "Payment", render: (r) => (r.last_payment_id ? <EntityLink kind="bill_payment" id={r.last_payment_id} label="Payment" className="underline" /> : "—") },
];

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
    mutationFn: () => leasesApi.sign(companyId, id, `${signedAt}T12:00:00-05:00`),
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
  const l = query.data?.lease;
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
              ["ASC 842 class", l.election],
              ["Signed", l.signed_at ? formatDateTimeUS(String(l.signed_at)) : "Not signed"],
              ["Expense account", l.expense_account_name ?? "rent_expense role"],
            ].map(([k, v]) => (
              <div key={k}><div className="text-section-header font-bold uppercase text-[#4B5563]">{k}</div><div className="font-semibold text-slate-900">{v}</div></div>
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
          <ParityTable embedded rows={query.data?.bills ?? []} columns={billColumns} rowKey={(r) => r.id} storageKey="lease-bills" exportFilename="lease-bills" tableTestId="lease-bills-table" emptyText="No lease bills yet — they are created when the lease is signed and every month after." />
        </div>
      ) : null}
    </AccountingSubNavWrapper>
  );
}
