import { entityLabel, visibleDocumentLabel } from "../lib/entity-label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ParityTable } from "../components/parity/ParityTable";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { listExpenses, listVendorBills, type ExpenseListRow, type VendorBill } from "../api/accounting";
import { listVendorCredits } from "../api/vendor-credits";
import { ApiError, apiRequest } from "../api/client";
import { listVendorBillPayments, type VendorBillPaymentListRow } from "../api/vendors";
import { getVendor, updateVendor, deactivateVendor, reactivateVendor, listPaymentTermOptions } from "../api/mdata";
import { listCatalogAccounts } from "../api/catalog-accounts";
import { getVendorIntegrityHistory } from "../api/maintenance";
import { patchVendorAccountingCategory } from "../api/vendorCategory";
import { useAuth } from "../auth/useAuth";
import { EntityLink } from "../components/shared/EntityLink";
import { EntityLinkOrTombstone } from "../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { listAllFiles } from "../api/docs";
import { NavyPageSubNav } from "../components/layout/NavyPageSubNav";
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
import { SelectCombobox } from "../components/Combobox";
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
import { VendorDuplicateExpensesSection } from "./vendors/VendorDuplicateExpensesSection";
import { VendorPaymentMethodsSection } from "./vendors/VendorPaymentMethodsSection";
import { RoadServiceReverseSection } from "../components/maintenance/RoadServiceReverseSection";
import { VendorBorderCrossingsReverseSection } from "../components/dispatch/VendorBorderCrossingsReverseSection";
import { WarrantyClaimsReverseSection } from "../components/maintenance/WarrantyClaimsReverseSection";
import { SafetyAlertsReverseSection } from "../components/safety/SafetyAlertsReverseSection";
import { VendorInsurancePoliciesReverseSection } from "../components/insurance/VendorInsurancePoliciesReverseSection";
import { VendorLegalContractsReverseSection } from "../components/legal/VendorLegalContractsReverseSection";
import { LegalMattersReverseSection } from "../components/legal/LegalMattersReverseSection";
import { CashForecastReverseSection } from "../components/cash-flow/CashForecastReverseSection";
import { VendorEquipmentLoansReverseSection } from "../components/vendors/VendorEquipmentLoansReverseSection";
import { VendorMergesReverseSection } from "../components/vendors/VendorMergesReverseSection";
import { FuelTransactionsReverseSection } from "../components/fuel/FuelTransactionsReverseSection";
import { FuelFraudAlertsReverseSection } from "../components/fuel/FuelFraudAlertsReverseSection";
import { LinkedBankTransactionsPanel } from "../components/banking/LinkedBankTransactionsPanel";
import { VendorProfileOverview } from "../components/vendors/VendorProfileOverview";
import { CappedListNotice } from "../components/CappedListNotice";

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

// CUST-01 C9: tab state was local useState only -- no deep-link, no shareable tab, browser back
// did nothing. Matches CustomerDetail's ?tab=<slug> contract exactly (AUDIT 2730); Profile stays
// the clean-URL default.
const VENDOR_DETAIL_TAB_QUERY: Record<VendorTab, string> = {
  Profile: "profile",
  "A/P": "ap",
  Documents: "documents",
  "Audit History": "audit",
  Tasks: "tasks",
  "W-9 / 1099": "w9",
};
const VENDOR_DETAIL_TAB_FROM_QUERY: Record<string, VendorTab> = Object.fromEntries(
  Object.entries(VENDOR_DETAIL_TAB_QUERY).map(([label, slug]) => [slug, label as VendorTab]),
) as Record<string, VendorTab>;

function parseVendorDetailTab(raw: string | null): VendorTab {
  if (!raw) return "Profile";
  return VENDOR_DETAIL_TAB_FROM_QUERY[raw.trim().toLowerCase()] ?? "Profile";
}

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

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
  const [searchParams, setSearchParams] = useSearchParams();
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
  // CUST-01 C9: was local useState only (see the old ?tab=ap-only, one-directional useEffect
  // this replaces below) -- matches CustomerDetail's setActiveTab(next) contract exactly so
  // every tab (not just A/P) is deep-linkable, shareable, and back-button-safe.
  const [activeTab, setActiveTabState] = useState<VendorTab>(() => parseVendorDetailTab(searchParams.get("tab")));
  const setActiveTab = (next: VendorTab) => {
    setActiveTabState(next);
    const params = new URLSearchParams(searchParams);
    const slug = VENDOR_DETAIL_TAB_QUERY[next];
    if (next === "Profile") params.delete("tab");
    else params.set("tab", slug);
    setSearchParams(params, { replace: true });
  };

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
    const fromUrl = parseVendorDetailTab(searchParams.get("tab"));
    setActiveTabState((prev) => (prev === fromUrl ? prev : fromUrl));
  }, [searchParams]);

  const vendorQuery = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendor(id, companyId || null),
    enabled: Boolean(id),
  });

  const billsQuery = useQuery({
    queryKey: ["vendor-ap-bills", companyId, id],
    // ROUND 297 audit (reverse): a voided / revoked bill leaves this tab -- live bills only.
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, status: "active", limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });
  const vendorExpensesQuery = useQuery({
    queryKey: ["vendor-expenses", companyId, id],
    queryFn: () => listExpenses(companyId, { vendor_uuid: id, status: "active", limit: 200 }).then((res) => res.rows),
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

  // CUST-01 C6: "W-9 on file" used to be a static chip ("Managed in Documents") that queried
  // nothing. catalogs.file_categories has no dedicated w9 code -- W-9/1099/IFTA all share the
  // broader "tax_form" category (0028_docs_schema.sql) -- so the honest check is "at least one
  // tax-form document is attached", not a false claim of certainty it's specifically the W-9.
  const taxFormDocsQuery = useQuery({
    queryKey: ["docs-files", companyId, "vendor", id, "tax_form"],
    queryFn: () =>
      listAllFiles({ operating_company_id: companyId, entity_type: "vendor", entity_id: id }).then((result) =>
        result.files.filter((f) => f.category_code === "tax_form" && !f.deleted_at)
      ),
    enabled: Boolean(companyId) && Boolean(id),
  });

  // ORPH-003 — matches the backend's write-role gate for mdata.vendor_payment_methods exactly
  // (migration 202613110000's RLS write policy: Owner/Administrator only, narrower than the
  // Manager/Accountant band above — this records how money leaves the company).
  const canWritePaymentMethods = useMemo(
    () => user?.role === "Owner" || user?.role === "Administrator",
    [user?.role]
  );

  if (vendorQuery.isLoading) return <div className="text-xs text-gray-500">Loading vendor...</div>;
  if (vendorQuery.isError) {
    if (vendorQuery.error instanceof ApiError && vendorQuery.error.status === 404) {
      return (
        <div className="space-y-3">
          <div className="text-xs text-slate-700" role="alert">
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
        <div className="text-xs text-red-600">Vendor not found.</div>
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
            <Button variant="secondary" onClick={() => navigate(`/vendors/${id}/statement`)}>
              Statement
            </Button>
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
      {vendorIntegrityQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          Failed to load rework signals.{" "}
          <button type="button" className="font-semibold text-red-700 underline" onClick={() => void vendorIntegrityQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : reworkSignalCount > 0 ? (
        <div className="rounded-sm border border-slate-300 bg-slate-100 px-3 py-2 text-xs text-slate-700">
          Warning: {reworkSignalCount} possible re-do signal(s) in last 30 days (same vendor/unit/failure pattern).
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <MissingRequiredChip operatingCompanyId={companyId} entityKind="vendor" entityId={vendor.id} />
        {saferStatusQuery.isError ? (
          <StatusBadge variant="warn">
            SAFER status failed — <button type="button" className="underline" onClick={() => void saferStatusQuery.refetch()}>Retry</button>
          </StatusBadge>
        ) : saferEntity?.safer_verified_at ? (
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

      {/* ROUND 326 item 2: AP aging, open bills, 1099, insurance + authority, WOs, fuel, lanes, terms, history. */}
      {companyId && id ? <VendorProfileOverview operatingCompanyId={companyId} vendorId={id} /> : null}

      {/* CUST-01 C9: raw buttons replaced with the shared SecondaryNavTabs -- matches
          CustomerDetail's tab strip exactly (same component, same ?tab=<slug> contract above). */}
      <NavyPageSubNav
        items={tabs.filter((tab) => tab !== "Documents" || canViewDocuments).map((tab) => ({ label: tab, to: `#${tab}` }))}
        activeId={activeTab}
        onTabChange={(nextTab) => setActiveTab(nextTab as VendorTab)}
        itemIds={tabs.filter((tab) => tab !== "Documents" || canViewDocuments).map((tab) => tab)}
      />

      {activeTab === "Profile" ? (
        <div className="space-y-2" data-vend-mdata="1" data-testid="vendor-profile-mdata">
        {/* CUST-01 C7: the 16 reverse-link sections below (work orders, road service, warranty,
            insurance, legal, border crossings, parts, maintenance catalog, safety alerts, cash
            forecast, equipment loans, merges, A/P aging, payment methods, bank transactions) each
            silently render nothing when companyId is empty -- same honest-message convention
            already used on the A/P tab below. */}
        {!companyId ? <p className="text-xs text-red-600">Select an operating company to view linked records.</p> : null}
        <DataPanel title="Vendor Profile">
          {/* FAIL-AP1 — Vendor → Driver reverse when mdata.vendors.driver_id is set.
              Distinct from QBO Mapping. */}
          {vendor.driver_id ? (
            <div
              className="mb-3 rounded-sm border border-slate-200 bg-slate-50 p-3"
              data-testid="vendor-linked-driver"
            >
              <div className="text-[11px] uppercase text-slate-600">Linked driver (A/P payee)</div>
              <div className="mt-1 text-xs font-semibold text-gray-900">
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Tax ID</span>
            <input
              value={profileForm.taxId}
              onChange={(event) => setProfileForm((current) => ({ ...current, taxId: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          {/* VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) */}
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Website</span>
            <input
              value={profileForm.website}
              onChange={(event) => setProfileForm((current) => ({ ...current, website: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Print on check as</span>
            <input
              value={profileForm.printOnCheckName}
              onChange={(event) => setProfileForm((current) => ({ ...current, printOnCheckName: event.target.value }))}
              disabled={!profileEditMode}
              placeholder="Leave blank to use vendor display name"
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">1099 tracking</span>
            <label className="flex items-center gap-2 text-xs text-gray-700">
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
              <div className="flex items-center gap-2 text-xs text-gray-900">
                <VendorCategoryChip code={vendor.vendor_category} />
                <span className="text-xs text-slate-600">Select operating company to edit.</span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-900">
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
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Address</span>
            <input
              value={profileForm.address}
              onChange={(event) => setProfileForm((current) => ({ ...current, address: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-2xl rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Primary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.primaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.primaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, primaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Secondary contact</span>
            <div className="grid w-full max-w-2xl grid-cols-1 gap-2 md:grid-cols-2">
              <input value={profileForm.secondaryContactName} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactName: event.target.value }))} disabled={!profileEditMode} placeholder="Name" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactTitle} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactTitle: event.target.value }))} disabled={!profileEditMode} placeholder="Title" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactPhone} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactPhone: event.target.value }))} disabled={!profileEditMode} placeholder="Phone" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
              <input value={profileForm.secondaryContactEmail} onChange={(event) => setProfileForm((current) => ({ ...current, secondaryContactEmail: event.target.value }))} disabled={!profileEditMode} placeholder="Email" className="rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent" />
            </div>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">General email</span>
            <input
              value={profileForm.generalEmail}
              onChange={(event) => setProfileForm((current) => ({ ...current, generalEmail: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Accounting contact</span>
            <input
              value={profileForm.accountingContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, accountingContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Disputes contact</span>
            <input
              value={profileForm.disputesContact}
              onChange={(event) => setProfileForm((current) => ({ ...current, disputesContact: event.target.value }))}
              disabled={!profileEditMode}
              className="w-full max-w-md rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Factor rate schedule</span>
            <p className="max-w-2xl text-xs text-gray-700" data-testid="vendor-factor-schedule-relocated">
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
              className="w-full max-w-2xl rounded-sm border border-gray-300 px-2 py-1 text-xs disabled:border-transparent disabled:bg-transparent"
            />
          </DataPanelRow>
          {/* Edit/Save/Cancel moved to the top of the panel (discoverable). */}
        </DataPanel>
        <VendorWorkOrdersReverseSection operatingCompanyId={companyId} vendorId={vendor.id} />
        {/* Linkage law §6 (vendor row, PR #23729) — "Fuel purchases" + the fraud alerts on them. */}
        <FuelTransactionsReverseSection
          operatingCompanyId={companyId}
          filter={{ vendor_id: vendor.id }}
          contextLabel="this vendor"
          data-testid="vendor-fuel-transactions-reverse"
        />
        <FuelFraudAlertsReverseSection
          operatingCompanyId={companyId}
          filter={{ vendor_id: vendor.id }}
          contextLabel="this vendor"
          data-testid="vendor-fuel-fraud-alerts-reverse"
        />
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
        <LegalMattersReverseSection
          operatingCompanyId={companyId}
          filter={{ vendor_id: vendor.id }}
          contextLabel="this vendor"
          data-testid="vendor-profile-legal-matters"
        />
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
        <VendorDuplicateExpensesSection operatingCompanyId={companyId} vendorId={vendor.id} />
        <VendorPaymentMethodsSection operatingCompanyId={companyId} vendorId={vendor.id} canWrite={canWritePaymentMethods} />
        <LinkedBankTransactionsPanel companyId={companyId} linkage={{ kind: "vendor_id", id: vendor.id }} entityLabel={vendor.name} />
        </div>
      ) : null}

      {activeTab === "A/P" ? (
        <div className="space-y-2" data-testid="vendor-ap-readonly">
          {!companyId ? <p className="text-xs text-red-600">Select an operating company.</p> : null}
          <div
            className="rounded-sm border border-dashed border-gray-200 bg-white px-3 py-2 text-xs text-slate-600"
            data-testid="vendor-record-bill-payment-disabled"
            data-vend-ap-readonly="1"
          >
            Bills and A/P on this vendor profile are read only. Record bill payments from{" "}
            {/* ROUND 297 audit (drill): /accounting/pay-bills was never a route; pay THIS vendor's bills. */}
            <Link to={`/accounting/bill-payments?vendor_id=${encodeURIComponent(id)}`} className="font-semibold text-slate-800 underline">
              Accounting → Pay bills
            </Link>
            .
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-gray-900">Recent bill payments</div>
            {vendorPaymentsQuery.isError ? (
              <p className="text-xs text-red-600">
                Failed to load bill payments — {(vendorPaymentsQuery.error as Error)?.message ?? "unknown error"}.{" "}
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
          <CappedListNotice shown={(billsQuery.data?.rows ?? []).length} limit={200} />
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 text-xs font-semibold text-gray-900">Expenses</div>
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
            <CappedListNotice shown={(vendorExpensesQuery.data ?? []).length} limit={200} />
          </div>
          <div className="rounded-sm border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-900">Vendor credits</div>
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
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-700">
              {/* CUST-01 C6: real check against docs.files -- there is no dedicated w9 category
                  (tax_form covers W-9/1099/IFTA alike, 0028_docs_schema.sql), so this honestly
                  reports "tax-form document(s) attached", never a bare unverified "on file" claim. */}
              {taxFormDocsQuery.isLoading ? (
                <span className="text-xs text-gray-500">Checking…</span>
              ) : taxFormDocsQuery.isError ? (
                <span className="rounded-sm bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800">Couldn&apos;t check</span>
              ) : (taxFormDocsQuery.data?.length ?? 0) > 0 ? (
                <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                  {taxFormDocsQuery.data!.length} tax-form document{taxFormDocsQuery.data!.length === 1 ? "" : "s"} attached
                </span>
              ) : (
                <span className="rounded-sm border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                  No tax-form document on file
                </span>
              )}
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
            "Tax-form" documents are not verified to specifically be the W-9 (the category is shared
            with 1099/IFTA filings) — confirm the actual file in the Documents tab.
          </p>
        </DataPanel>
      ) : null}
    </div>
  );
}
