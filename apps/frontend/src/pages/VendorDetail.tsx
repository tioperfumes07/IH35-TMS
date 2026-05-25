import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listVendorBills } from "../api/accounting";
import { ApiError } from "../api/client";
import { listVendorBillPayments, recordVendorBillPayment, type VendorBillPaymentListRow } from "../api/vendors";
import { getVendor, updateVendor } from "../api/mdata";
import { getVendorIntegrityHistory } from "../api/maintenance";
import { patchVendorAccountingCategory } from "../api/vendorCategory";
import { useAuth } from "../auth/useAuth";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { VendorCategoryChip } from "../components/vendors/VendorCategoryChip";
import { useCompanyContext } from "../contexts/CompanyContext";
import { VENDOR_CATEGORY_VALUES, type VendorCategoryValue } from "../lib/vendorCategories";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { emptyVendorProfileMeta, parseVendorNotes, serializeVendorNotes, type VendorProfileMeta } from "../lib/vendorProfileMeta";

const tabs = ["Profile", "A/P", "Documents", "Audit History"] as const;
type VendorTab = (typeof tabs)[number];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function billOpenBalanceCents(b: { balance_cents?: number; amount_cents: number; paid_cents: number }) {
  if (b.balance_cents != null) return Number(b.balance_cents);
  return Number(b.amount_cents ?? 0) - Number(b.paid_cents ?? 0);
}

type VendorProfileForm = VendorProfileMeta & {
  name: string;
  vendorType: string;
  notes: string;
};

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

  const [categoryDraft, setCategoryDraft] = useState<VendorCategoryValue>("other");
  const [lockCategory, setLockCategory] = useState(false);
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [profileForm, setProfileForm] = useState<VendorProfileForm>({
    name: "",
    vendorType: "",
    notes: "",
    ...emptyVendorProfileMeta(),
  });

  useEffect(() => {
    if (searchParams.get("tab") === "ap") setActiveTab("A/P");
  }, [searchParams]);

  const vendorQuery = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendor(id, companyId || null),
    enabled: Boolean(id),
  });

  const billsQuery = useQuery({
    queryKey: ["vendor-ap-bills", companyId, id],
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorIntegrityQuery = useQuery({
    queryKey: ["maintenance", "vendor-integrity", id, companyId],
    queryFn: () => getVendorIntegrityHistory(id, companyId),
    enabled: Boolean(companyId && id),
  });

  const vendorPaymentsQuery = useQuery({
    queryKey: ["vendor-bill-payments", id, companyId],
    queryFn: () => listVendorBillPayments(id, { operating_company_id: companyId, limit: 50 }),
    enabled: Boolean(companyId && id && activeTab === "A/P"),
    retry: false,
  });

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
      setBillPayOpen(false);
      setBillPayAmount("");
      setBillPayRef("");
      setBillPayMemo("");
      setBillPayDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const patchCategoryMutation = useMutation({
    mutationFn: () =>
      patchVendorAccountingCategory(id, {
        operating_company_id: companyId,
        category: categoryDraft,
        lock: lockCategory,
      }),
    onSuccess: async () => {
      pushToast("Category updated", "success");
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
    },
    onError: (e) => pushToast(e instanceof ApiError ? e.message : "Update failed", "error"),
  });
  const updateVendorMutation = useMutation({
    mutationFn: () => {
      const meta: VendorProfileMeta = {
        telephone: profileForm.telephone,
        address: profileForm.address,
        primaryContactName: profileForm.primaryContactName,
        primaryContactTitle: profileForm.primaryContactTitle,
        primaryContactPhone: profileForm.primaryContactPhone,
        primaryContactEmail: profileForm.primaryContactEmail,
        secondaryContactName: profileForm.secondaryContactName,
        secondaryContactTitle: profileForm.secondaryContactTitle,
        secondaryContactPhone: profileForm.secondaryContactPhone,
        secondaryContactEmail: profileForm.secondaryContactEmail,
        generalEmail: profileForm.generalEmail,
        accountingContact: profileForm.accountingContact,
        disputesContact: profileForm.disputesContact,
          qualityRating: profileForm.qualityRating,
          factoring: profileForm.factoring,
      };
      return updateVendor(id, {
        name: profileForm.name.trim(),
        vendor_type: profileForm.vendorType as "Fuel" | "Repair" | "Tires" | "Towing" | "Insurance" | "Permit" | "Toll" | "Other",
        phone: profileForm.telephone.trim() || null,
        address: profileForm.address.trim() || null,
        email: profileForm.generalEmail.trim() || null,
        operating_company_id: companyId || undefined,
        notes: serializeVendorNotes(meta, profileForm.notes),
      });
    },
    onSuccess: async () => {
      pushToast("Vendor profile saved", "success");
      setProfileEditMode(false);
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Failed to save vendor profile"), "error"),
  });

  useEffect(() => {
    const v = vendorQuery.data;
    if (!v) return;
    const c = v.vendor_category;
    if (c && (VENDOR_CATEGORY_VALUES as readonly string[]).includes(c)) {
      setCategoryDraft(c as VendorCategoryValue);
    } else {
      setCategoryDraft("other");
    }
    setLockCategory(Boolean(v.vendor_category_locked_at));
    const parsed = parseVendorNotes(v.notes);
    setProfileForm({
      name: v.name ?? "",
      vendorType: v.vendor_type ?? "Other",
      notes: parsed.publicNotes,
      ...parsed.meta,
      telephone: parsed.meta.telephone || v.phone || "",
      address: parsed.meta.address || v.address || "",
      generalEmail: parsed.meta.generalEmail || v.email || "",
    });
  }, [vendorQuery.data]);

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
  const reworkSignalCount = Number(
    (vendorIntegrityQuery.data?.repeat_failure_30d_count as number | undefined) ??
      (vendorIntegrityQuery.data?.redo_30d_count as number | undefined) ??
      (vendorIntegrityQuery.data?.repeat_returns_30d as number | undefined) ??
      0
  );

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
      {reworkSignalCount > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Warning: {reworkSignalCount} possible re-do signal(s) in last 30 days (same vendor/unit/failure pattern).
        </div>
      ) : null}

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
            <input
              value={profileForm.name}
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Type</span>
            <SelectCombobox
              value={profileForm.vendorType}
              onChange={(event) => setProfileForm((current) => ({ ...current, vendorType: event.target.value }))}
              disabled={!profileEditMode}
              className="h-8 w-full max-w-md text-xs"
            >
              {["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"].map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </SelectCombobox>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Quality rating</span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  profileForm.qualityRating === "good"
                    ? "bg-emerald-100 text-emerald-800"
                    : profileForm.qualityRating === "bad"
                      ? "bg-red-100 text-red-800"
                      : "bg-amber-100 text-amber-800"
                }`}
              >
                {profileForm.qualityRating === "good" ? "Good" : profileForm.qualityRating === "bad" ? "Bad" : "Medium"}
              </span>
              <SelectCombobox
                value={profileForm.qualityRating}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    qualityRating: event.target.value as VendorProfileMeta["qualityRating"],
                  }))
                }
                disabled={!profileEditMode}
                className="h-8 w-[180px] text-xs"
              >
                <option value="good">Good</option>
                <option value="medium">Medium</option>
                <option value="bad">Bad</option>
              </SelectCombobox>
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Accounting category</span>
            <div className="flex flex-col gap-2 text-sm text-gray-900">
              <VendorCategoryChip code={vendor.vendor_category} />
              {!companyId ? (
                <span className="text-xs text-amber-700">Select operating company to edit.</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <SelectCombobox
                    className="h-8 rounded border border-gray-300 px-2 text-xs"
                    value={categoryDraft}
                    onChange={(e) => setCategoryDraft(e.target.value as VendorCategoryValue)}
                  >
                    {VENDOR_CATEGORY_VALUES.map((c) => (
                      <option key={c} value={c}>
                        {c.replace(/_/g, " ")}
                      </option>
                    ))}
                  </SelectCombobox>
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={lockCategory} onChange={(e) => setLockCategory(e.target.checked)} />
                    Lock
                  </label>
                  <Button
                    type="button"
                    size="sm"
                    loading={patchCategoryMutation.isPending}
                    onClick={() => patchCategoryMutation.mutate()}
                  >
                    Save category
                  </Button>
                </div>
              )}
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Telephone</span>
            <input
              value={profileForm.telephone}
              onChange={(event) => setProfileForm((current) => ({ ...current, telephone: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Address</span>
            <input
              value={profileForm.address}
              onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-2xl rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Primary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.primaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Secondary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.secondaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">General email</span>
            <input
              value={profileForm.generalEmail}
              onChange={(event) => setProfileForm((current) => ({ ...current, generalEmail: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Accounting contact</span>
            <input
              value={profileForm.accountingContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, accountingContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Disputes contact</span>
            <input
              value={profileForm.disputesContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, disputesContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Factoring reserves %</span>
            <input
              value={profileForm.factoring.factoringReservesPct}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  factoring: { ...current.factoring, factoringReservesPct: event.target.value },
                }))
              }
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Escrow reserves %</span>
            <input
              value={profileForm.factoring.escrowReservesPct}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  factoring: { ...current.factoring, escrowReservesPct: event.target.value },
                }))
              }
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Late fees %</span>
            <input
              value={profileForm.factoring.lateFeesPct}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  factoring: { ...current.factoring, lateFeesPct: event.target.value },
                }))
              }
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Chargebacks %</span>
            <input
              value={profileForm.factoring.chargebacksPct}
              onChange={(event) =>
                setProfileForm((current) => ({
                  ...current,
                  factoring: { ...current.factoring, chargebacksPct: event.target.value },
                }))
              }
              disabled={!profileEditMode}
              className="w-full max-w-md rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Aged invoices 31-60 (% rate / % fee)</span>
            <div className="grid w-full max-w-md grid-cols-2 gap-2">
              <input
                value={profileForm.factoring.advanceRate31To60Pct}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    factoring: { ...current.factoring, advanceRate31To60Pct: event.target.value },
                  }))
                }
                disabled={!profileEditMode}
                placeholder="Advance rate %"
                className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
              />
              <input
                value={profileForm.factoring.advanceFee31To60Pct}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    factoring: { ...current.factoring, advanceFee31To60Pct: event.target.value },
                  }))
                }
                disabled={!profileEditMode}
                placeholder="Fee %"
                className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
              />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Aged invoices 61-90 (% rate / % fee)</span>
            <div className="grid w-full max-w-md grid-cols-2 gap-2">
              <input
                value={profileForm.factoring.advanceRate61To90Pct}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    factoring: { ...current.factoring, advanceRate61To90Pct: event.target.value },
                  }))
                }
                disabled={!profileEditMode}
                placeholder="Advance rate %"
                className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
              />
              <input
                value={profileForm.factoring.advanceFee61To90Pct}
                onChange={(event) =>
                  setProfileForm((current) => ({
                    ...current,
                    factoring: { ...current.factoring, advanceFee61To90Pct: event.target.value },
                  }))
                }
                disabled={!profileEditMode}
                placeholder="Fee %"
                className="rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
              />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Notes</span>
            <textarea
              value={profileForm.notes}
              onChange={(event) => setProfileForm((current) => ({ ...current, notes: event.target.value }))}
              disabled={!profileEditMode}
              rows={3}
              className="w-full max-w-2xl rounded border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Profile actions</span>
            <div className="flex gap-2">
              {!profileEditMode ? (
                <Button type="button" size="sm" onClick={() => setProfileEditMode(true)}>
                  Edit
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" variant="secondary" onClick={() => setProfileEditMode(false)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" loading={updateVendorMutation.isPending} onClick={() => updateVendorMutation.mutate()}>
                    Save
                  </Button>
                </>
              )}
            </div>
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
                    <SelectCombobox className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={billPayMethod} onChange={(e) => setBillPayMethod(e.target.value)}>
                      <option value="ach">ACH</option>
                      <option value="check">Check</option>
                      <option value="wire">Wire</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="other">Other</option>
                    </SelectCombobox>
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
