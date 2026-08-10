import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { useCatalogQuery } from "../../../hooks/useCatalogQuery";
import { createPartsInventoryPurchase } from "../../../api/maintenance";
import { createVendor, createCustomer } from "../../../api/mdata";
import { chartOfAccountsCatalogClient, classesCatalogClient, itemsCatalogClient } from "../../../api/catalogs-accounting";
import { fetchAccountTypeCatalog, detailTypesForAccountType, ACCOUNT_TYPE_GROUPS } from "../../../api/coa-list";
import { getCoaAccounts } from "../../../api/banking";
import { type ComboboxOption } from "../../../components/Combobox";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { listPaymentTermOptions } from "../../../api/mdata";
import { listCatalogAccounts } from "../../../api/catalog-accounts";

// FIX-03: an item's income/expense account is a REFERENCED catalogs.accounts record (QBO parity), not
// text. Mirror ItemEditorModal's type filters + carrier default so quick-create + full editor agree.
const INCOME_TYPES = ["Income", "OtherIncome"];
const EXPENSE_TYPES = ["Expense", "CostOfGoodsSold", "OtherExpense"];
const CARRIER_DEFAULT_INCOME_NAME = "Sales of Service Income";

// "class" writes catalogs.classes (a reporting DIMENSION, NOT catalogs.accounts — no GL/posting math),
// via the entity-scoped POST /api/v1/catalogs/accounting/classes route. Non-financial, same pattern as item.
export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part" | "class";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  kind: QuickCreateKind;
  // Kept for backwards-compat (TwoSectionLineEditor passes it); no longer used since item create
  // now writes to catalogs.items (canonical) which does not require a QBO income account ID.
  defaultIncomeAccountQboId?: string;
  onClose: () => void;
  onCreated: (created: { id: string; label: string }) => void;
};

// LST-WIRE-04 — vendor types come from catalogs.vendor_types (entity-scoped, operator-managed).
// They were a frozen literal list here, so a type added to the catalog could never be selected.

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // render-v5 §D vendor: Display name (= name) and Company/Vendor name are distinct fields.
  company: z.string().trim().optional(),
  email: z.string().trim().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  vendorType: z.string().trim().min(1).optional(),
  sku: z.string().trim().optional(),
  unitPrice: z.coerce.number().int().min(0).optional(),
  qtyReceived: z.coerce.number().int().min(1).optional(),
  location: z.string().trim().optional(),
  // W-FIX-7b: render-v5 §D vendor address + terms + 1099 + default expense account.
  street: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  paymentTermsId: z.string().uuid().optional().nullable(),
  taxId: z.string().trim().optional(),
  track1099: z.boolean().optional(),
  defaultExpenseAccountId: z.string().uuid().optional().nullable(),
  // category: full COA classification — account_type is the 8-value COA group enum, account_subtype
  // is the chosen Detail Type name (both persisted to catalogs.accounts.metadata).
  accountType: z.string().trim().optional(),
  detailType: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function titleFor(kind: QuickCreateKind): string {
  if (kind === "vendor") return "Quick Create Vendor";
  if (kind === "customer") return "Quick Create Customer";
  if (kind === "item") return "Quick Create Product/Service";
  if (kind === "category") return "Quick Create Category";
  if (kind === "class") return "Quick Create Class";
  return "Quick Create Part";
}

export function QuickCreateEntityModal({
  open,
  operatingCompanyId,
  kind,
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const vendorTypesQuery = useCatalogQuery({
    catalogName: "vendors.vendor_types",
    companyId: operatingCompanyId,
    enabled: open && kind === "vendor" && Boolean(operatingCompanyId),
  });
  const vendorTypeOptions = useMemo(
    () =>
      (vendorTypesQuery.data?.rows ?? []).map((r: Record<string, unknown>) => {
        const label = String(r.display_name ?? "");
        return { value: label, label };
      }).filter((opt) => opt.label),
    [vendorTypesQuery.data]
  );
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      vendorType: "Other",
      sku: "",
      unitPrice: 0,
      qtyReceived: 1,
      location: "",
      street: "",
      city: "",
      state: "",
      zip: "",
      accountNumber: "",
      paymentTermsId: null,
      taxId: "",
      track1099: false,
      defaultExpenseAccountId: null,
      accountType: "",
      detailType: "",
    },
  });
  const vendorType = form.watch("vendorType") ?? "Other";

  // category: live COA Detail Type taxonomy — same source the Chart-of-Accounts page uses
  // (catalogs.account_types via fetchAccountTypeCatalog), filtered by the chosen account type.
  const selectedAccountType = form.watch("accountType") ?? "";
  const accountTypeCatalogQuery = useQuery({
    queryKey: ["account-type-catalog", operatingCompanyId],
    queryFn: () => fetchAccountTypeCatalog(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
    enabled: open && kind === "category" && Boolean(operatingCompanyId),
  });
  const detailTypeOptions = useMemo(
    () => detailTypesForAccountType(accountTypeCatalogQuery.data, selectedAccountType),
    [accountTypeCatalogQuery.data, selectedAccountType],
  );
  // FIX-03 (item only): populate + persist the income/expense GL account link that was previously
  // DROPPED at create. Held in local state (Combobox isn't a native input) alongside react-hook-form.
  const [incomeAccountId, setIncomeAccountId] = useState<string | null>(null);
  const [buyEnabled, setBuyEnabled] = useState(false);
  const [expenseAccountId, setExpenseAccountId] = useState<string | null>(null);
  const [paymentTermsId, setPaymentTermsId] = useState<string | null>(null);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState<string | null>(null);
  const accountsQuery = useQuery({
    // Same source as the categorize row + ItemEditorModal; entity-scoped server-side.
    queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && kind === "item" && !!operatingCompanyId,
  });
  const vendorPaymentTermsQuery = useQuery({
    queryKey: ["payment-term-options", "quick-create-vendor", operatingCompanyId],
    queryFn: () => listPaymentTermOptions(operatingCompanyId),
    enabled: open && kind === "vendor" && Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const vendorExpenseAccountsQuery = useQuery({
    queryKey: ["catalog-accounts", "quick-create-vendor-default-expense", operatingCompanyId],
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: open && kind === "vendor" && Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const paymentTermOptions = useMemo(
    () =>
      (vendorPaymentTermsQuery.data?.payment_terms ?? []).map((t) => ({
        value: t.id,
        label: `${t.terms_name} (${t.days_until_due}d)`,
      })),
    [vendorPaymentTermsQuery.data]
  );
  const vendorExpenseAccountOptions = useMemo(
    () =>
      (vendorExpenseAccountsQuery.data?.accounts ?? [])
        .filter((a) => a.account_type === "Expense")
        .map((a) => ({ value: a.id, label: a.account_name, type: a.account_type ?? undefined })),
    [vendorExpenseAccountsQuery.data]
  );
  const accounts = accountsQuery.data?.accounts ?? [];
  const incomeOptions: ComboboxOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && INCOME_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, sublabel: a.account_number })),
    [accounts]
  );
  const expenseOptions: ComboboxOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && EXPENSE_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, sublabel: a.account_number })),
    [accounts]
  );
  // Carrier default: preselect "Sales of Service Income" for a sellable item when nothing is chosen.
  useEffect(() => {
    if (kind !== "item" || incomeAccountId) return;
    const dflt = accounts.find((a) => a.account_name === CARRIER_DEFAULT_INCOME_NAME && a.account_type && INCOME_TYPES.includes(a.account_type));
    if (dflt) setIncomeAccountId(dflt.id);
  }, [kind, accounts, incomeAccountId]);

  const submit = form.handleSubmit(async (raw) => {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      pushToast(parsed.error.issues[0]?.message ?? "Please review required fields.", "error");
      return;
    }
    if (!operatingCompanyId) {
      pushToast("Select an operating company first.", "error");
      return;
    }

    setSaving(true);
    try {
      if (kind === "vendor") {
        const res = await createVendor({
          name: parsed.data.name,
          vendor_type: parsed.data.vendorType ?? "Other",
          email: parsed.data.email || undefined,
          phone: parsed.data.phone || undefined,
          address: parsed.data.street?.trim() || undefined,
          city: parsed.data.city?.trim() || undefined,
          state: parsed.data.state?.trim() || undefined,
          postal_code: parsed.data.zip?.trim() || undefined,
          account_number: parsed.data.accountNumber?.trim() || undefined,
          payment_terms_id: paymentTermsId,
          default_expense_account_id: defaultExpenseAccountId,
          eligible_1099: parsed.data.track1099 ?? false,
          tax_id: parsed.data.taxId?.trim() || undefined,
          operating_company_id: operatingCompanyId,
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "customer") {
        // D1-1: writes to mdata.customers (canonical) — already fixed in the prior customer path.
        // Same deliverability stamp as NewCustomerDrawerForm: email → billing_email (API) + ar/ap.
        const invoiceEmail = parsed.data.email || undefined;
        const res = await createCustomer({
          name: parsed.data.name,
          operating_company_id: operatingCompanyId,
          email: invoiceEmail,
          ar_email: invoiceEmail,
          ap_email: invoiceEmail,
          phone: parsed.data.phone || undefined,
          main_contact_name: parsed.data.company?.trim() || undefined,
          main_contact_email: invoiceEmail,
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "item") {
        // QB-STD-5: write to catalogs.items (canonical) — same table itemsCatalogClient.list()
        // reads. Previously wrote to mdata.qbo_items (mirror), invisible after refresh.
        // item_type defaults to "Service" (factory requiredMetadata["item_type"]).
        // FIX-03: PERSIST the income/expense GL account link (was DROPPED at create). The backend
        // /catalogs/accounting/items maps default_income_account_id / default_expense_account_id
        // straight to catalogs.items columns and validates account-type server-side.
        if (!incomeAccountId) {
          pushToast("Income account is required for a product/service.", "error");
          setSaving(false);
          return;
        }
        if (buyEnabled && !expenseAccountId) {
          pushToast("Expense account is required when you purchase this item.", "error");
          setSaving(false);
          return;
        }
        const nameSlug = (parsed.data.sku?.trim() || parsed.data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20) || "ITEM").slice(0, 120);
        const itemCode = nameSlug || "ITEM";
        const res = await itemsCatalogClient.create(operatingCompanyId, {
          code: itemCode,
          display_name: parsed.data.name,
          metadata: {
            item_type: "Service",
            unit_price_cents: parsed.data.unitPrice ?? 0,
            default_income_account_id: incomeAccountId,
            default_expense_account_id: buyEnabled ? expenseAccountId : null,
          },
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "category") {
        // FIX-02: full QBO COA classification — persist the CHOSEN account_type (8-value COA group
        // enum) + Detail Type, never a hard-coded Expense. Writes to catalogs.accounts (canonical) —
        // same table getCoaAccounts reads via /api/v1/catalogs/accounts. chartOfAccountsCatalogClient
        // maps to tableName:"accounts" in the factory (NOT the gated NewAccountDrawerForm path).
        if (!parsed.data.accountType) {
          pushToast("Account type is required.", "error");
          return;
        }
        const rawSlug = parsed.data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "ACCT";
        const safeSlug = /^[A-Z]/.test(rawSlug) ? rawSlug : `E${rawSlug}`;
        // Timestamp suffix avoids account_number unique-constraint violations on same-name creates.
        const accountCode = `${safeSlug}${String(Date.now()).slice(-6)}`;
        const res = await chartOfAccountsCatalogClient.create(operatingCompanyId, {
          code: accountCode,
          display_name: parsed.data.name,
          metadata: {
            account_type: parsed.data.accountType,
            account_subtype: parsed.data.detailType?.trim() || undefined,
          },
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "class") {
        // QB-STD-5: write to catalogs.classes (canonical) — same table classesCatalogClient.list()
        // reads (and the ItemEditorModal class picker uses). A Class is a QBO reporting DIMENSION, not a
        // GL account — no posting/ledger math, so this is NON-financial (like item → catalogs.items).
        // The entity-scoped POST /api/v1/catalogs/accounting/classes route writes operating_company_id +
        // asserts company membership under FORCE-RLS. code must be 1-120 chars (class_code column).
        const rawSlug = parsed.data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "CLASS";
        // Timestamp suffix avoids class_code unique-constraint collisions on same-name creates.
        const classCode = `${rawSlug}${String(Date.now()).slice(-6)}`;
        const res = await classesCatalogClient.create(operatingCompanyId, {
          code: classCode,
          display_name: parsed.data.name,
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else {
        const res = await createPartsInventoryPurchase(operatingCompanyId, {
          part_description: parsed.data.name,
          qty_received: parsed.data.qtyReceived ?? 1,
          location: parsed.data.location || undefined,
        });
        onCreated({ id: String(res.id ?? ""), label: parsed.data.name });
      }
      pushToast("Created successfully", "success");
      form.reset();
      setIncomeAccountId(null);
      setBuyEnabled(false);
      setExpenseAccountId(null);
      setPaymentTermsId(null);
      setDefaultExpenseAccountId(null);
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  });

  // CHROME-11: nest create in a right ParityDrawer — never a centered Modal stacked on money drawers.
  return (
    <ParityDrawer open={open} onClose={onClose} title={titleFor(kind)} stackAboveModal>
      <form className="space-y-3 text-sm" onSubmit={submit} data-testid="quick-create-entity-drawer">
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{kind === "vendor" || kind === "customer" ? "Display name *" : "Name *"}</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("name")} aria-label="Quick create name" />
        </label>

        {kind === "vendor" ? (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Vendor type</span>
            {/*
              LST-PICKER-01 (guard 1860): QuickCreateEntityModal vendor path had bare <select> with no
              inline create. ReferenceSelect first-row create → POST catalogs.vendor_types.
            */}
            <div className="mt-1">
              <ReferenceSelect
                value={vendorType}
                onChange={(next) => form.setValue("vendorType", next ?? "Other")}
                options={vendorTypeOptions}
                createKind="vendor_type"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select vendor type…"
                loading={vendorTypesQuery.isLoading}
                onOptionCreated={(opt) => {
                  form.setValue("vendorType", opt.label);
                  void vendorTypesQuery.refetch();
                }}
              />
            </div>
          </label>
        ) : null}

        {kind === "vendor" || kind === "customer" ? (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Company / {kind === "vendor" ? "Vendor" : "Customer"} name</span>
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("company")} aria-label="Quick create company name" placeholder="Defaults to display name" />
          </label>
        ) : null}

        {kind === "vendor" || kind === "customer" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">Email</span>
              <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("email")} aria-label="Quick create email" />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">Phone</span>
              <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("phone")} aria-label="Quick create phone" />
            </label>
          </div>
        ) : null}

        {/* W-FIX-7b: render-v5 §D vendor fields — all persist on POST /api/v1/mdata/vendors. */}
        {kind === "vendor" ? (
          <div className="space-y-2 rounded-sm border border-gray-100 bg-gray-50 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Vendor details (optional)</div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Street</span>
              <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("street")} aria-label="Quick create street" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label><span className="text-xs font-medium text-gray-600">City</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("city")} aria-label="Quick create city" /></label>
              <label><span className="text-xs font-medium text-gray-600">State</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("state")} aria-label="Quick create state" /></label>
              <label><span className="text-xs font-medium text-gray-600">Zip</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("zip")} aria-label="Quick create zip" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs font-medium text-gray-600">Account no.</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("accountNumber")} aria-label="Quick create account number" /></label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Payment terms</span>
                <div className="mt-1">
                  <ReferenceSelect
                    value={paymentTermsId}
                    onChange={setPaymentTermsId}
                    options={paymentTermOptions}
                    createKind="payment_term"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select terms"
                    loading={vendorPaymentTermsQuery.isLoading}
                    onOptionCreated={() =>
                      void queryClient.invalidateQueries({ queryKey: ["payment-term-options"] })
                    }
                  />
                </div>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs font-medium text-gray-600">Tax ID (1099)</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("taxId")} aria-label="Quick create tax id" /></label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Default expense account</span>
                <div className="mt-1">
                  <ReferenceSelect
                    value={defaultExpenseAccountId}
                    onChange={setDefaultExpenseAccountId}
                    options={vendorExpenseAccountOptions}
                    createKind="account"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select expense account"
                    loading={vendorExpenseAccountsQuery.isLoading}
                  />
                </div>
              </label>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" {...form.register("track1099")} aria-label="Quick create track 1099" /> Track 1099?
            </label>
          </div>
        ) : null}

        {kind === "item" ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              <label>
                <span className="text-xs font-medium text-gray-600">SKU (used as item code)</span>
                <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("sku")} aria-label="Quick create SKU" />
              </label>
              <label>
                <span className="text-xs font-medium text-gray-600">Unit price (cents)</span>
                <input type="number" className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("unitPrice")} aria-label="Quick create unit price cents" />
              </label>
            </div>
            {/* FIX-03: income account is REQUIRED (a product/service maps to a sales income account in QBO);
            the picker is populated from catalogs.accounts and the id persists on the item. */}
            <label className="block" data-testid="quick-create-item-income-account">
              <span className="text-xs font-medium text-gray-600">
                Income account *{" "}
                <span className="font-normal text-gray-400">(carrier default: Service income)</span>
              </span>
              <div className="mt-1">
                {/*
                  LST-PICKER-01: bare Combobox → ReferenceSelect createKind=account
                  (parity ItemEditorModal / NewServiceDrawerForm).
                */}
                <ReferenceSelect
                  options={incomeOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
                  value={incomeAccountId}
                  onChange={setIncomeAccountId}
                  createKind="account"
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Select income account"
                  loading={accountsQuery.isLoading}
                  onOptionCreated={() => {
                    void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
                    void queryClient.invalidateQueries({ queryKey: ["catalog-accounts"] });
                  }}
                />
              </div>
            </label>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" checked={buyEnabled} onChange={(e) => setBuyEnabled(e.target.checked)} aria-label="Quick create purchase this item" />
              I purchase this product/service from a vendor
            </label>
            {buyEnabled ? (
              <label className="block" data-testid="quick-create-item-expense-account">
                <span className="text-xs font-medium text-gray-600">Expense / COGS account *</span>
                <div className="mt-1">
                  <ReferenceSelect
                    options={expenseOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
                    value={expenseAccountId}
                    onChange={setExpenseAccountId}
                    createKind="account"
                    operatingCompanyId={operatingCompanyId}
                    placeholder="Select expense account"
                    loading={accountsQuery.isLoading}
                    onOptionCreated={() => {
                      void queryClient.invalidateQueries({ queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId] });
                      void queryClient.invalidateQueries({ queryKey: ["catalog-accounts"] });
                    }}
                  />
                </div>
              </label>
            ) : null}
          </div>
        ) : null}

        {kind === "category" ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Account type *</span>
              <select
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                aria-label="Quick create account type"
                {...form.register("accountType", { onChange: () => form.setValue("detailType", "") })}
              >
                <option value="">Select a type…</option>
                {ACCOUNT_TYPE_GROUPS.map((group) => (
                  <optgroup key={group.label} label={group.label}>
                    {group.types.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Detail type</span>
              <select
                className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm disabled:bg-gray-50 disabled:text-gray-400"
                aria-label="Quick create detail type"
                disabled={detailTypeOptions.length === 0}
                {...form.register("detailType")}
              >
                <option value="">
                  {!selectedAccountType
                    ? "Select an account type first"
                    : detailTypeOptions.length === 0
                      ? "No detail types available"
                      : "Select a detail type…"}
                </option>
                {detailTypeOptions.map((dt) => (
                  <option key={dt.id} value={dt.name}>{dt.name}</option>
                ))}
              </select>
            </label>
          </div>
        ) : null}

        {kind === "part" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">Qty received *</span>
              <input type="number" className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("qtyReceived")} aria-label="Quick create qty received" />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">Location</span>
              <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("location")} aria-label="Quick create part location" />
            </label>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="rounded-sm border border-gray-300 px-3 py-1.5" onClick={onClose} aria-label="Cancel quick create">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-sm bg-[#1f2a44] px-3 py-1.5 font-medium text-white hover:bg-[#0f1729] disabled:opacity-60"
            disabled={saving}
            aria-label="Save quick create"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </ParityDrawer>
  );
}
