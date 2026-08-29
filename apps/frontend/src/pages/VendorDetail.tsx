import { entityLabel, visibleDocumentLabel } from "../lib/entity-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DatePicker } from "../components/forms/DatePicker";
import { MoneyInput } from "../components/forms/MoneyInput";
import { ParityTable } from "../components/parity/ParityTable";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { listExpenses, listVendorBills, type ExpenseListRow, type VendorBill } from "../api/accounting";
import { listVendorCredits } from "../api/vendor-credits";
import { ApiError, apiRequest } from "../api/client";
import { listVendorBillPayments, recordVendorBillPayment, type VendorBillPaymentListRow } from "../api/vendors";
import { getAllAccounts } from "../api/banking";
import { getVendor, updateVendor, deactivateVendor, reactivateVendor, listPaymentTermOptions } from "../api/mdata";
import { listCatalogAccounts } from "../api/catalog-accounts";
import { getVendorIntegrityHistory } from "../api/maintenance";
import { patchVendorAccountingCategory } from "../api/vendorCategory";
import { useAuth } from "../auth/useAuth";
import { EntityLink } from "../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
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
import { ReferenceSelect } from "../components/parity/ReferenceSelect";
import { useCatalogQuery } from "../hooks/useCatalogQuery";
import {
  emptyFactoringProfileMeta,
  emptyVendorProfileMeta,
  parseVendorNotes,
  serializeVendorNotes,
  type VendorProfileMeta,
} from "../lib/vendorProfileMeta";
import { useUrlSort } from "../hooks/useUrlSort";
import { formatDateUS } from "../lib/formatDate";
import { userFacingApiError } from "../lib/api-error-message";
import { VendorWorkOrdersReverseSection } from "./vendors/VendorWorkOrdersReverseSection";
import { VendorPartsHistorySection } from "./vendors/VendorPartsHistorySection";
import { VendorPreferredPartsReverseSection } from "./vendors/VendorPreferredPartsReverseSection";
import { VendorPartsInventoryReverseSection } from "./vendors/VendorPartsInventoryReverseSection";
import { VendorMaintenanceCatalogReverseSection } from "./vendors/VendorMaintenanceCatalogReverseSection";
import { VendorApAgingSection } from "./vendors/VendorApAgingSection";
import { VendorPaymentMethodsSection } from "./vendors/VendorPaymentMethodsSection";
import { RoadServiceReverseSection } from "../components/maintenance/RoadServiceReverseSection";
import { VendorBorderCrossingsReverseSection } from "../components/dispatch/VendorBorderCrossingsReverseSection";
import { WarrantyClaimsReverseSection } from "../components/maintenance/WarrantyClaimsReverseSection";
import { SafetyAlertsReverseSection } from "../components/safety/SafetyAlertsReverseSection";
import { VendorInsurancePoliciesReverseSection } from "../components/insurance/VendorInsurancePoliciesReverseSection";
import { VendorLegalContractsReverseSection } from "../components/legal/VendorLegalContractsReverseSection";
import { CashForecastReverseSection } from "../components/cash-flow/CashForecastReverseSection";
import { VendorEquipmentLoansReverseSection } from "../components/vendors/VendorEquipmentLoansReverseSection";
import { VendorMergesReverseSection } from "../components/vendors/VendorMergesReverseSection";
import { LinkedBankTransactionsPanel } from "../components/banking/LinkedBankTransactionsPanel";

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
  // BANK-SORT-ROLLOUT-ACCT — payments + bills share the A/P tab; distinct URL prefixes required.
  const {
    sortKey: paySortKey,
    sortDirection: paySortDirection,
    onSortChange: onPaySortChange,
  } = useUrlSort({ key: "pay_sort", dir: "pay_dir" });
  const {
    sortKey: billSortKey,
    sortDirection: billSortDirection,
    onSortChange: onBillSortChange,
  } = useUrlSort({ key: "bill_sort", dir: "bill_dir" });
  const {
    sortKey: expenseSortKey,
    sortDirection: expenseSortDirection,
    onSortChange: onExpenseSortChange,
  } = useUrlSort({ key: "expense_sort", dir: "expense_dir" });
  const [activeTab, setActiveTab] = useState<VendorTab>("Profile");
  const [billPayOpen, setBillPayOpen] = useState(false);
  const [billPayDate, setBillPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [billPayAmount, setBillPayAmount] = useState("");
  const [billPayMethod, setBillPayMethod] = useState("ach");
  const [billPayBankAccountId, setBillPayBankAccountId] = useState("");
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
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorExpensesQuery = useQuery({
    queryKey: ["vendor-expenses", companyId, id],
    queryFn: () => listExpenses(companyId, { vendor_uuid: id, limit: 200 }).then((res) => res.rows),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorCreditsQuery = useQuery({
    queryKey: ["vendor-credits", companyId, id],
    queryFn: () => listVendorCredits(companyId, { vendor_id: id }).then((res) => res.credits),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorIntegrityQuery = useQuery({
    queryKey: ["maintenance", "vendor-integrity", id, companyId],
    queryFn: () => getVendorIntegrityHistory(id, companyId),
    enabled: Boolean(companyId && id),
  });

  // LST-PICKER-01 (guard 1852) — vendor type is CATALOG-BACKED (catalogs.vendor_types), per entity,
  // with an inline "+ Add new vendor type" row — same catalog VendorCreateModal already reads (LST-WIRE-04).
  // #3877 owns maintenance_labor_code@1850; this slice is vendor_type only, not labor.
  const vendorTypesQuery = useCatalogQuery({
    catalogName: "vendors.vendor_types",
    companyId,
    enabled: Boolean(companyId),
  });
  const vendorTypeOptions = useMemo(() => {
    type CatalogRow = { display_name?: unknown };
    const rows = (vendorTypesQuery.data?.rows ?? []) as CatalogRow[];
    return rows.map((row) => ({
      value: String(row.display_name ?? ""),
      label: String(row.display_name ?? ""),
    }));
  }, [vendorTypesQuery.data]);

  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options", companyId],
    queryFn: () => listPaymentTermOptions(companyId),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000,
  });
  const paymentTermOptions = useMemo(
    () => [
      { value: "", label: "— None —" },
      ...(paymentTermsQuery.data?.payment_terms ?? []).map((t) => ({
        value: t.id,
        label: `${t.terms_name} (${t.days_until_due}d)`,
      })),
    ],
    [paymentTermsQuery.data]
  );
  // Option-B (vendor-customer-categorization-option-b): recommendation only, pre-fills bill lines.
  const expenseAccountsQuery = useQuery({
    queryKey: ["catalog-accounts", "expense-for-vendor-default", companyId],
    // LST-F14: default expense account is a posting target — postable_only.
    queryFn: () =>
      listCatalogAccounts({ status: "active", operating_company_id: companyId, postable_only: true }),
    enabled: Boolean(companyId),
    staleTime: 5 * 60 * 1000,
  });
  const expenseAccountOptions = useMemo(
    () =>
      (expenseAccountsQuery.data?.accounts ?? [])
        .filter((a) => a.account_type === "Expense")
        .map((a) => ({ value: a.id, label: a.account_name })),
    [expenseAccountsQuery.data]
  );

  const vendorPaymentsQuery = useQuery({
    queryKey: ["vendor-bill-payments", id, companyId],
    queryFn: () => listVendorBillPayments(id, { operating_company_id: companyId, limit: 50 }),
    enabled: Boolean(companyId && id && activeTab === "A/P"),
    retry: false,
  });

  // VEND-F-VENDORDETAIL-PAYMENT-NEVER-SENDS-BANK-ACCOUNT: same account list + "which methods need a
  // funding account" convention already shipped in PayBillModal.tsx (the single-bill pay flow) — this
  // form (multi-bill vendor payment) never had the picker at all.
  const bankAccountsQuery = useQuery({
    queryKey: ["vendor-bill-pay", "accounts", companyId],
    queryFn: () => getAllAccounts(companyId),
    enabled: Boolean(companyId && billPayOpen),
  });

  const billPayBankOptions = useMemo(
    () =>
      (bankAccountsQuery.data?.accounts ?? []).map((account: Record<string, unknown>) => ({
        value: String(account.id ?? ""),
        label: String(account.display_name ?? account.account_name ?? "Account"),
      })),
    [bankAccountsQuery.data?.accounts]
  );

  const billPayNeedsBankAccount =
    billPayMethod === "check" || billPayMethod === "ach" || billPayMethod === "wire" || billPayMethod === "credit_card";

  // Default to the first account once the list arrives, but never overwrite an explicit selection.
  useEffect(() => {
    if (!billPayOpen) return;
    if (billPayBankAccountId) return;
    const firstId = billPayBankOptions[0]?.value;
    if (firstId) setBillPayBankAccountId(firstId);
  }, [billPayOpen, billPayBankAccountId, billPayBankOptions]);

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
          operating_company_id: companyId,
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
        bank_account_id: billPayNeedsBankAccount ? billPayBankAccountId : undefined,
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
      setBillPayBankAccountId("");
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
        // VEND-S02 / FACT-kpi-vs-profile: factor rates live on factoring.factor — never vendor notes.
        factoring: emptyFactoringProfileMeta(),
      };
      return updateVendor(id, {
        name: profileForm.name.trim(),
        // LST-PICKER-01 (guard 1852) — vendor_type is catalog-backed free text (catalogs.vendor_types
        // display_name), not the frozen 8-value union. See UpdateVendorInput in api/mdata.ts (string).
        vendor_type: profileForm.vendorType,
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
    onError: (error) => pushToast(userFacingApiError(error, "Failed to save vendor profile"), "error"),
  });

  // Soft-delete (Inactivate / Reactivate) — never hard-delete a master record.
  const inactivateVendorMutation = useMutation({
    mutationFn: () => deactivateVendor(id),
    onSuccess: async () => {
      pushToast("Vendor inactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to inactivate vendor"), "error"),
  });

  const reactivateVendorMutation = useMutation({
    mutationFn: () => reactivateVendor(id),
    onSuccess: async () => {
      pushToast("Vendor reactivated", "success");
      await queryClient.invalidateQueries({ queryKey: ["vendor", id] });
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to reactivate vendor"), "error"),
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

  // ORPH-003 — matches the backend's write-role gate for mdata.vendor_payment_methods exactly
  // (migration 202613110000's RLS write policy: Owner/Administrator only, narrower than the
  // Manager/Accountant band above — this records how money leaves the company).
  const canWritePaymentMethods = useMemo(
    () => user?.role === "Owner" || user?.role === "Administrator",
    [user?.role]
  );

  if (vendorQuery.isLoading) return <div className="text-sm text-gray-500">Loading vendor...</div>;
  if (vendorQuery.isError) {
    if (vendorQuery.error instanceof ApiError && vendorQuery.error.status === 404) {
      return (
        <div className="space-y-3">
          <div className="text-sm text-slate-700" role="alert">
            This vendor is archived or is not available in the selected company. Historical transactions remain preserved.
          </div>
          <Button variant="secondary" onClick={() => navigate("/vendors")}>
            Back to Vendors
          </Button>
        </div>
      );
    }
    return <ListErrorBanner message="Failed to load vendor details." onRetry={() => void vendorQuery.refetch()} />;
  }
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
        <div className="space-y-2">
        <DataPanel title="Vendor Profile">
          {/* FAIL-AP1 — Vendor → Driver reverse when mdata.vendors.driver_id is set.
              Distinct from QBO Mapping. */}
          {vendor.driver_id ? (
            <div
              className="mb-3 rounded-sm border border-slate-200 bg-slate-50 p-3"
              data-testid="vendor-linked-driver"
            >
              <div className="text-[11px] uppercase text-slate-600">Linked driver (A/P payee)</div>
              <div className="mt-1 text-sm font-semibold text-gray-900">
                <EntityLinkOrTombstone
                  kind="driver"
                  id={vendor.driver_id}
                  name={vendor.driver_name}
                  noun="Driver"
                />
              </div>
            </div>
          ) : null}
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
            <ReferenceSelect
              value={profileForm.vendorType}
              onChange={(next) => setProfileForm((current) => ({ ...current, vendorType: next ?? "" }))}
              options={vendorTypeOptions}
              createKind="vendor_type"
              operatingCompanyId={companyId}
              disabled={!profileEditMode}
              addNewLabel="+ Add new vendor type"
              onOptionCreated={(opt) => {
                setProfileForm((current) => ({ ...current, vendorType: opt.label }));
                void vendorTypesQuery.refetch();
              }}
            />
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
            <ReferenceSelect
              value={profileForm.paymentTermsId ?? ""}
              onChange={(next) =>
                setProfileForm((current) => ({ ...current, paymentTermsId: next ? next : null }))
              }
              options={paymentTermOptions}
              createKind="payment_term"
              operatingCompanyId={companyId}
              placeholder="— None —"
              disabled={!profileEditMode}
              loading={paymentTermsQuery.isLoading}
              onOptionCreated={() => void paymentTermsQuery.refetch()}
            />
          </DataPanelRow>
          <DataPanelRow data-testid="vendor-default-expense-account">
            <span className="text-xs font-semibold text-gray-600">Default expense account</span>
            {/*
              LST-PICKER-01: bare SelectCombobox → ReferenceSelect createKind=account
              (parity QuickCreateEntityModal vendor path).
            */}
            <ReferenceSelect
              value={profileForm.defaultExpenseAccountId ?? null}
              onChange={(next) =>
                setProfileForm((current) => ({ ...current, defaultExpenseAccountId: next ? next : null }))
              }
              options={expenseAccountOptions}
              createKind="account"
              operatingCompanyId={companyId}
              placeholder="— None —"
              disabled={!profileEditMode}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["catalog-accounts", "expense-for-vendor-default", companyId] });
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Suggested on new bills for this vendor. You can always change it before saving; it is never
              posted automatically.
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
            <span className="text-xs font-semibold text-gray-600">Factor rate schedule</span>
            <p className="max-w-2xl text-sm text-gray-700" data-testid="vendor-factor-schedule-relocated">
              Advance / fee / reserve rates are edited on{" "}
              <Link to="/factoring" className="font-medium text-slate-900 underline">
                Factoring → active factor profile
              </Link>{" "}
              <span className="text-gray-500">Rate fields are managed on that profile, not in vendor notes.</span>
            </p>
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
        <VendorWorkOrdersReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <RoadServiceReverseSection
          filter={{ vendor_id: vendor.id }}
          contextLabel="this vendor"
          data-testid="vendor-profile-road-service-reverse"
        />
        <WarrantyClaimsReverseSection
          operatingCompanyId={companyId}
          filter={{ vendor_id: vendor.id }}
          contextLabel="this vendor"
          data-testid="vendor-warranty-claims-reverse"
        />
        <VendorInsurancePoliciesReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorLegalContractsReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorBorderCrossingsReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorPartsHistorySection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorPreferredPartsReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorPartsInventoryReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorMaintenanceCatalogReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <SafetyAlertsReverseSection operatingCompanyId={companyId} subjectKind="vendor" subjectId={vendor.id} />
        <CashForecastReverseSection operatingCompanyId={companyId} filter={{ party_ref_kind: "vendor", party_ref_id: vendor.id }} />
        <VendorEquipmentLoansReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorMergesReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorApAgingSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorPaymentMethodsSection operatingCompanyId={companyId} vendorId={vendor.id} canWrite={canWritePaymentMethods} />
        <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "vendor_id", id: vendor.id }} entityLabel={vendor.name} />
        </div>
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
                    <DatePicker className="mt-0.5 w-full" value={billPayDate} onChange={setBillPayDate} />
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
                  {billPayNeedsBankAccount ? (
                    <label className="block">
                      From bank account
                      <SelectCombobox
                        className="mt-0.5 w-full rounded-sm border border-gray-300 px-2 py-1"
                        value={billPayBankAccountId}
                        onChange={(e) => setBillPayBankAccountId(e.target.value)}
                      >
                        <option value="">Select account…</option>
                        {billPayBankOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </SelectCombobox>
                      {!billPayBankAccountId ? (
                        <p className="mt-1 text-red-600">Required for {billPayMethod} payments.</p>
                      ) : null}
                    </label>
                  ) : null}
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
                        <EntityLink kind="bill" id={b.id} label={visibleDocumentLabel(b.bill_number, b.id, "Record")} className="font-medium text-gray-800" data-testid="vendor-payment-bill-link" />
                        <span className="text-gray-600">Open {money.format(billOpenBalanceCents(b) / 100)}</span>
                        {!billPayAuto ? (
                          <MoneyInput
                            valueDollars={billPayAmt[b.id] ? Number(billPayAmt[b.id]) : null}
                            onChangeDollars={(d) => setBillPayAmt((p) => ({ ...p, [b.id]: d == null ? "" : String(d) }))}
                            ariaLabel={`Apply to ${visibleDocumentLabel(b.bill_number, b.id, "Record")}`}
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
                    disabled={
                      billPayCents <= 0 ||
                      billPayManualInvalid ||
                      (billPayNeedsBankAccount && !billPayBankAccountId) ||
                      recordVendorBillPayMutation.isPending
                    }
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
            ) : vendorPaymentsQuery.isError ? (
              <p className="text-sm text-red-600">
                Failed to load bill payments.{" "}
                <button type="button" className="font-semibold text-red-700 underline" onClick={() => void vendorPaymentsQuery.refetch()}>
                  Retry
                </button>
              </p>
            ) : (
              <ParityTable<VendorBillPaymentListRow>
                rows={vendorPaymentsQuery.data?.payments ?? vendorPaymentsQuery.data?.rows ?? []}
                rowKey={(p) => p.id}
                loading={vendorPaymentsQuery.isLoading}
                storageKey="vendor-detail-bill-payments"
                emptyText="No payments recorded."
                exportFilename="vendor-bill-payments"
                sortKey={paySortKey}
                sortDirection={paySortDirection}
                onSortChange={onPaySortChange}
                columns={[
                  {
                    key: "id",
                    label: "Payment",
                    sortable: true,
                    render: (p) => (
                      <EntityLink kind="bill_payment" id={p.id} label={entityLabel(p.reference, p.id, "Payment")} />
                    ),
                  },
                  { key: "payment_date", label: "Date", sortable: true, render: (p) => formatDateUS(p.payment_date) },
                  { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (p) => money.format(p.amount_cents / 100) },
                  { key: "payment_method", label: "Method", sortable: true, render: (p) => p.payment_method ?? p.method ?? "—" },
                  {
                    key: "amount_applied_cents",
                    label: "Applied",
                    sortable: true,
                    cellClass: "text-right tabular-nums",
                    render: (p) => (p.amount_applied_cents != null ? money.format(p.amount_applied_cents / 100) : "—"),
                  },
                  { key: "reference", label: "Reference", sortable: true, render: (p) => p.reference ?? "—" },
                ]}
              />
            )}
          </div>
          {billsQuery.isError ? <ListErrorBanner message="Could not load bills." onRetry={() => void billsQuery.refetch()} /> : null}
          {!billsQuery.isError ? (
            <ParityTable<VendorBill>
              rows={billsQuery.data?.rows ?? []}
              rowKey={(b) => b.id}
              loading={billsQuery.isLoading}
              storageKey="vendor-detail-bills"
              emptyText="No bills for this vendor."
              exportFilename="vendor-bills"
              sortKey={billSortKey}
              sortDirection={billSortDirection}
              onSortChange={onBillSortChange}
              columns={[
                {
                  key: "bill_number",
                  label: "Bill #",
                  sortable: true,
                  sortValue: (b) => b.bill_number ?? b.id,
                  render: (b) => <EntityLink kind="bill" id={b.id} label={visibleDocumentLabel(b.bill_number, b.id, "Record")} />,
                },
                { key: "bill_date", label: "Date", sortable: true, render: (b) => formatDateUS(b.bill_date) },
                { key: "due_date", label: "Due", sortable: true, render: (b) => formatDateUS(b.due_date) || "—" },
                { key: "amount_cents", label: "Amount", sortable: true, cellClass: "text-right tabular-nums", render: (b) => money.format(b.amount_cents / 100) },
                {
                  key: "balance_cents",
                  label: "Balance",
                  sortable: true,
                  cellClass: "text-right tabular-nums",
                  sortValue: (b) => b.balance_cents ?? b.amount_cents - b.paid_cents,
                  render: (b) => money.format((b.balance_cents ?? b.amount_cents - b.paid_cents) / 100),
                },
                { key: "status", label: "Status", sortable: true, render: (b) => b.status },
              ]}
            />
          ) : null}
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Expenses</div>
            {vendorExpensesQuery.isError ? <ListErrorBanner message="Could not load expenses." onRetry={() => void vendorExpensesQuery.refetch()} /> : null}
            {!vendorExpensesQuery.isError ? (
              <ParityTable<ExpenseListRow>
                rows={vendorExpensesQuery.data ?? []}
                rowKey={(e) => e.id}
                loading={vendorExpensesQuery.isLoading}
                storageKey="vendor-detail-expenses"
                emptyText="No expenses for this vendor."
                exportFilename="vendor-expenses"
                sortKey={expenseSortKey}
                sortDirection={expenseSortDirection}
                onSortChange={onExpenseSortChange}
                columns={[
                  {
                    key: "expense_number",
                    label: "Expense #",
                    sortable: true,
                    sortValue: (e) => e.expense_number ?? e.id,
                    render: (e) => (
                      <EntityLink kind="expense" id={e.id} label={entityLabel(e.expense_number, e.id, "Record")} />
                    ),
                  },
                  { key: "transaction_date", label: "Date", sortable: true, render: (e) => formatDateUS(e.transaction_date) },
                  {
                    key: "total_amount_cents",
                    label: "Amount",
                    sortable: true,
                    cellClass: "text-right tabular-nums",
                    render: (e) => money.format((Number(e.total_amount_cents) || 0) / 100),
                  },
                  { key: "status", label: "Status", sortable: true, render: (e) => e.status },
                  {
                    key: "posting_status",
                    label: "GL",
                    sortable: true,
                    render: (e) => <span className="capitalize">{e.posting_status}</span>,
                  },
                ]}
              />
            ) : null}
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-900">Vendor credits</div>
              <Link to={`/accounting/vendor-credits?vendor_id=${encodeURIComponent(id)}`} className="text-xs text-slate-700 hover:underline">
                View all credits
              </Link>
            </div>
            {vendorCreditsQuery.isError ? <ListErrorBanner message="Could not load vendor credits." onRetry={() => void vendorCreditsQuery.refetch()} /> : null}
            {!vendorCreditsQuery.isError ? (
              <ParityTable
                rows={vendorCreditsQuery.data ?? []}
                rowKey={(c) => c.id}
                loading={vendorCreditsQuery.isLoading}
                storageKey="vendor-detail-credits"
                emptyText="No vendor credits for this vendor."
                exportFilename="vendor-credits"
                columns={[
                  {
                    key: "display_id",
                    label: "Credit #",
                    sortable: true,
                    render: (c) => (
                      <EntityLink
                        kind="vendor_credit"
                        id={c.id}
                        label={entityLabel(c.display_id, c.id, "Vendor credit")}
                        className="text-slate-700 hover:underline"
                      />
                    ),
                  },
                  { key: "issue_date", label: "Issue date", sortable: true, render: (c) => formatDateUS(c.issue_date) },
                  {
                    key: "amount_unapplied_cents",
                    label: "Unapplied",
                    sortable: true,
                    cellClass: "text-right tabular-nums font-semibold",
                    render: (c) => money.format(c.amount_unapplied_cents / 100),
                  },
                  { key: "status", label: "Status", sortable: true, render: (c) => c.status },
                ]}
              />
            ) : null}
          </div>
        </div>
      ) : null}

      {activeTab === "Documents" && canViewDocuments ? (
        <DocumentsTab entityType="vendor" entityId={vendor.id} entityName={vendor.name} operatingCompanyId={companyId} />
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
