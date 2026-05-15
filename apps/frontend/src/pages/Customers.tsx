import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { listUsStates } from "../api/catalogs";
import { createCustomer, listCustomers, listPaymentTermOptions, listVendors, updateCustomer, type Customer, type VendorOption } from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox, type ComboboxOption } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { useToast } from "../components/Toast";
import { FMCSAVerificationModal } from "../components/customers/FMCSAVerificationModal";
import { FieldError, fieldErrorClassname } from "../components/forms/FieldError";
import { FormErrorBanner } from "../components/forms/FormErrorBanner";
import { useFormValidation } from "../components/forms/useFormValidation";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { dataTableErrorState } from "../lib/tableError";
import { PageHeader } from "../components/layout/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";
import { SavedViewsBar } from "../components/saved-views/SavedViewsBar";
import { colors } from "../design/tokens";

const createCustomerSchema = z.object({
  legal_name: z.string().trim().min(1, "Legal name is required").max(200),
  dba: z.string().trim().max(200).optional(),
  code: z.string().trim().max(100).optional(),
  customer_type: z.enum(["broker", "direct"]),
  status: z.enum(["active", "inactive", "credit_hold", "blacklist"]).default("active"),
  dot_number: z.string().trim().max(100).optional(),
  mc_number: z.string().trim().max(100).optional(),
  tax_id: z.string().trim().max(50).optional(),
  office_phone: z.string().trim().max(50).optional(),
  fax_phone: z.string().trim().max(50).optional(),
  website: z.string().trim().max(200).optional(),
  main_contact_name: z.string().trim().max(120).optional(),
  main_contact_title: z.string().trim().max(120).optional(),
  main_contact_email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).optional(),
  main_contact_phone: z.string().trim().max(50).optional(),
  main_contact_mobile: z.string().trim().max(50).optional(),
  ar_email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).optional(),
  ar_phone: z.string().trim().max(50).optional(),
  ap_email: z.union([z.literal(""), z.string().trim().email("Invalid email")]).optional(),
  ap_phone: z.string().trim().max(50).optional(),
  billing_state: z.string().trim().max(8).optional(),
  credit_limit: z.coerce.number().min(0).optional(),
  credit_limit_source: z.enum(["", "factor", "manual", "rmis_future"]).default(""),
  payment_terms_id: z.string().uuid().optional().or(z.literal("")),
  free_time_pickup_minutes: z.coerce.number().int().min(0).optional(),
  free_time_delivery_minutes: z.coerce.number().int().min(0).optional(),
  detention_rate_per_hour: z.coerce.number().min(0).optional(),
  layover_charge_per_day: z.union([z.literal(""), z.coerce.number().min(0)]).optional(),
  layover_currency: z.enum(["USD", "MXN", "CAD"]).default("USD"),
  layover_first_night_free: z.boolean().default(true),
  layover_max_days: z.union([z.literal(""), z.coerce.number().int().min(1)]).optional(),
  layover_notes: z.string().trim().max(2000).optional(),
  factoring_eligible: z.boolean().default(true),
  factoring_company_vendor_id: z.string().uuid().optional().or(z.literal("")),
  factoring_advance_rate_override: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).optional(),
  factoring_reserve_pct_override: z.union([z.literal(""), z.coerce.number().min(0).max(100)]).optional(),
  factoring_recourse_type: z.enum(["", "recourse", "non_recourse"]).default(""),
  factoring_notes: z.string().trim().max(1000).optional(),
  notes: z.string().trim().max(2000).optional(),
});

const updateCustomerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(100).optional(),
  dot_number: z.string().trim().max(100).optional(),
  customer_type: z.enum(["broker", "direct_shipper"]).optional().or(z.literal("")),
  status: z.enum(["active", "inactive", "credit_hold", "blacklist"]).default("active"),
  credit_limit: z.coerce.number().min(0).optional(),
  notes: z.string().trim().max(2000).optional(),
});

function emptyCreateForm() {
  return {
    legal_name: "",
    dba: "",
    code: "",
    customer_type: "broker",
    status: "active",
    dot_number: "",
    mc_number: "",
    tax_id: "",
    office_phone: "",
    fax_phone: "",
    website: "",
    main_contact_name: "",
    main_contact_title: "",
    main_contact_email: "",
    main_contact_phone: "",
    main_contact_mobile: "",
    ar_email: "",
    ar_phone: "",
    ap_email: "",
    ap_phone: "",
    billing_state: "",
    credit_limit: "",
    credit_limit_source: "manual",
    payment_terms_id: "",
    free_time_pickup_minutes: "120",
    free_time_delivery_minutes: "120",
    detention_rate_per_hour: "0",
    layover_charge_per_day: "",
    layover_currency: "USD",
    layover_first_night_free: true,
    layover_max_days: "",
    layover_notes: "",
    factoring_eligible: true,
    factoring_company_vendor_id: "",
    factoring_advance_rate_override: "",
    factoring_reserve_pct_override: "",
    factoring_recourse_type: "",
    factoring_notes: "",
    notes: "",
  };
}

function emptyEditForm() {
  return {
    name: "",
    customer_code: "",
    email: "",
    phone: "",
    mc_number: "",
    dot_number: "",
    customer_type: "",
    status: "active",
    credit_limit: "",
    notes: "",
  };
}

type CreateCustomerFormState = ReturnType<typeof emptyCreateForm>;
type CustomerFormState = ReturnType<typeof emptyEditForm>;

function customerTypeLabel(value: "broker" | "direct_shipper" | null) {
  if (value === "broker") return "Broker";
  if (value === "direct_shipper") return "Direct Shipper";
  return "Not set";
}

function customerStatusLabel(status: Customer["status"]) {
  if (status === "credit_hold") return "Credit Hold";
  if (status === "blacklist") return "Blacklist";
  if (status === "inactive") return "Inactive";
  return "Active";
}

function customerStatusVariant(status: Customer["status"]): "crit" | "warn" | "neutral" | "positive" {
  if (status === "blacklist") return "crit";
  if (status === "credit_hold") return "warn";
  if (status === "inactive") return "neutral";
  return "positive";
}

function qualityFlagVariant(flag: Customer["quality_overall_flag"]): "positive" | "neutral" | "warn" | "crit" {
  if (flag === "preferred") return "positive";
  if (flag === "caution") return "warn";
  if (flag === "avoid") return "crit";
  return "neutral";
}

function formatMoney(value: string | number | null) {
  if (value === null) return "-";
  return `$${Number(value).toFixed(2)}`;
}

const CUSTOMER_LIST_TAB_IDS = ["all", "preferred", "watch", "inactive", "factored"] as const;
type CustomerListTabId = (typeof CUSTOMER_LIST_TAB_IDS)[number];

function parseCustomerListTab(searchParams: URLSearchParams): CustomerListTabId {
  const raw = (searchParams.get("tab") ?? "all").toLowerCase();
  return (CUSTOMER_LIST_TAB_IDS as readonly string[]).includes(raw) ? (raw as CustomerListTabId) : "all";
}

const CREATE_CUSTOMER_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "broker", label: "Broker" },
  { value: "direct", label: "Direct" },
];

const CUSTOMER_STATUS_OPTIONS: ComboboxOption[] = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "credit_hold", label: "Credit Hold" },
  { value: "blacklist", label: "Blacklist" },
];

const CREDIT_LIMIT_SOURCE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "(unset)" },
  { value: "factor", label: "Factor" },
  { value: "manual", label: "Manual" },
  { value: "rmis_future", label: "RMIS Future" },
];

const RECOURSE_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "Use default" },
  { value: "recourse", label: "Recourse" },
  { value: "non_recourse", label: "Non-recourse" },
];
const LAYOVER_CURRENCY_OPTIONS: ComboboxOption[] = [
  { value: "USD", label: "USD" },
  { value: "MXN", label: "MXN" },
  { value: "CAD", label: "CAD" },
];

const EDIT_CUSTOMER_TYPE_OPTIONS: ComboboxOption[] = [
  { value: "", label: "Not set" },
  { value: "broker", label: "Broker" },
  { value: "direct_shipper", label: "Direct Shipper" },
];

export function CustomersPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canManage = ["Owner", "Administrator", "Manager", "Accountant", "Dispatcher"].includes(user?.role ?? "");
  const canOwnerExtendCatalogs = user?.role === "Owner";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [createForm, setCreateForm] = useState<CreateCustomerFormState>(emptyCreateForm());
  const [editForm, setEditForm] = useState<CustomerFormState>(emptyEditForm());
  const [fmcsaModalOpen, setFmcsaModalOpen] = useState(false);
  const showTaxId = user?.role === "Owner";

  const customerListTab = useMemo(() => parseCustomerListTab(searchParams), [searchParams]);

  const setCustomerListTab = (next: CustomerListTabId) => {
    setSearchParams(
      (prev) => {
        const nextParams = new URLSearchParams(prev);
        if (next === "all") nextParams.delete("tab");
        else nextParams.set("tab", next);
        return nextParams;
      },
      { replace: false }
    );
  };
  const [showOnlyFmcsaVerified, setShowOnlyFmcsaVerified] = useState(false);
  const [sortByDisputes, setSortByDisputes] = useState(false);

  const customersQuery = useQuery({
    queryKey: ["customers", "all-statuses"],
    queryFn: () => listCustomers({}).then((result) => result.customers),
  });
  const paymentTermsQuery = useQuery({
    queryKey: ["catalogs", "payment-terms", "active"],
    queryFn: () => listPaymentTermOptions().then((result) => result.payment_terms),
  });
  const vendorsQuery = useQuery({
    queryKey: ["vendors", "active"],
    queryFn: () => listVendors({ status: "active" }).then((result) => result.vendors),
  });
  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setAddOpen(false);
      setCreateForm(emptyCreateForm());
      pushToast("Customer created", "success");
    },
  });

  const {
    fieldErrors: customerFieldErrors,
    apiError: customerApiError,
    submit: submitCustomerCreate,
    clearFieldError: clearCustomerFieldError,
    resetErrors: resetCustomerCreateErrors,
  } = useFormValidation({
    schema: createCustomerSchema,
    onSubmit: async (parsed) => {
      await createMutation.mutateAsync({
        name: parsed.legal_name,
        legal_name: parsed.legal_name,
        dba: parsed.dba || undefined,
        customer_code: parsed.code || undefined,
        code: parsed.code || undefined,
        website: parsed.website || undefined,
        office_phone: parsed.office_phone || undefined,
        fax_phone: parsed.fax_phone || undefined,
        mc_number: parsed.mc_number || undefined,
        dot_number: parsed.dot_number || undefined,
        tax_id: showTaxId ? parsed.tax_id || undefined : undefined,
        customer_type: parsed.customer_type === "direct" ? "direct_shipper" : "broker",
        status: parsed.status,
        credit_limit: parsed.credit_limit,
        credit_limit_source: parsed.credit_limit_source || undefined,
        payment_terms_id: parsed.payment_terms_id || undefined,
        main_contact_name: parsed.main_contact_name || undefined,
        main_contact_title: parsed.main_contact_title || undefined,
        main_contact_email: parsed.main_contact_email || undefined,
        main_contact_phone: parsed.main_contact_phone || undefined,
        main_contact_mobile: parsed.main_contact_mobile || undefined,
        ar_email: parsed.ar_email || undefined,
        ar_phone: parsed.ar_phone || undefined,
        ap_email: parsed.ap_email || undefined,
        ap_phone: parsed.ap_phone || undefined,
        billing_state: parsed.billing_state || undefined,
        free_time_pickup_minutes: parsed.free_time_pickup_minutes,
        free_time_delivery_minutes: parsed.free_time_delivery_minutes,
        detention_rate_per_hour: parsed.detention_rate_per_hour,
        layover_charge_per_day: typeof parsed.layover_charge_per_day === "number" ? parsed.layover_charge_per_day : undefined,
        layover_currency: parsed.layover_currency ?? "USD",
        layover_first_night_free: parsed.layover_first_night_free,
        layover_max_days: typeof parsed.layover_max_days === "number" ? parsed.layover_max_days : undefined,
        layover_notes: parsed.layover_notes || undefined,
        factoring_eligible: parsed.factoring_eligible,
        factoring_company_vendor_id: parsed.factoring_company_vendor_id || undefined,
        factoring_advance_rate_override:
          typeof parsed.factoring_advance_rate_override === "number" ? parsed.factoring_advance_rate_override : undefined,
        factoring_reserve_pct_override:
          typeof parsed.factoring_reserve_pct_override === "number" ? parsed.factoring_reserve_pct_override : undefined,
        factoring_recourse_type:
          parsed.factoring_recourse_type === "" ? undefined : (parsed.factoring_recourse_type as "recourse" | "non_recourse"),
        factoring_notes: parsed.factoring_notes || undefined,
        notes: parsed.notes || undefined,
      });
    },
  });

  useEffect(() => {
    if (!addOpen) return;
    resetCustomerCreateErrors();
  }, [addOpen, resetCustomerCreateErrors]);

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateCustomer>[1] }) => updateCustomer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditOpen(false);
      setSelectedCustomer(null);
      pushToast("Customer updated", "success");
    },
  });

  const allCustomers = useMemo(() => customersQuery.data ?? [], [customersQuery.data]);
  const customerTabCounts = useMemo(
    () => ({
      all: allCustomers.length,
      preferred: allCustomers.filter((c) => c.quality_overall_flag === "preferred").length,
      watch: allCustomers.filter((c) => c.quality_overall_flag === "caution").length,
      inactive: allCustomers.filter((c) => c.status === "inactive").length,
      factored: allCustomers.filter((c) => Boolean(c.factoring_company_vendor_id)).length,
    }),
    [allCustomers]
  );

  const customers = useMemo(() => {
    let filtered = [...allCustomers];
    switch (customerListTab) {
      case "preferred":
        filtered = filtered.filter((c) => c.quality_overall_flag === "preferred");
        break;
      case "watch":
        filtered = filtered.filter((c) => c.quality_overall_flag === "caution");
        break;
      case "inactive":
        filtered = filtered.filter((c) => c.status === "inactive");
        break;
      case "factored":
        filtered = filtered.filter((c) => Boolean(c.factoring_company_vendor_id));
        break;
      default:
        break;
    }
    if (showOnlyFmcsaVerified) {
      filtered = filtered.filter((customer) => Boolean(customer.fmcsa_verified_at));
    }
    if (sortByDisputes) {
      filtered = [...filtered].sort((a, b) => (b.quality_disputes_count ?? 0) - (a.quality_disputes_count ?? 0));
    }
    return filtered;
  }, [allCustomers, customerListTab, showOnlyFmcsaVerified, sortByDisputes]);
  const activeCount = allCustomers.filter((customer) => customer.status === "active").length;
  const creditHoldCount = allCustomers.filter((customer) => customer.status === "credit_hold").length;
  const blacklistCount = allCustomers.filter((customer) => customer.status === "blacklist").length;

  return (
    <div className="space-y-3">
      <PageHeader
        title="Customers"
        subtitle={`${customers.length} records`}
        actions={canManage ? <ActionButton onClick={() => setAddOpen(true)}>+ Create Customer</ActionButton> : null}
      />

      <KpiStrip>
        <KpiCard label="Active" number={activeCount} accent={colors.positive.strong} />
        <KpiCard label="Credit Hold" number={creditHoldCount} accent={colors.warn.strong} />
        <KpiCard label="Blacklist" number={blacklistCount} accent={colors.crit.strong} />
      </KpiStrip>
      <SavedViewsBar
        tableName="customers"
        currentView={{
          tab: customerListTab,
          showOnlyFmcsaVerified,
          sortByDisputes,
        }}
        onApply={(v) => {
          const tab = v.tab;
          if (typeof tab === "string" && (CUSTOMER_LIST_TAB_IDS as readonly string[]).includes(tab)) {
            setCustomerListTab(tab as CustomerListTabId);
          }
          if (typeof v.showOnlyFmcsaVerified === "boolean") setShowOnlyFmcsaVerified(v.showOnlyFmcsaVerified);
          if (typeof v.sortByDisputes === "boolean") setSortByDisputes(v.sortByDisputes);
        }}
      />
      <SecondaryNavTabs
        className="-mx-2"
        activeId={customerListTab}
        onChange={(id) => {
          if ((CUSTOMER_LIST_TAB_IDS as readonly string[]).includes(id)) setCustomerListTab(id as CustomerListTabId);
        }}
        tabs={[
          { id: "all", label: `All (${customerTabCounts.all})` },
          { id: "preferred", label: `Preferred (${customerTabCounts.preferred})` },
          { id: "watch", label: `Watch (${customerTabCounts.watch})` },
          { id: "inactive", label: `Inactive (${customerTabCounts.inactive})` },
          { id: "factored", label: `Factored (${customerTabCounts.factored})` },
        ]}
      />
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
          <input type="checkbox" checked={sortByDisputes} onChange={(event) => setSortByDisputes(event.target.checked)} />
          Sort by disputes
        </label>
        <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
          <input type="checkbox" checked={showOnlyFmcsaVerified} onChange={(event) => setShowOnlyFmcsaVerified(event.target.checked)} />
          Show only verified
        </label>
      </div>

      <div className="space-y-3">
        <DataTable
          rows={customers}
          rowKey={(row) => row.id}
          loading={customersQuery.isLoading}
          errorState={dataTableErrorState(customersQuery.error, () => void customersQuery.refetch())}
          onRowClick={(row) => navigate(`/customers/${row.id}`)}
          columns={[
              {
                key: "name",
                label: "Customer",
                className: "max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const name = row.name;
                  return (
                    <span title={name} className="single-line-name">
                      {name}
                    </span>
                  );
                },
              },
              { key: "customer_code", label: "Code", cellClass: "code-cell", render: (row) => row.customer_code ?? "-" },
              { key: "type", label: "Type", render: (row) => customerTypeLabel(row.customer_type) },
              {
                key: "status",
                label: "Status",
                render: (row) => <StatusBadge variant={customerStatusVariant(row.status)}>{customerStatusLabel(row.status)}</StatusBadge>,
              },
              {
                key: "quality",
                label: "Quality",
                render: (row) => <StatusBadge variant={qualityFlagVariant(row.quality_overall_flag)}>{row.quality_overall_flag}</StatusBadge>,
              },
              { key: "mc_dot", label: "MC / DOT", render: (row) => `${row.mc_number ?? "-"} / ${row.dot_number ?? "-"}` },
              {
                key: "fmcsa_verified",
                label: "FMCSA Verified",
                render: (row) => (
                  <StatusBadge variant={row.fmcsa_verified_at ? "positive" : "crit"}>
                    {row.fmcsa_verified_at ? "Yes" : "No"}
                  </StatusBadge>
                ),
              },
              {
                key: "contact",
                label: "Main Contact",
                className: "min-w-0 max-w-[240px] whitespace-nowrap",
                render: (row) => {
                  const v = row.main_contact_name ?? "-";
                  return (
                    <span title={v !== "-" ? v : undefined} className="single-line-name">
                      {v}
                    </span>
                  );
                },
              },
              { key: "ar_email", label: "A/R Email", render: (row) => row.ar_email ?? "-" },
              { key: "detention", label: "Detention", render: (row) => `${formatMoney(row.detention_rate_per_hour)}/hr` },
              {
                key: "actions",
                label: "Actions",
                render: (row) =>
                  canManage ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedCustomer(row);
                        setEditForm({
                          name: row.name,
                          customer_code: row.customer_code ?? "",
                          email: row.email ?? "",
                          phone: row.phone ?? "",
                          mc_number: row.mc_number ?? "",
                          dot_number: row.dot_number ?? "",
                          customer_type: row.customer_type ?? "",
                          status: row.status,
                          credit_limit: row.credit_limit ? String(row.credit_limit) : "",
                          notes: row.notes ?? "",
                        });
                        setEditOpen(true);
                      }}
                    >
                      Edit
                    </Button>
                  ) : null,
              },
            ]}
          />
      </div>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Customer">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submitCustomerCreate(createForm as unknown as z.infer<typeof createCustomerSchema>);
          }}
        >
          <FormErrorBanner message={customerApiError} />
          <CreateCustomerFormFields
            form={createForm}
            setForm={setCreateForm}
            errors={customerFieldErrors}
            onClearField={clearCustomerFieldError}
            showTaxId={showTaxId}
            paymentTermOptions={paymentTermsQuery.data ?? []}
            paymentTermsLoading={paymentTermsQuery.isLoading}
            vendors={vendorsQuery.data ?? []}
            usStates={usStatesQuery.data ?? []}
            usStatesLoading={usStatesQuery.isLoading}
            usStatesError={usStatesQuery.isError}
            canOwnerExtendCatalogs={canOwnerExtendCatalogs}
            onOpenFmcsaVerification={() => setFmcsaModalOpen(true)}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title={`Edit Customer${selectedCustomer ? `: ${selectedCustomer.name}` : ""}`}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!selectedCustomer) return;
            const parsed = updateCustomerSchema.safeParse(editForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            try {
              await updateMutation.mutateAsync({
                id: selectedCustomer.id,
                payload: {
                  name: parsed.data.name,
                  customer_code: parsed.data.customer_code || null,
                  email: parsed.data.email || null,
                  phone: parsed.data.phone || null,
                  mc_number: parsed.data.mc_number || null,
                  dot_number: parsed.data.dot_number || null,
                  customer_type: parsed.data.customer_type ? (parsed.data.customer_type as "broker" | "direct_shipper") : null,
                  status: parsed.data.status,
                  credit_limit: parsed.data.credit_limit ?? null,
                  notes: parsed.data.notes || null,
                },
              });
            } catch {
              pushToast("Failed to update customer", "error");
            }
          }}
        >
          <CustomerFormFields form={editForm} setForm={setEditForm} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={updateMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <FMCSAVerificationModal
        open={fmcsaModalOpen}
        onClose={() => setFmcsaModalOpen(false)}
        initialUsdot={createForm.dot_number}
        initialMc={createForm.mc_number}
        onApplyToCustomer={(fmcsaResult) => {
          setCreateForm((current) => ({
            ...current,
            legal_name: fmcsaResult.legal_name ?? current.legal_name,
            dba: fmcsaResult.dba_name ?? current.dba,
            dot_number: fmcsaResult.usdot_number ?? current.dot_number,
            mc_number: fmcsaResult.mc_number ?? current.mc_number,
            office_phone: fmcsaResult.phone ?? current.office_phone,
          }));
          pushToast("FMCSA values applied to customer form", "success");
        }}
      />
    </div>
  );
}

function CreateCustomerFormFields({
  form,
  setForm,
  errors,
  onClearField,
  showTaxId,
  paymentTermOptions,
  paymentTermsLoading,
  vendors,
  usStates,
  usStatesLoading,
  usStatesError,
  canOwnerExtendCatalogs,
  onOpenFmcsaVerification,
}: {
  form: CreateCustomerFormState;
  setForm: Dispatch<SetStateAction<CreateCustomerFormState>>;
  errors: Record<string, string>;
  onClearField: (field: string) => void;
  showTaxId: boolean;
  paymentTermOptions: Array<{ id: string; terms_name: string; days_until_due: number }>;
  paymentTermsLoading: boolean;
  vendors: VendorOption[];
  usStates: Array<{ id: string; code: string; name: string; region: string }>;
  usStatesLoading: boolean;
  usStatesError: boolean;
  canOwnerExtendCatalogs: boolean;
  onOpenFmcsaVerification: () => void;
}) {
  const FieldLabel = ({ text, required }: { text: string; required?: boolean }) => (
    <label className="text-xs font-semibold text-gray-600">
      {text}
      {required ? <span className="ml-1 text-red-500">*</span> : null}
    </label>
  );
  const ef = (field: string) => errors[field];
  const factoringVendors = vendors.filter((vendor) => {
    const notes = (vendor.notes ?? "").toLowerCase();
    const name = vendor.name.toLowerCase();
    return vendor.vendor_type === "factoring_company" || notes.includes("factor") || name.includes("factor") || name.includes("faro") || name.includes("rts");
  });

  return (
    <div className="space-y-3">
      <details className="rounded border border-gray-200 p-3" open>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-700">Required + Identification</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel text="Legal Name" required />
            <input
              data-field="legal_name"
              value={form.legal_name}
              aria-describedby={ef("legal_name") ? "legal_name-error" : undefined}
              onChange={(event) => {
                onClearField("legal_name");
                setForm((current) => ({ ...current, legal_name: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("legal_name")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="legal_name" message={ef("legal_name")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="DBA" />
            <input
              data-field="dba"
              value={form.dba}
              aria-describedby={ef("dba") ? "dba-error" : undefined}
              onChange={(event) => {
                onClearField("dba");
                setForm((current) => ({ ...current, dba: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("dba")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="dba" message={ef("dba")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Code" />
            <input
              data-field="code"
              value={form.code}
              aria-describedby={ef("code") ? "code-error" : undefined}
              onChange={(event) => {
                onClearField("code");
                setForm((current) => ({ ...current, code: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("code")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="code" message={ef("code")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Customer Type" required />
            <Combobox
              dataField="customer_type"
              options={CREATE_CUSTOMER_TYPE_OPTIONS}
              value={form.customer_type}
              onChange={(nextValue) => {
                onClearField("customer_type");
                setForm((current) => ({ ...current, customer_type: ((nextValue as "broker" | "direct") ?? "broker") }));
              }}
              placeholder="Select customer type"
              error={ef("customer_type")}
            />
            <FieldError id="customer_type" message={ef("customer_type")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Status" />
            <Combobox
              dataField="status"
              options={CUSTOMER_STATUS_OPTIONS}
              value={form.status}
              onChange={(nextValue) => {
                onClearField("status");
                setForm((current) => ({ ...current, status: nextValue ?? "active" }));
              }}
              placeholder="Select status"
              error={ef("status")}
            />
            <FieldError id="status" message={ef("status")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="DOT Number" />
            <input
              data-field="dot_number"
              value={form.dot_number}
              aria-describedby={ef("dot_number") ? "dot_number-error" : undefined}
              onChange={(event) => {
                onClearField("dot_number");
                setForm((current) => ({ ...current, dot_number: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("dot_number")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="dot_number" message={ef("dot_number")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="MC Number" />
            <input
              data-field="mc_number"
              value={form.mc_number}
              aria-describedby={ef("mc_number") ? "mc_number-error" : undefined}
              onChange={(event) => {
                onClearField("mc_number");
                setForm((current) => ({ ...current, mc_number: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("mc_number")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="mc_number" message={ef("mc_number")} />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={onOpenFmcsaVerification}>
              Verify FMCSA Authority
            </Button>
          </div>
          {showTaxId ? (
            <div className="flex flex-col gap-1">
              <FieldLabel text="Tax ID" />
              <input
                data-field="tax_id"
                value={form.tax_id}
                aria-describedby={ef("tax_id") ? "tax_id-error" : undefined}
                onChange={(event) => {
                  onClearField("tax_id");
                  setForm((current) => ({ ...current, tax_id: event.target.value }));
                }}
                className={fieldErrorClassname(Boolean(ef("tax_id")), "rounded border px-2 py-2 text-sm")}
              />
              <FieldError id="tax_id" message={ef("tax_id")} />
            </div>
          ) : null}
        </div>
      </details>

      <details className="rounded border border-gray-200 p-3" open>
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-700">Contact Info</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {([
            ["office_phone", "Office Phone"],
            ["fax_phone", "Fax Phone"],
            ["website", "Website"],
            ["main_contact_name", "Main Contact Name"],
            ["main_contact_title", "Main Contact Title"],
            ["main_contact_phone", "Main Contact Phone"],
            ["main_contact_mobile", "Main Contact Mobile"],
          ] as Array<[keyof CreateCustomerFormState, string]>).map(([field, label]) => (
            <div key={field} className="flex flex-col gap-1">
              <FieldLabel text={label} />
              <input
                data-field={field}
                value={String(form[field] ?? "")}
                aria-describedby={ef(field) ? `${String(field)}-error` : undefined}
                onChange={(event) => {
                  onClearField(String(field));
                  setForm((current) => ({ ...current, [field]: event.target.value }));
                }}
                className={fieldErrorClassname(Boolean(ef(field)), "rounded border px-2 py-2 text-sm")}
              />
              <FieldError id={String(field)} message={ef(field)} />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <FieldLabel text="Main Contact Email" />
            <input
              data-field="main_contact_email"
              value={form.main_contact_email}
              aria-describedby={ef("main_contact_email") ? "main_contact_email-error" : undefined}
              onChange={(event) => {
                onClearField("main_contact_email");
                setForm((current) => ({ ...current, main_contact_email: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("main_contact_email")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="main_contact_email" message={ef("main_contact_email")} />
          </div>
        </div>
      </details>

      <details className="rounded border border-gray-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-700">Billing, Detention & Factoring</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/R Email" />
            <input
              data-field="ar_email"
              value={form.ar_email}
              aria-describedby={ef("ar_email") ? "ar_email-error" : undefined}
              onChange={(event) => {
                onClearField("ar_email");
                setForm((current) => ({ ...current, ar_email: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("ar_email")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="ar_email" message={ef("ar_email")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/R Phone" />
            <input
              data-field="ar_phone"
              value={form.ar_phone}
              aria-describedby={ef("ar_phone") ? "ar_phone-error" : undefined}
              onChange={(event) => {
                onClearField("ar_phone");
                setForm((current) => ({ ...current, ar_phone: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("ar_phone")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="ar_phone" message={ef("ar_phone")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/P Email" />
            <input
              data-field="ap_email"
              value={form.ap_email}
              aria-describedby={ef("ap_email") ? "ap_email-error" : undefined}
              onChange={(event) => {
                onClearField("ap_email");
                setForm((current) => ({ ...current, ap_email: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("ap_email")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="ap_email" message={ef("ap_email")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/P Phone" />
            <input
              data-field="ap_phone"
              value={form.ap_phone}
              aria-describedby={ef("ap_phone") ? "ap_phone-error" : undefined}
              onChange={(event) => {
                onClearField("ap_phone");
                setForm((current) => ({ ...current, ap_phone: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("ap_phone")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="ap_phone" message={ef("ap_phone")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Billing State" />
            <Combobox
              dataField="billing_state"
              options={usStates.map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={form.billing_state || null}
              onChange={(nextValue) => {
                onClearField("billing_state");
                setForm((current) => ({ ...current, billing_state: nextValue ?? "" }));
              }}
              loading={usStatesLoading}
              disabled={usStatesError}
              placeholder="Select state"
              error={ef("billing_state")}
            />
            <FieldError id="billing_state" message={ef("billing_state")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Credit Limit" />
            <input
              data-field="credit_limit"
              value={form.credit_limit}
              aria-describedby={ef("credit_limit") ? "credit_limit-error" : undefined}
              onChange={(event) => {
                onClearField("credit_limit");
                setForm((current) => ({ ...current, credit_limit: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("credit_limit")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="credit_limit" message={ef("credit_limit")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Credit Limit Source" />
            <Combobox
              dataField="credit_limit_source"
              options={CREDIT_LIMIT_SOURCE_OPTIONS}
              value={form.credit_limit_source}
              onChange={(nextValue) => {
                onClearField("credit_limit_source");
                setForm((current) => ({ ...current, credit_limit_source: ((nextValue ?? "") as "" | "factor" | "manual" | "rmis_future") }));
              }}
              placeholder="Select credit limit source"
              error={ef("credit_limit_source")}
            />
            <FieldError id="credit_limit_source" message={ef("credit_limit_source")} />
            <div className="text-[11px] text-gray-500">
              If set by your factor (Faro/RTS), select Factor and let daily report sync update. Otherwise select Manual.
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Payment Terms" />
            <Combobox
              dataField="payment_terms_id"
              options={[
                { value: "", label: "Default" },
                ...paymentTermOptions.map((option) => ({
                  value: option.id,
                  label: `${option.terms_name} (${option.days_until_due} days)`,
                })),
              ]}
              value={form.payment_terms_id}
              onChange={(nextValue) => {
                onClearField("payment_terms_id");
                setForm((current) => ({ ...current, payment_terms_id: nextValue ?? "" }));
              }}
              placeholder="Select payment terms"
              loading={paymentTermsLoading}
              error={ef("payment_terms_id")}
              allowAddNew={
                canOwnerExtendCatalogs
                  ? {
                      label: "Add payment terms in catalog",
                      onAdd: (query) => setForm((current) => ({ ...current, notes: `${current.notes}\nRequested payment terms: ${query}`.trim() })),
                    }
                  : undefined
              }
            />
            <FieldError id="payment_terms_id" message={ef("payment_terms_id")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Free Time Pickup (minutes)" />
            <input
              data-field="free_time_pickup_minutes"
              value={form.free_time_pickup_minutes}
              aria-describedby={ef("free_time_pickup_minutes") ? "free_time_pickup_minutes-error" : undefined}
              onChange={(event) => {
                onClearField("free_time_pickup_minutes");
                setForm((current) => ({ ...current, free_time_pickup_minutes: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("free_time_pickup_minutes")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="free_time_pickup_minutes" message={ef("free_time_pickup_minutes")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Free Time Delivery (minutes)" />
            <input
              data-field="free_time_delivery_minutes"
              value={form.free_time_delivery_minutes}
              aria-describedby={ef("free_time_delivery_minutes") ? "free_time_delivery_minutes-error" : undefined}
              onChange={(event) => {
                onClearField("free_time_delivery_minutes");
                setForm((current) => ({ ...current, free_time_delivery_minutes: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("free_time_delivery_minutes")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="free_time_delivery_minutes" message={ef("free_time_delivery_minutes")} />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Detention Rate / Hour" />
            <input
              data-field="detention_rate_per_hour"
              value={form.detention_rate_per_hour}
              aria-describedby={ef("detention_rate_per_hour") ? "detention_rate_per_hour-error" : undefined}
              onChange={(event) => {
                onClearField("detention_rate_per_hour");
                setForm((current) => ({ ...current, detention_rate_per_hour: event.target.value }));
              }}
              className={fieldErrorClassname(Boolean(ef("detention_rate_per_hour")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="detention_rate_per_hour" message={ef("detention_rate_per_hour")} />
          </div>
          <div className="md:col-span-2 mt-2 rounded border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Layover Charges</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <FieldLabel text="Layover Charge per Day ($)" />
                <input
                  data-field="layover_charge_per_day"
                  value={form.layover_charge_per_day}
                  aria-describedby={ef("layover_charge_per_day") ? "layover_charge_per_day-error" : undefined}
                  onChange={(event) => {
                    onClearField("layover_charge_per_day");
                    setForm((current) => ({ ...current, layover_charge_per_day: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(ef("layover_charge_per_day")), "rounded border px-2 py-2 text-sm")}
                  placeholder="e.g. 300"
                />
                <FieldError id="layover_charge_per_day" message={ef("layover_charge_per_day")} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Currency" />
                <Combobox
                  dataField="layover_currency"
                  options={LAYOVER_CURRENCY_OPTIONS}
                  value={form.layover_currency}
                  onChange={(nextValue) => {
                    onClearField("layover_currency");
                    setForm((current) => ({ ...current, layover_currency: (nextValue as "USD" | "MXN" | "CAD") ?? "USD" }));
                  }}
                  placeholder="Select currency"
                  error={ef("layover_currency")}
                />
                <FieldError id="layover_currency" message={ef("layover_currency")} />
              </div>
              <label className="md:col-span-2 flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={form.layover_first_night_free}
                  onChange={(event) => setForm((current) => ({ ...current, layover_first_night_free: event.target.checked }))}
                />
                First night included in detention rate (no layover charge)
              </label>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Max billable layover days" />
                <input
                  data-field="layover_max_days"
                  value={form.layover_max_days}
                  aria-describedby={ef("layover_max_days") ? "layover_max_days-error" : undefined}
                  onChange={(event) => {
                    onClearField("layover_max_days");
                    setForm((current) => ({ ...current, layover_max_days: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(ef("layover_max_days")), "rounded border px-2 py-2 text-sm")}
                  placeholder="No cap"
                />
                <FieldError id="layover_max_days" message={ef("layover_max_days")} />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <FieldLabel text="Layover notes" />
                <textarea
                  data-field="layover_notes"
                  value={form.layover_notes}
                  aria-describedby={ef("layover_notes") ? "layover_notes-error" : undefined}
                  onChange={(event) => {
                    onClearField("layover_notes");
                    setForm((current) => ({ ...current, layover_notes: event.target.value }));
                  }}
                  rows={2}
                  className={fieldErrorClassname(Boolean(ef("layover_notes")), "rounded border px-2 py-2 text-sm")}
                />
                <FieldError id="layover_notes" message={ef("layover_notes")} />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              Industry standard layover ranges $250-500/day. Most customers expect the first night included in detention rate.
            </div>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <FieldLabel text="Notes" />
            <textarea
              data-field="notes"
              value={form.notes}
              aria-describedby={ef("notes") ? "notes-error" : undefined}
              onChange={(event) => {
                onClearField("notes");
                setForm((current) => ({ ...current, notes: event.target.value }));
              }}
              rows={2}
              className={fieldErrorClassname(Boolean(ef("notes")), "rounded border px-2 py-2 text-sm")}
            />
            <FieldError id="notes" message={ef("notes")} />
          </div>
          <div className="md:col-span-2 mt-2 border-t border-gray-200 pt-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Factoring Configuration</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={form.factoring_eligible}
                  onChange={(event) => setForm((current) => ({ ...current, factoring_eligible: event.target.checked }))}
                />
                Factoring Eligible
              </label>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Factoring Company" />
                <Combobox
                  dataField="factoring_company_vendor_id"
                  options={[
                    { value: "", label: "(none)" },
                    ...factoringVendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
                  ]}
                  value={form.factoring_company_vendor_id}
                  onChange={(nextValue) => {
                    onClearField("factoring_company_vendor_id");
                    setForm((current) => ({ ...current, factoring_company_vendor_id: nextValue ?? "" }));
                  }}
                  placeholder="Select factoring vendor"
                  allowClear
                  error={ef("factoring_company_vendor_id")}
                  allowAddNew={
                    canOwnerExtendCatalogs
                      ? {
                          label: "Add vendor in catalog",
                          onAdd: (query) => setForm((current) => ({ ...current, factoring_notes: `${current.factoring_notes}\nRequested vendor: ${query}`.trim() })),
                        }
                      : undefined
                  }
                />
                <FieldError id="factoring_company_vendor_id" message={ef("factoring_company_vendor_id")} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Advance Rate Override (%)" />
                <input
                  data-field="factoring_advance_rate_override"
                  value={form.factoring_advance_rate_override}
                  placeholder="uses default"
                  aria-describedby={ef("factoring_advance_rate_override") ? "factoring_advance_rate_override-error" : undefined}
                  onChange={(event) => {
                    onClearField("factoring_advance_rate_override");
                    setForm((current) => ({ ...current, factoring_advance_rate_override: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(ef("factoring_advance_rate_override")), "rounded border px-2 py-2 text-sm")}
                />
                <FieldError id="factoring_advance_rate_override" message={ef("factoring_advance_rate_override")} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Reserve Override (%)" />
                <input
                  data-field="factoring_reserve_pct_override"
                  value={form.factoring_reserve_pct_override}
                  placeholder="uses default"
                  aria-describedby={ef("factoring_reserve_pct_override") ? "factoring_reserve_pct_override-error" : undefined}
                  onChange={(event) => {
                    onClearField("factoring_reserve_pct_override");
                    setForm((current) => ({ ...current, factoring_reserve_pct_override: event.target.value }));
                  }}
                  className={fieldErrorClassname(Boolean(ef("factoring_reserve_pct_override")), "rounded border px-2 py-2 text-sm")}
                />
                <FieldError id="factoring_reserve_pct_override" message={ef("factoring_reserve_pct_override")} />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Recourse Type" />
                <Combobox
                  dataField="factoring_recourse_type"
                  options={RECOURSE_TYPE_OPTIONS}
                  value={form.factoring_recourse_type}
                  onChange={(nextValue) => {
                    onClearField("factoring_recourse_type");
                    setForm((current) => ({ ...current, factoring_recourse_type: ((nextValue ?? "") as "" | "recourse" | "non_recourse") }));
                  }}
                  placeholder="Select recourse type"
                  error={ef("factoring_recourse_type")}
                />
                <FieldError id="factoring_recourse_type" message={ef("factoring_recourse_type")} />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <FieldLabel text="Factoring Notes" />
                <textarea
                  data-field="factoring_notes"
                  value={form.factoring_notes}
                  aria-describedby={ef("factoring_notes") ? "factoring_notes-error" : undefined}
                  onChange={(event) => {
                    onClearField("factoring_notes");
                    setForm((current) => ({ ...current, factoring_notes: event.target.value }));
                  }}
                  rows={2}
                  className={fieldErrorClassname(Boolean(ef("factoring_notes")), "rounded border px-2 py-2 text-sm")}
                />
                <FieldError id="factoring_notes" message={ef("factoring_notes")} />
              </div>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function CustomerFormFields({
  form,
  setForm,
}: {
  form: CustomerFormState;
  setForm: Dispatch<SetStateAction<CustomerFormState>>;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {([
          ["name", "Name"],
          ["customer_code", "Customer Code"],
          ["email", "Email"],
          ["phone", "Phone"],
          ["mc_number", "MC Number"],
          ["dot_number", "DOT Number"],
          ["credit_limit", "Credit Limit"],
        ] as Array<[keyof CustomerFormState, string]>).map(([key, label]) => (
          <div key={key} className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">{label}</label>
            <input
              value={form[key] ?? ""}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              className="rounded border border-gray-300 px-2 py-2 text-sm"
            />
          </div>
        ))}
      </div>

      <div className="rounded border border-gray-200 p-3">
        <div className="mb-2 text-xs font-semibold text-gray-700">Commercial Configuration</div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Customer Type</label>
            <Combobox
              options={EDIT_CUSTOMER_TYPE_OPTIONS}
              value={form.customer_type}
              onChange={(nextValue) => setForm((current) => ({ ...current, customer_type: nextValue ?? "" }))}
              placeholder="Not set"
              allowClear
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Status</label>
            <Combobox
              options={CUSTOMER_STATUS_OPTIONS}
              value={form.status}
              onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue ?? "active" }))}
              placeholder="Select status"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-600">Notes</label>
        <textarea
          value={form.notes ?? ""}
          onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
          rows={2}
          className="rounded border border-gray-300 px-2 py-2 text-sm"
        />
      </div>
    </>
  );
}
