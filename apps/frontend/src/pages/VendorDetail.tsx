import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listVendorBills } from "../api/accounting";
import { ApiError } from "../api/client";
import { listVendorBillPayments, recordVendorBillPayment, type VendorBillPaymentListRow } from "../api/vendors";
import { getVendor } from "../api/mdata";
import {
  getVendorApSummary,
  getVendorCoi,
  getVendorW9,
  postVendorCoiUpload,
  postVendorPaymentTerms,
  postVendorW9Upload,
} from "../api/vendor-compliance";
import { useAuth } from "../auth/useAuth";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { useCompanyContext } from "../contexts/CompanyContext";

const tabs = ["Profile", "A/P", "1099 & W-9", "COI", "Payment terms", "History", "Documents", "Audit History"] as const;
type VendorTab = (typeof tabs)[number];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function billOpenBalanceCents(b: { balance_cents?: number; amount_cents: number; paid_cents: number }) {
  if (b.balance_cents != null) return Number(b.balance_cents);
  return Number(b.amount_cents ?? 0) - Number(b.paid_cents ?? 0);
}

export function VendorDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<VendorTab>("Profile");
  const [billPayOpen, setBillPayOpen] = useState(false);
  const [billPayDate, setBillPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billPayAmount, setBillPayAmount] = useState("");
  const [billPayMethod, setBillPayMethod] = useState("ach");
  const [billPayRef, setBillPayRef] = useState("");
  const [billPayMemo, setBillPayMemo] = useState("");
  const [billPayAuto, setBillPayAuto] = useState(true);
  const [billPayInclude, setBillPayInclude] = useState<Record<string, boolean>>({});
  const [billPayAmt, setBillPayAmt] = useState<Record<string, string>>({});
  const [w9File, setW9File] = useState<File | null>(null);
  const [w9TaxId, setW9TaxId] = useState("");
  const [coiFile, setCoiFile] = useState<File | null>(null);
  const [coiExp, setCoiExp] = useState("");
  const [netTermsDays, setNetTermsDays] = useState("");
  const [defaultPayMethod, setDefaultPayMethod] = useState("ach");

  useEffect(() => {
    if (searchParams.get("tab") === "ap") setActiveTab("A/P");
  }, [searchParams]);

  const vendorQuery = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendor(id),
    enabled: Boolean(id),
  });

  const billsQuery = useQuery({
    queryKey: ["vendor-ap-bills", companyId, id],
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && (activeTab === "A/P" || activeTab === "History"),
  });

  const vendorPaymentsQuery = useQuery({
    queryKey: ["vendor-bill-payments", id, companyId],
    queryFn: () => listVendorBillPayments(id, { operating_company_id: companyId, limit: 50 }),
    enabled: Boolean(companyId && id && (activeTab === "A/P" || activeTab === "History")),
    retry: false,
  });

  const coiQuery = useQuery({
    queryKey: ["vendor-coi", id],
    queryFn: () => getVendorCoi(id),
    enabled: Boolean(id) && (activeTab === "COI" || activeTab === "Payment terms"),
  });

  const w9Query = useQuery({
    queryKey: ["vendor-w9", id],
    queryFn: () => getVendorW9(id),
    enabled: Boolean(id) && activeTab === "1099 & W-9",
  });

  const apSummaryQuery = useQuery({
    queryKey: ["vendor-ap-summary", id, companyId],
    queryFn: () => getVendorApSummary(id, companyId),
    enabled: Boolean(id && companyId && activeTab === "History"),
  });

  useEffect(() => {
    const d = coiQuery.data;
    if (!d) return;
    if (d.net_terms_days != null) setNetTermsDays(String(d.net_terms_days));
    if (d.default_payment_method) setDefaultPayMethod(d.default_payment_method);
  }, [coiQuery.data]);

  const openBillsForPay = useMemo(
    () =>
      (billsQuery.data?.rows ?? [])
        .filter((b) => b.status !== "voided" && b.status !== "paid" && billOpenBalanceCents(b) > 0)
        .sort((a, b) => a.bill_date.localeCompare(b.bill_date)),
    [billsQuery.data?.rows]
  );

  const billPayCents = Math.round(Number(billPayAmount) * 100) || 0;

  const vendorBillPayBreakdown = useMemo(() => {
    if (billPayAuto) {
      let remaining = billPayCents;
      const apps: Array<{ bill_id: string; amount_cents: number }> = [];
      for (const b of openBillsForPay) {
        if (remaining <= 0) break;
        const open = billOpenBalanceCents(b);
        const apply = Math.min(open, remaining);
        if (apply > 0) {
          apps.push({ bill_id: b.id, amount_cents: apply });
          remaining -= apply;
        }
      }
      const appliedSum = billPayCents - remaining;
      return { applications: apps, appliedSum, creditCents: remaining };
    }
    let total = 0;
    const apps: Array<{ bill_id: string; amount_cents: number }> = [];
    for (const b of openBillsForPay) {
      if (!billPayInclude[b.id]) continue;
      const cents = Math.round(Number(billPayAmt[b.id] || 0) * 100);
      if (cents > 0) {
        apps.push({ bill_id: b.id, amount_cents: cents });
        total += cents;
      }
    }
    return { applications: apps, appliedSum: total, creditCents: Math.max(0, billPayCents - total) };
  }, [billPayAuto, billPayCents, openBillsForPay, billPayInclude, billPayAmt]);

  const billPayManualInvalid = !billPayAuto && vendorBillPayBreakdown.appliedSum > billPayCents;

  const vendorPaymentBackendPending =
    vendorPaymentsQuery.isError &&
    vendorPaymentsQuery.error instanceof ApiError &&
    (vendorPaymentsQuery.error.status === 404 ||
      vendorPaymentsQuery.error.status === 500 ||
      vendorPaymentsQuery.error.status === 501);

  const recordVendorBillPayMutation = useMutation({
    mutationFn: () =>
      recordVendorBillPayment(id, {
        operating_company_id: companyId,
        date: billPayDate,
        amount_cents: billPayCents,
        method: billPayMethod,
        reference: billPayRef.trim() || undefined,
        memo: billPayMemo.trim() || undefined,
        applications: vendorBillPayBreakdown.applications,
        remaining_to_credit_balance_cents: vendorBillPayBreakdown.creditCents,
      }),
    onSuccess: () => {
      pushToast(`Bill payment of ${money.format(billPayCents / 100)} recorded`, "success");
      void queryClient.invalidateQueries({ queryKey: ["vendor-ap-bills", companyId, id] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-bill-payments", id, companyId] });
      void queryClient.invalidateQueries({ queryKey: ["vendor-ap-summary", id, companyId] });
      setBillPayOpen(false);
      setBillPayAmount("");
      setBillPayRef("");
      setBillPayMemo("");
      setBillPayDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const w9UploadMutation = useMutation({
    mutationFn: async () => {
      if (!w9File) throw new Error("file_required");
      return postVendorW9Upload(id, w9File, w9TaxId.trim() || undefined);
    },
    onSuccess: () => {
      pushToast("W-9 uploaded", "success");
      setW9File(null);
      void queryClient.invalidateQueries({ queryKey: ["vendor-w9", id] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Upload failed"), "error"),
  });

  const coiUploadMutation = useMutation({
    mutationFn: async () => {
      if (!coiFile || !/^\d{4}-\d{2}-\d{2}$/.test(coiExp)) throw new Error("file_and_date");
      return postVendorCoiUpload(id, coiFile, coiExp);
    },
    onSuccess: () => {
      pushToast("COI uploaded", "success");
      setCoiFile(null);
      void queryClient.invalidateQueries({ queryKey: ["vendor-coi", id] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Upload failed"), "error"),
  });

  const paymentTermsMutation = useMutation({
    mutationFn: () =>
      postVendorPaymentTerms(id, {
        operating_company_id: companyId,
        net_terms_days: Math.max(0, Math.min(120, Number(netTermsDays) || 0)),
        default_payment_method: defaultPayMethod,
      }),
    onSuccess: () => {
      pushToast("Payment terms saved", "success");
      void queryClient.invalidateQueries({ queryKey: ["vendor-coi", id] });
    },
    onError: () => pushToast("Could not save terms", "error"),
  });

  const canViewDocuments = useMemo(
    () =>
      user?.role === "Owner" ||
      user?.role === "Administrator" ||
      user?.role === "Manager" ||
      user?.role === "Accountant" ||
      user?.role === "Mechanic",
    [user?.role]
  );

  if (vendorQuery.isLoading) return <div className="text-sm text-gray-500">Loading vendor...</div>;
  if (!vendorQuery.data) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Vendor not found.</div>
        <Button variant="secondary" onClick={() => navigate("/vendors")}>
          Back to Vendors
        </Button>
      </div>
    );
  }

  const vendor = vendorQuery.data;

  return (
    <div className="space-y-3">
      <PageHeader
        title={vendor.name}
        backHref="/vendors"
        breadcrumb={[
          { label: "Vendors", href: "/vendors" },
          { label: vendor.name },
        ]}
        subtitle={vendor.vendor_type}
        actions={
          <span className={`rounded px-2 py-1 text-xs font-semibold ${vendor.deactivated_at ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
            {vendor.deactivated_at ? "Inactive" : "Active"}
          </span>
        }
      />

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-0.5">
        <div className="flex min-w-max gap-1">
          {tabs
            .filter((tab) => tab !== "Documents" || canViewDocuments)
            .map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === tab ? "bg-sky-100 text-sky-800" : "text-gray-700 hover:bg-gray-100"}`}
              >
                {tab}
              </button>
            ))}
        </div>
      </div>

      {activeTab === "Profile" ? (
        <DataPanel title="Vendor Profile">
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Name</span>
            <span className="text-sm text-gray-900">{vendor.name}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Type</span>
            <span className="text-sm text-gray-900">{vendor.vendor_type}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Phone</span>
            <span className="text-sm text-gray-900">{vendor.phone ?? "-"}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Email</span>
            <span className="text-sm text-gray-900">{vendor.email ?? "-"}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Payment Terms</span>
            <span className="text-sm text-gray-900">Defined in accounting workflow</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Notes</span>
            <span className="text-sm text-gray-900">{vendor.notes ?? "-"}</span>
          </DataPanelRow>
        </DataPanel>
      ) : null}

      {activeTab === "A/P" ? (
        <div className="space-y-2">
          {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
          <div className="rounded border border-gray-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
              onClick={() => setBillPayOpen((o) => !o)}
            >
              <span>Record Bill Payment</span>
              <span className="text-xs font-normal text-gray-500">{billPayOpen ? "Hide" : "Show"}</span>
            </button>
            {billPayOpen ? (
              <div className="space-y-3 border-t border-gray-100 p-3 text-xs">
                {vendorPaymentBackendPending ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
                    Backend pending — file <strong>P6-T11204</strong> for vendor bill payment APIs.{" "}
                    <button type="button" className="font-semibold text-blue-700 underline" onClick={() => void vendorPaymentsQuery.refetch()}>
                      Retry
                    </button>
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block">
                    Payment date
                    <input type="date" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={billPayDate} onChange={(e) => setBillPayDate(e.target.value)} />
                  </label>
                  <label className="block">
                    Amount (USD)
                    <input className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={billPayAmount} onChange={(e) => setBillPayAmount(e.target.value)} />
                  </label>
                  <label className="block">
                    Method
                    <select className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={billPayMethod} onChange={(e) => setBillPayMethod(e.target.value)}>
                      <option value="ach">ACH</option>
                      <option value="check">Check</option>
                      <option value="wire">Wire</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                  <label className="block">
                    Reference
                    <input className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={billPayRef} onChange={(e) => setBillPayRef(e.target.value)} />
                  </label>
                </div>
                <label className="block">
                  Memo
                  <textarea className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" rows={2} value={billPayMemo} onChange={(e) => setBillPayMemo(e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={billPayAuto}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (!on) {
                        let remaining = billPayCents;
                        const snapI: Record<string, boolean> = {};
                        const snapA: Record<string, string> = {};
                        for (const b of openBillsForPay) {
                          if (remaining <= 0) break;
                          const open = billOpenBalanceCents(b);
                          const apply = Math.min(open, remaining);
                          if (apply > 0) {
                            snapI[b.id] = true;
                            snapA[b.id] = (apply / 100).toFixed(2);
                            remaining -= apply;
                          }
                        }
                        setBillPayInclude(snapI);
                        setBillPayAmt(snapA);
                      }
                      setBillPayAuto(on);
                    }}
                  />
                  Auto-match oldest open bills first
                </label>
                <div className="rounded border border-gray-100 bg-gray-50 p-2">
                  <div className="font-semibold text-gray-800">Apply to bills</div>
                  <p className="mt-1 text-gray-600">
                    Applying {money.format(vendorBillPayBreakdown.appliedSum / 100)} of {money.format(billPayCents / 100)} payment
                    {vendorBillPayBreakdown.creditCents > 0 ? (
                      <span className="text-amber-800"> · {money.format(vendorBillPayBreakdown.creditCents / 100)} vendor credit</span>
                    ) : null}
                  </p>
                  {billPayManualInvalid ? <p className="mt-1 text-red-600">Total applied cannot exceed payment amount.</p> : null}
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {openBillsForPay.length === 0 ? <p className="text-gray-500">No open bills.</p> : null}
                    {openBillsForPay.map((b) => (
                      <div key={b.id} className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-1">
                        {!billPayAuto ? (
                          <input
                            type="checkbox"
                            checked={Boolean(billPayInclude[b.id])}
                            onChange={(e) => setBillPayInclude((p) => ({ ...p, [b.id]: e.target.checked }))}
                          />
                        ) : null}
                        <span className="font-medium text-gray-800">{b.bill_number ?? b.id.slice(0, 8)}</span>
                        <span className="text-gray-600">Open {money.format(billOpenBalanceCents(b) / 100)}</span>
                        {!billPayAuto ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 rounded border border-gray-300 px-1 py-0.5"
                            value={billPayAmt[b.id] ?? ""}
                            onChange={(e) => setBillPayAmt((p) => ({ ...p, [b.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-gray-700">
                            {(() => {
                              const row = vendorBillPayBreakdown.applications.find((a) => a.bill_id === b.id);
                              return row ? money.format(row.amount_cents / 100) : "—";
                            })()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button
                    size="sm"
                    disabled={billPayCents <= 0 || billPayManualInvalid || recordVendorBillPayMutation.isPending}
                    loading={recordVendorBillPayMutation.isPending}
                    onClick={() => void recordVendorBillPayMutation.mutateAsync()}
                  >
                    Record payment
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Recent bill payments</div>
            {vendorPaymentBackendPending ? (
              <p className="text-sm text-amber-800">
                Backend pending — history unavailable until backend ships (P6-T11204).
              </p>
            ) : vendorPaymentsQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading…</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-gray-600">
                      <th className="px-2 py-1.5 font-semibold">Date</th>
                      <th className="px-2 py-1.5 font-semibold">Amount</th>
                      <th className="px-2 py-1.5 font-semibold">Method</th>
                      <th className="px-2 py-1.5 font-semibold">Applied</th>
                      <th className="px-2 py-1.5 font-semibold">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(vendorPaymentsQuery.data?.payments ?? []).map((p: VendorBillPaymentListRow) => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="px-2 py-1.5">{p.payment_date}</td>
                        <td className="px-2 py-1.5">{money.format(p.amount_cents / 100)}</td>
                        <td className="px-2 py-1.5">{p.payment_method ?? p.method ?? "—"}</td>
                        <td className="px-2 py-1.5">
                          {p.amount_applied_cents != null ? money.format(p.amount_applied_cents / 100) : "—"}
                        </td>
                        <td className="px-2 py-1.5">{p.reference ?? "—"}</td>
                      </tr>
                    ))}
                    {(vendorPaymentsQuery.data?.payments ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-2 py-3 text-gray-500">
                          No payments recorded.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {billsQuery.isLoading ? <p className="text-sm text-gray-500">Loading bills…</p> : null}
          {billsQuery.isError ? <p className="text-sm text-red-600">Could not load bills.</p> : null}
          {billsQuery.isSuccess ? (
            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billsQuery.data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-gray-500">
                        No bills for this vendor.
                      </td>
                    </tr>
                  ) : null}
                  {billsQuery.data.rows.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{b.bill_number ?? b.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{b.bill_date}</td>
                      <td className="px-3 py-2">{b.due_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{money.format(b.amount_cents / 100)}</td>
                      <td className="px-3 py-2 text-right">{money.format((b.balance_cents ?? b.amount_cents - b.paid_cents) / 100)}</td>
                      <td className="px-3 py-2">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "1099 & W-9" ? (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3 text-sm">
          {w9Query.isLoading ? <p className="text-gray-500">Loading…</p> : null}
          {w9Query.data ? (
            <DataPanel title="W-9 / Tax ID (masked)">
              <DataPanelRow>
                <span className="text-xs font-semibold text-gray-600">PDF on file</span>
                <span className="text-sm text-gray-900">{w9Query.data.w9_pdf_r2_key ? "Yes" : "No"}</span>
              </DataPanelRow>
              <DataPanelRow>
                <span className="text-xs font-semibold text-gray-600">EIN / SSN (decrypted)</span>
                <span className="text-sm text-gray-900">{w9Query.data.tax_id ? `${String(w9Query.data.tax_id).slice(0, 4)}…` : "—"}</span>
              </DataPanelRow>
            </DataPanel>
          ) : null}
          <div className="space-y-2 text-xs">
            <p className="text-gray-600">Upload a replacement W-9 PDF. Tax ID is encrypted at rest when configured.</p>
            <input type="file" accept="application/pdf" onChange={(e) => setW9File(e.target.files?.[0] ?? null)} />
            <label className="block">
              EIN / SSN (optional on upload)
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={w9TaxId} onChange={(e) => setW9TaxId(e.target.value)} />
            </label>
            <Button size="sm" loading={w9UploadMutation.isPending} onClick={() => void w9UploadMutation.mutateAsync()}>
              Upload W-9
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === "COI" ? (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3 text-sm">
          {coiQuery.isLoading ? <p className="text-gray-500">Loading…</p> : null}
          {coiQuery.data ? (
            <DataPanel title="Certificate of insurance">
              <DataPanelRow>
                <span className="text-xs font-semibold text-gray-600">PDF on file</span>
                <span className="text-sm text-gray-900">{coiQuery.data.coi_pdf_r2_key ? "Yes" : "No"}</span>
              </DataPanelRow>
              <DataPanelRow>
                <span className="text-xs font-semibold text-gray-600">Expires</span>
                <span className="text-sm text-gray-900">{coiQuery.data.coi_expires_on ?? "—"}</span>
              </DataPanelRow>
            </DataPanel>
          ) : null}
          <div className="space-y-2 text-xs">
            <input type="file" accept="application/pdf" onChange={(e) => setCoiFile(e.target.files?.[0] ?? null)} />
            <label className="block">
              Expiry date
              <input type="date" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" value={coiExp} onChange={(e) => setCoiExp(e.target.value)} />
            </label>
            <Button size="sm" loading={coiUploadMutation.isPending} onClick={() => void coiUploadMutation.mutateAsync()}>
              Upload COI
            </Button>
          </div>
        </div>
      ) : null}

      {activeTab === "Payment terms" ? (
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3 text-sm">
          {!companyId ? <p className="text-red-600">Select an operating company.</p> : null}
          <label className="block text-xs">
            Net terms (days)
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={netTermsDays}
              onChange={(e) => setNetTermsDays(e.target.value)}
            />
          </label>
          <label className="block text-xs">
            Default payment method
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
              value={defaultPayMethod}
              onChange={(e) => setDefaultPayMethod(e.target.value)}
              placeholder="ach, check, wire…"
            />
          </label>
          <Button size="sm" loading={paymentTermsMutation.isPending} disabled={!companyId} onClick={() => void paymentTermsMutation.mutateAsync()}>
            Save payment terms
          </Button>
        </div>
      ) : null}

      {activeTab === "History" ? (
        <div className="space-y-3 text-sm">
          {!companyId ? <p className="text-red-600">Select an operating company.</p> : null}
          {apSummaryQuery.isLoading ? <p className="text-gray-500">Loading summary…</p> : null}
          {apSummaryQuery.data ? (
            <div className="grid gap-2 md:grid-cols-3">
              <div className="rounded border border-gray-200 bg-white p-3">
                <div className="text-xs font-semibold text-gray-600">A/P open</div>
                <div className="text-lg font-bold text-gray-900">{money.format(apSummaryQuery.data.ap_open_cents / 100)}</div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <div className="text-xs font-semibold text-gray-600">Bills paid (count)</div>
                <div className="text-lg font-bold text-gray-900">{apSummaryQuery.data.bills_paid_count}</div>
              </div>
              <div className="rounded border border-gray-200 bg-white p-3">
                <div className="text-xs font-semibold text-gray-600">Last payment</div>
                <div className="text-lg font-bold text-gray-900">{apSummaryQuery.data.last_payment_date ?? "—"}</div>
              </div>
            </div>
          ) : null}
          <p className="text-xs text-gray-600">Recent bill payments and open bills are listed below (same as A/P tab).</p>
          {vendorPaymentBackendPending ? (
            <p className="text-sm text-amber-800">Payment history API pending in some environments.</p>
          ) : (
            <div className="overflow-x-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="px-2 py-1.5 font-semibold">Date</th>
                    <th className="px-2 py-1.5 font-semibold">Amount</th>
                    <th className="px-2 py-1.5 font-semibold">Method</th>
                    <th className="px-2 py-1.5 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(vendorPaymentsQuery.data?.payments ?? []).slice(0, 15).map((p: VendorBillPaymentListRow) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="px-2 py-1.5">{p.payment_date}</td>
                      <td className="px-2 py-1.5">{money.format(p.amount_cents / 100)}</td>
                      <td className="px-2 py-1.5">{p.payment_method ?? p.method ?? "—"}</td>
                      <td className="px-2 py-1.5">{p.reference ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {billsQuery.isSuccess ? (
            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(billsQuery.data.rows ?? []).slice(0, 25).map((b) => (
                    <tr key={b.id} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{b.bill_number ?? b.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{b.bill_date}</td>
                      <td className="px-3 py-2 text-right">{money.format((b.balance_cents ?? b.amount_cents - b.paid_cents) / 100)}</td>
                      <td className="px-3 py-2">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "Documents" && canViewDocuments ? (
        <DocumentsTab entityType="vendor" entityId={vendor.id} entityName={vendor.name} />
      ) : null}

      {activeTab === "Audit History" ? (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Audit history viewer placeholder. Full drill-down ships in a later phase.
        </div>
      ) : null}
    </div>
  );
}
