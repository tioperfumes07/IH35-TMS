import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "../components/forms/DatePicker";
import { MoneyInput } from "../components/forms/MoneyInput";
import { ParityTable } from "../components/parity/ParityTable";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listVendorBills, type VendorBill } from "../api/accounting";
import { ApiError, apiRequest } from "../api/client";
import { listVendorBillPayments, recordVendorBillPayment, type VendorBillPaymentListRow } from "../api/vendors";
import { getVendor, updateVendor, listPaymentTermOptions } from "../api/mdata";
import { listCatalogAccounts } from "../api/catalog-accounts";
import { getVendorIntegrityHistory } from "../api/maintenance";
import { patchVendorAccountingCategory } from "../api/vendorCategory";
import { useAuth } from "../auth/useAuth";
import { EntityLink } from "../components/shared/EntityLink";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { TasksTab } from "../components/tasks/TasksTab";
import { EntityAuditHistoryTab } from "../components/audit/EntityAuditHistoryTab";
import { Button } from "../components/Button";
import { useToast } from "../components/Toast";
import { DataPanel } from "../components/layout/DataPanel";
import { FlatFieldGrid } from "../components/layout/FlatFieldGrid";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";
import { MissingRequiredChip } from "../components/compliance/MissingRequiredChip";
import { VendorCategoryChip } from "../components/vendors/VendorCategoryChip";
import { useCompanyContext } from "../contexts/CompanyContext";
import { VENDOR_CATEGORY_VALUES, type VendorCategoryValue } from "../lib/vendorCategories";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { BillSelect } from "../components/ap/BillSelect";
import { emptyVendorProfileMeta, parseVendorNotes, serializeVendorNotes, type VendorProfileMeta } from "../lib/vendorProfileMeta";

type SaferEntityStatus = {
  id: string;
  mc_number: string | null;
  dot_number: string | null;
  safer_verified_at: string | null;
  safer_status: string | null;
  safer_authority_status: string | null;
  safer_oos_status: string | null;
};

// QBO-PARITY-VENDORS — "W-9 / 1099 Status" appended at END (additive, §7: never reorder existing tabs).
const tabs = ["Profile", "A/P", "Documents", "Audit History", "Tasks", "W-9 / 1099"] as const;
type VendorTab = (typeof tabs)[number];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function billOpenBalanceCents(b: { balance_cents?: number; amount_cents: number; paid_cents: number }) {
  if (b.balance_cents != null) return Number(b.balance_cents);
  return Number(b.amount_cents ?? 0) - Number(b.paid_cents ?? 0);
}

type VendorProfileForm = VendorProfileMeta & {
  name: string;
  vendorType: string;
  taxId: string;
  vendorCode: string;
  notes: string;
  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) — real columns, not the notes meta blob.
  website: string;
  printOnCheckName: string;
  eligible1099: boolean;
  paymentTermsId: string | null;
  defaultExpenseAccountId: string | null;
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
    taxId: "",
    vendorCode: "",
    notes: "",
    website: "",
    printOnCheckName: "",
    eligible1099: false,
    paymentTermsId: null,
    defaultExpenseAccountId: null,
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
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, has_balance: true, limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorIntegrityQuery = useQuery({
    queryKey: ["maintenance", "vendor-integrity", id, companyId],
    queryFn: () => getVendorIntegrityHistory(id, companyId),
    enabled: Boolean(companyId && id),
  });

  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
  const paymentTermsQuery = useQuery({ queryKey: ["payment-term-options"], queryFn: listPaymentTermOptions, staleTime: 5 * 60 * 1000 });
  const paymentTermOptions = useMemo(
    () => (paymentTermsQuery.data?.payment_terms ?? []).map((t) => ({ value: t.id, label: `${t.terms_name} (${t.days_until_due}d)` })),
    [paymentTermsQuery.data]
  );
  // Option-B (vendor-customer-categorization-option-b): recommendation only, pre-fills bill lines.
  const expenseAccountsQuery = useQuery({
    queryKey: ["catalog-accounts", "expense-for-vendor-default"],
    queryFn: () => listCatalogAccounts({ status: "active" }),
    staleTime: 5 * 60 * 1000,
  });
  const expenseAccountOptions = useMemo(
    () =>
      (expenseAccountsQuery.data?.accounts ?? [])
        .filter((a) => a.account_type === "Expense")
        .map((a) => ({ value: a.id, label: a.account_number ? `${a.account_number} — ${a.account_name}` : a.account_name })),
    [expenseAccountsQuery.data]
  );

  const vendorPaymentsQuery = useQuery({
    queryKey: ["vendor-bill-payments", id, companyId],
    queryFn: () => listVendorBillPayments(id, { operating_company_id: companyId, limit: 50 }),
    enabled: Boolean(companyId && id && activeTab === "A/P"),
    retry: false,
  });

  const saferStatusQuery = useQuery({
    queryKey: ["fmcsa-safer-status", "vendor", id, companyId],
    queryFn: () => {
      const q = new URLSearchParams({
        entity_type: "vendor",
        entity_id: id,
        operating_company_id: companyId,
      });
      return apiRequest<{ entity_type: "vendor"; entity: SaferEntityStatus }>(
        `/api/v1/compliance/fmcsa-safer/status?${q.toString()}`
      );
    },
    enabled: Boolean(id && companyId),
    retry: false,
  });

  const verifySaferMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/v1/compliance/fmcsa-safer/verify-now", {
        method: "POST",
        body: {
          entity_type: "vendor",
          entity_id: id,
          force: true,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fmcsa-safer-status", "vendor", id] });
      queryClient.invalidateQueries({ queryKey: ["vendor", id] });
      pushToast("SAFER verification refreshed", "success");
    },
    onError: () => pushToast("SAFER verification failed", "error"),
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
        tax_id: profileForm.taxId.trim() || null,
        vendor_code: profileForm.vendorCode.trim() || null,
        operating_company_id: companyId || undefined,
        notes: serializeVendorNotes(meta, profileForm.notes),
        // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) — real columns.
        website: profileForm.website.trim() || null,
        print_on_check_name: profileForm.printOnCheckName.trim() || null,
        eligible_1099: profileForm.eligible1099,
        payment_terms_id: profileForm.paymentTermsId,
        default_expense_account_id: profileForm.defaultExpenseAccountId,
      });
    },
    onSuccess: async () => {
      pushToast("Vendor profile saved", "success");
      setProfileEditMode(false);
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
    },
    onError: (error) => pushToast(String((error as Error).message ?? "Failed to save vendor profile"), "error"),
  });

  // Soft-delete (Inactivate / Reactivate) — never hard-delete a master record.
  // Vendors have no dedicated /deactivate route; toggle the canonical deactivated_at via PATCH.
  const inactivateVendorMutation = useMutation({
    mutationFn: () => updateVendor(id, { deactivated_at: new Date().toISOString() }),
    onSuccess: async () => {
      pushToast("Vendor inactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: () => pushToast("Failed to inactivate vendor", "error"),
  });

  const reactivateVendorMutation = useMutation({
    mutationFn: () => updateVendor(id, { deactivated_at: null }),
    onSuccess: async () => {
      pushToast("Vendor reactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: () => pushToast("Failed to reactivate vendor", "error"),
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
      taxId: v.tax_id ?? "",
      vendorCode: v.vendor_code ?? "",
      notes: parsed.publicNotes,
      ...parsed.meta,
      telephone: parsed.meta.telephone || v.phone || "",
      address: parsed.meta.address || v.address || "",
      generalEmail: parsed.meta.generalEmail || v.email || "",
      // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) — real columns.
      website: v.website ?? "",
      printOnCheckName: v.print_on_check_name ?? "",
      eligible1099: Boolean(v.eligible_1099),
      paymentTermsId: v.payment_terms_id ?? null,
      defaultExpenseAccountId: v.default_expense_account_id ?? null,
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
  const saferEntity = saferStatusQuery.data?.entity ?? null;
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
          <div className="flex items-center gap-2">
            <span className={`rounded-sm px-2 py-1 text-xs font-semibold ${vendor.deactivated_at ? "bg-gray-200 text-gray-700" : "bg-slate-100 text-slate-700"}`}>
              {vendor.deactivated_at ? "Inactive" : "Active"}
            </span>
            {vendor.deactivated_at ? (
              <Button variant="secondary" onClick={() => reactivateVendorMutation.mutate()} loading={reactivateVendorMutation.isPending}>
                Reactivate
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => inactivateVendorMutation.mutate()} loading={inactivateVendorMutation.isPending}>
                Inactivate
              </Button>
            )}
          </div>
        }
      />
      {reworkSignalCount > 0 ? (
        <div className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
          Warning: {reworkSignalCount} possible re-do signal(s) in last 30 days (same vendor/unit/failure pattern).
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <MissingRequiredChip operatingCompanyId={companyId} entityKind="vendor" entityId={vendor.id} />
        {saferEntity?.safer_verified_at ? (
          <StatusBadge variant="positive">
            {`SAFER ${saferEntity.safer_authority_status ?? "unknown"} · ${new Date(saferEntity.safer_verified_at).toLocaleDateString()}`}
          </StatusBadge>
        ) : saferEntity?.safer_status ? (
          <StatusBadge variant={saferEntity.safer_status === "verified" ? "positive" : "warn"}>
            {`SAFER ${saferEntity.safer_status}`}
          </StatusBadge>
        ) : (
          <StatusBadge variant="neutral">SAFER not verified</StatusBadge>
        )}
        {saferEntity?.safer_oos_status ? (
          <span className="text-xs text-gray-500">{`Operating: ${saferEntity.safer_oos_status}`}</span>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => verifySaferMutation.mutate()} loading={verifySaferMutation.isPending}>
          Verify SAFER
        </Button>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-0.5">
        <div className="flex min-w-max gap-1">
          {tabs
            .filter((tab) => tab !== "Documents" || canViewDocuments)
            .map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded-sm px-2.5 py-1.5 text-xs font-medium ${activeTab === tab ? "bg-slate-100 text-slate-700" : "text-gray-700 hover:bg-gray-100"}`}
              >
                {tab}
              </button>
            ))}
        </div>
      </div>

      {activeTab === "Profile" ? (
        <DataPanel title="Vendor Profile">
          {/* Edit control at the TOP so it's discoverable — the fields (Vendor Type, etc.) are
              read-only until Edit is on, matching QBO's header Edit. Previously the only Edit button
              was buried at the bottom, so the profile looked un-editable and dropdowns wouldn't open. */}
          <div className="mb-3 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
            <span className="text-[11px] text-slate-500">
              {profileEditMode ? "Editing — change any field, then Save." : "Read-only. Click Edit to change vendor details."}
            </span>
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
          </div>
          <FlatFieldGrid
            columns={3}
            className="mb-3"
            fields={[
              { label: "Telephone", value: profileForm.telephone || vendor.phone || "—" },
              { label: "Email", value: profileForm.generalEmail || vendor.email || "—" },
              { label: "Address", value: profileForm.address || vendor.address || "—" },
              { label: "Primary contact", value: profileForm.primaryContactName || "—" },
              { label: "Tax ID", value: profileForm.taxId || vendor.tax_id || "—" },
              { label: "Vendor code", value: profileForm.vendorCode || vendor.vendor_code || "—" },
            ]}
          />
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Name</span>
            <input
              value={profileForm.name}
              onChange={(event) => setProfileForm((current) => ({ ...current, name: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
            <span className="text-xs font-semibold text-gray-600">Vendor Code</span>
            <input
              value={profileForm.vendorCode}
              onChange={(event) => setProfileForm((current) => ({ ...current, vendorCode: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Tax ID</span>
            <input
              value={profileForm.taxId}
              onChange={(event) => setProfileForm((current) => ({ ...current, taxId: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          {/* VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) */}
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Website</span>
            <input
              value={profileForm.website}
              onChange={(event) => setProfileForm((current) => ({ ...current, website: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Print on check as</span>
            <input
              value={profileForm.printOnCheckName}
              onChange={(event) => setProfileForm((current) => ({ ...current, printOnCheckName: event.target.value }))}
              disabled={!profileEditMode}
              placeholder="Leave blank to use vendor display name"
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">1099 tracking</span>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={profileForm.eligible1099}
                onChange={(event) => setProfileForm((current) => ({ ...current, eligible1099: event.target.checked }))}
                disabled={!profileEditMode}
              />
              Track payments for 1099 (Form 1099-NEC)
            </label>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Payment terms</span>
            <SelectCombobox
              value={profileForm.paymentTermsId ?? ""}
              onChange={(event) => setProfileForm((current) => ({ ...current, paymentTermsId: event.target.value || null }))}
              disabled={!profileEditMode}
              className="h-8 w-full max-w-md text-xs"
            >
              <option value="">— None —</option>
              {paymentTermOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Default expense account</span>
            <SelectCombobox
              value={profileForm.defaultExpenseAccountId ?? ""}
              onChange={(event) => setProfileForm((current) => ({ ...current, defaultExpenseAccountId: event.target.value || null }))}
              disabled={!profileEditMode}
              className="h-8 w-full max-w-md text-xs"
            >
              <option value="">— None —</option>
              {expenseAccountOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </SelectCombobox>
            <p className="mt-1 text-xs text-gray-500">
              Option-B recommendation only: pre-fills the expense account on new bills for this vendor.
              Always editable — never posted silently.
            </p>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Quality rating</span>
            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                  profileForm.qualityRating === "good"
                    ? "bg-slate-100 text-slate-700"
                    : profileForm.qualityRating === "bad"
                      ? "bg-red-100 text-red-800"
                      : "bg-slate-100 text-slate-700"
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
            {/* Single flat row (no nested box-in-box): current chip + inline editor. */}
            {!companyId ? (
              <div className="flex items-center gap-2 text-sm text-gray-900">
                <VendorCategoryChip code={vendor.vendor_category} />
                <span className="text-xs text-slate-600">Select operating company to edit.</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-sm text-gray-900">
                <VendorCategoryChip code={vendor.vendor_category} />
                <SelectCombobox
                  className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
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
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Telephone</span>
            <input
              value={profileForm.telephone}
              onChange={(event) => setProfileForm((current) => ({ ...current, telephone: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Address</span>
            <input
              value={profileForm.address}
              onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-2xl rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Primary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.primaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Secondary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.secondaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">General email</span>
            <input
              value={profileForm.generalEmail}
              onChange={(event) => setProfileForm((current) => ({ ...current, generalEmail: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Accounting contact</span>
            <input
              value={profileForm.accountingContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, accountingContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Disputes contact</span>
            <input
              value={profileForm.disputesContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, disputesContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
                className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
                className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
                className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
                className="rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-2xl rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          {/* Edit/Save/Cancel moved to the top of the panel (discoverable). */}
        </DataPanel>
      ) : null}

      {activeTab === "A/P" ? (
        <div className="space-y-2">
          {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
          <div className="rounded-sm border border-gray-200 bg-white">
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
                  <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-slate-700">
                    Backend pending — file <strong>P6-T11204</strong> for vendor bill payment APIs.{" "}
                    <button type="button" className="font-semibold text-slate-700 underline" onClick={() => void vendorPaymentsQuery.refetch()}>
                      Retry
                    </button>
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block">
                    Payment date
                    <DatePicker className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1" value={billPayDate} onChange={setBillPayDate} />
                  </label>
                  <label className="block">
                    Amount (USD)
                    {/* M-1: dollars-mode QBO money entry; bridged so Math.round(billPayAmount*100) is byte-for-byte. */}
                    <MoneyInput valueDollars={billPayAmount ? Number(billPayAmount) : null} onChangeDollars={(d) => setBillPayAmount(d == null ? "" : String(d))} ariaLabel="Payment amount (USD)" className="mt-0.5 w-full" />
                  </label>
                  <label className="block">
                    Method
                    <SelectCombobox className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1" value={billPayMethod} onChange={(e) => setBillPayMethod(e.target.value)}>
                      <option value="ach">ACH</option>
                      <option value="check">Check</option>
                      <option value="wire">Wire</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="other">Other</option>
                    </SelectCombobox>
                  </label>
                  <label className="block">
                    Reference
                    <input className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1" value={billPayRef} onChange={(e) => setBillPayRef(e.target.value)} />
                  </label>
                </div>
                <label className="block">
                  Memo
                  <textarea className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1" rows={2} value={billPayMemo} onChange={(e) => setBillPayMemo(e.target.value)} />
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
                <div className="rounded-sm border border-gray-100 bg-gray-50 p-2">
                  <div className="font-semibold text-gray-800">Apply to bills</div>
                  <p className="mt-1 text-gray-600">
                    Applying {money.format(vendorBillPayBreakdown.appliedSum / 100)} of {money.format(billPayCents / 100)} payment
                    {vendorBillPayBreakdown.creditCents > 0 ? (
                      <span className="text-slate-700"> · {money.format(vendorBillPayBreakdown.creditCents / 100)} vendor credit</span>
                    ) : null}
                  </p>
                  {billPayManualInvalid ? <p className="mt-1 text-red-600">Total applied cannot exceed payment amount.</p> : null}
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    <BillSelect operatingCompanyId={companyId} vendorId={id} value={null} onChange={() => undefined} disabled />
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
                          <MoneyInput
                            valueDollars={billPayAmt[b.id] ? Number(billPayAmt[b.id]) : null}
                            onChangeDollars={(d) => setBillPayAmt((p) => ({ ...p, [b.id]: d == null ? "" : String(d) }))}
                            ariaLabel={`Apply to ${b.bill_number ?? b.id.slice(0, 8)}`}
                            className="w-24"
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
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Recent bill payments</div>
            {vendorPaymentBackendPending ? (
              <p className="text-sm text-slate-700">
                Backend pending — history unavailable until backend ships (P6-T11204).
              </p>
            ) : (
              <ParityTable<VendorBillPaymentListRow>
                rows={vendorPaymentsQuery.data?.payments ?? []}
                rowKey={(p) => p.id}
                loading={vendorPaymentsQuery.isLoading}
                storageKey="vendor-detail-bill-payments"
                emptyText="No payments recorded."
                exportFilename="vendor-bill-payments"
                columns={[
                  { key: "payment_date", label: "Date", sortable: true, render: (p) => p.payment_date },
                  { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (p) => money.format(p.amount_cents / 100) },
                  { key: "payment_method", label: "Method", sortable: true, render: (p) => p.payment_method ?? p.method ?? "—" },
                  {
                    key: "amount_applied_cents",
                    label: "Applied",
                    cellClass: "text-right tabular-nums",
                    render: (p) => (p.amount_applied_cents != null ? money.format(p.amount_applied_cents / 100) : "—"),
                  },
                  { key: "reference", label: "Reference", render: (p) => p.reference ?? "—" },
                ]}
              />
            )}
          </div>
          {billsQuery.isError ? <p className="text-sm text-red-600">Could not load bills.</p> : null}
          {!billsQuery.isError ? (
            <ParityTable<VendorBill>
              rows={billsQuery.data?.rows ?? []}
              rowKey={(b) => b.id}
              loading={billsQuery.isLoading}
              storageKey="vendor-detail-bills"
              emptyText="No bills for this vendor."
              exportFilename="vendor-bills"
              columns={[
                { key: "bill_number", label: "Bill #", render: (b) => <EntityLink kind="bill" id={b.id} label={b.bill_number ?? b.id.slice(0, 8)} /> },
                { key: "bill_date", label: "Date", sortable: true, render: (b) => b.bill_date },
                { key: "due_date", label: "Due", sortable: true, render: (b) => b.due_date ?? "—" },
                { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (b) => money.format(b.amount_cents / 100) },
                {
                  key: "balance_cents",
                  label: "Balance",
                  sortable: true,
                  cellClass: "text-right tabular-nums",
                  render: (b) => money.format((b.balance_cents ?? b.amount_cents - b.paid_cents) / 100),
                },
                { key: "status", label: "Status", sortable: true, render: (b) => b.status },
              ]}
            />
          ) : null}
        </div>
      ) : null}

      {activeTab === "Documents" && canViewDocuments ? (
        <DocumentsTab entityType="vendor" entityId={vendor.id} entityName={vendor.name} />
      ) : null}

      {activeTab === "Audit History" ? (
        <EntityAuditHistoryTab operatingCompanyId={companyId} entityType="vendor" entityId={vendor.id} />
      ) : null}

      {activeTab === "Tasks" ? (
        <DataPanel title="Tasks">
          <TasksTab operatingCompanyId={companyId} targetType="vendor" targetId={vendor.id} targetLabel={vendor.name} />
        </DataPanel>
      ) : null}

      {/* QBO-PARITY-VENDORS — read-only W-9 / 1099 summary. Mirrors QBO's vendor 1099 panel:
          1099-tracking eligibility, Tax ID, and W-9 document status. Editing the eligibility/Tax ID
          lives on the Profile tab; the W-9 FILE itself lives on the Documents tab. This tab is
          display + drill-through only (no upload, no posting). */}
      {activeTab === "W-9 / 1099" ? (
        <DataPanel title="W-9 / 1099 Status">
          <FlatFieldGrid
            columns={3}
            className="mb-3"
            fields={[
              { label: "1099 tracking", value: vendor.eligible_1099 ? "Eligible (Form 1099-NEC)" : "Not tracked" },
              { label: "Tax ID (TIN/EIN/SSN)", value: vendor.tax_id || "— (add on Profile tab)" },
              { label: "Print-on-check name", value: vendor.print_on_check_name || vendor.name },
            ]}
          />
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">W-9 on file</span>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-700">
              <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                Managed in Documents
              </span>
              {canViewDocuments ? (
                <Button type="button" size="sm" variant="secondary" onClick={() => setActiveTab("Documents")}>
                  Open Documents tab
                </Button>
              ) : (
                <span className="text-xs text-gray-500">Upload/verify the signed W-9 in the Documents tab.</span>
              )}
            </div>
          </DataPanelRow>
          <p className="mt-2 text-xs text-gray-500">
            A signed W-9 is required before issuing a Form 1099-NEC. This panel is read-only — set
            1099 eligibility and Tax ID on the Profile tab; attach the W-9 file on the Documents tab.
          </p>
        </DataPanel>
      ) : null}
    </div>
  );
}
