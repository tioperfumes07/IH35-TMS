import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import { z } from "zod";
import { listUsStates } from "../api/catalogs";
import { ApiError } from "../api/client";
import { createCustomer, listCustomers, listPaymentTermOptions, listVendors, updateCustomer, type Customer, type VendorOption } from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox, type ComboboxOption } from "../components/Combobox";
import { DataTable } from "../components/DataTable";
import { Modal } from "../components/Modal";
import { ActionButton } from "../components/shared/ActionButton";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { useToast } from "../components/Toast";
import { FMCSAVerificationModal } from "../components/customers/FMCSAVerificationModal";
import { KpiCard } from "../components/layout/KpiCard";
import { KpiStrip } from "../components/layout/KpiStrip";
import { PageHeader } from "../components/layout/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";
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

const QUALITY_FILTER_OPTIONS: ComboboxOption[] = [
  { value: "all", label: "All quality flags" },
  { value: "preferred", label: "Preferred" },
  { value: "standard", label: "Standard" },
  { value: "caution", label: "Caution" },
  { value: "avoid", label: "Avoid" },
];

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
  const [createErrors, setCreateErrors] = useState<Partial<Record<keyof CreateCustomerFormState, string>>>({});
  const [qualityFilter, setQualityFilter] = useState<"all" | Customer["quality_overall_flag"]>("all");
  const [showOnlyFmcsaVerified, setShowOnlyFmcsaVerified] = useState(false);
  const [sortByDisputes, setSortByDisputes] = useState(false);
  const [fmcsaModalOpen, setFmcsaModalOpen] = useState(false);
  const showTaxId = user?.role === "Owner";

  const customersQuery = useQuery({
    queryKey: ["customers"],
    queryFn: () => listCustomers({ status: "active" }).then((result) => result.customers),
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
      setCreateErrors({});
      pushToast("Customer created", "success");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof updateCustomer>[1] }) => updateCustomer(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditOpen(false);
      setSelectedCustomer(null);
      pushToast("Customer updated", "success");
    },
  });

  const customers = useMemo(() => {
    const base = [...(customersQuery.data ?? [])];
    let filtered = qualityFilter === "all" ? base : base.filter((customer) => customer.quality_overall_flag === qualityFilter);
    if (showOnlyFmcsaVerified) {
      filtered = filtered.filter((customer) => Boolean(customer.fmcsa_verified_at));
    }
    if (sortByDisputes) {
      filtered = [...filtered].sort((a, b) => (b.quality_disputes_count ?? 0) - (a.quality_disputes_count ?? 0));
    }
    return filtered;
  }, [customersQuery.data, qualityFilter, showOnlyFmcsaVerified, sortByDisputes]);
  const activeCount = customers.filter((customer) => customer.status === "active").length;
  const creditHoldCount = customers.filter((customer) => customer.status === "credit_hold").length;
  const blacklistCount = customers.filter((customer) => customer.status === "blacklist").length;

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
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-semibold text-gray-600">Quality</label>
        <div className="w-full max-w-[240px]">
          <Combobox
            options={QUALITY_FILTER_OPTIONS}
            value={qualityFilter}
            onChange={(value) => setQualityFilter((value as "all" | Customer["quality_overall_flag"]) ?? "all")}
            allowClear
            placeholder="All quality flags"
          />
        </div>
        <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
          <input type="checkbox" checked={sortByDisputes} onChange={(event) => setSortByDisputes(event.target.checked)} />
          Sort by disputes
        </label>
        <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
          <input type="checkbox" checked={showOnlyFmcsaVerified} onChange={(event) => setShowOnlyFmcsaVerified(event.target.checked)} />
          Show only verified
        </label>
      </div>

      {customersQuery.isError ? <ListErrorBanner onRetry={() => void customersQuery.refetch()} /> : null}

      {customersQuery.isLoading ? (
        <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading customers...</div>
      ) : (
        <div className="space-y-3">
          <DataTable
            rows={customers}
            rowKey={(row) => row.id}
            onRowClick={(row) => navigate(`/customers/${row.id}`)}
            columns={[
              { key: "name", label: "Customer", render: (row) => row.name },
              { key: "customer_code", label: "Code", render: (row) => row.customer_code ?? "-" },
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
              { key: "contact", label: "Main Contact", render: (row) => row.main_contact_name ?? "-" },
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
          {customers.length === 0 ? <div className="rounded border border-gray-200 bg-white p-3 text-[13px] text-gray-500">No customers found.</div> : null}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Create Customer">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = createCustomerSchema.safeParse(createForm);
            if (!parsed.success) {
              const fieldErrors = parsed.error.flatten().fieldErrors;
              setCreateErrors({
                legal_name: fieldErrors.legal_name?.[0],
                customer_type: fieldErrors.customer_type?.[0],
                main_contact_email: fieldErrors.main_contact_email?.[0],
                ar_email: fieldErrors.ar_email?.[0],
                ap_email: fieldErrors.ap_email?.[0],
              });
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }
            setCreateErrors({});
            try {
              await createMutation.mutateAsync({
                name: parsed.data.legal_name,
                legal_name: parsed.data.legal_name,
                dba: parsed.data.dba || undefined,
                customer_code: parsed.data.code || undefined,
                code: parsed.data.code || undefined,
                website: parsed.data.website || undefined,
                office_phone: parsed.data.office_phone || undefined,
                fax_phone: parsed.data.fax_phone || undefined,
                mc_number: parsed.data.mc_number || undefined,
                dot_number: parsed.data.dot_number || undefined,
                tax_id: showTaxId ? parsed.data.tax_id || undefined : undefined,
                customer_type: parsed.data.customer_type === "direct" ? "direct_shipper" : "broker",
                status: parsed.data.status,
                credit_limit: parsed.data.credit_limit,
                credit_limit_source: parsed.data.credit_limit_source || undefined,
                payment_terms_id: parsed.data.payment_terms_id || undefined,
                main_contact_name: parsed.data.main_contact_name || undefined,
                main_contact_title: parsed.data.main_contact_title || undefined,
                main_contact_email: parsed.data.main_contact_email || undefined,
                main_contact_phone: parsed.data.main_contact_phone || undefined,
                main_contact_mobile: parsed.data.main_contact_mobile || undefined,
                ar_email: parsed.data.ar_email || undefined,
                ar_phone: parsed.data.ar_phone || undefined,
                ap_email: parsed.data.ap_email || undefined,
                ap_phone: parsed.data.ap_phone || undefined,
                billing_state: parsed.data.billing_state || undefined,
                free_time_pickup_minutes: parsed.data.free_time_pickup_minutes,
                free_time_delivery_minutes: parsed.data.free_time_delivery_minutes,
                detention_rate_per_hour: parsed.data.detention_rate_per_hour,
                layover_charge_per_day: typeof parsed.data.layover_charge_per_day === "number" ? parsed.data.layover_charge_per_day : undefined,
                layover_currency: parsed.data.layover_currency ?? "USD",
                layover_first_night_free: parsed.data.layover_first_night_free,
                layover_max_days: typeof parsed.data.layover_max_days === "number" ? parsed.data.layover_max_days : undefined,
                layover_notes: parsed.data.layover_notes || undefined,
                factoring_eligible: parsed.data.factoring_eligible,
                factoring_company_vendor_id: parsed.data.factoring_company_vendor_id || undefined,
                factoring_advance_rate_override:
                  typeof parsed.data.factoring_advance_rate_override === "number" ? parsed.data.factoring_advance_rate_override : undefined,
                factoring_reserve_pct_override:
                  typeof parsed.data.factoring_reserve_pct_override === "number" ? parsed.data.factoring_reserve_pct_override : undefined,
                factoring_recourse_type:
                  parsed.data.factoring_recourse_type === ""
                    ? undefined
                    : (parsed.data.factoring_recourse_type as "recourse" | "non_recourse"),
                factoring_notes: parsed.data.factoring_notes || undefined,
                notes: parsed.data.notes || undefined,
              });
            } catch (error) {
              if (error instanceof ApiError && error.status === 409) {
                pushToast("Customer conflict: code/name/MC/DOT already exists", "error");
                return;
              }
              pushToast("Failed to create customer", "error");
            }
          }}
        >
          <CreateCustomerFormFields
            form={createForm}
            setForm={setCreateForm}
            errors={createErrors}
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
  errors: Partial<Record<keyof CreateCustomerFormState, string>>;
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
  const ErrorText = ({ field }: { field: keyof CreateCustomerFormState }) =>
    errors[field] ? <div className="text-[11px] text-red-600">{errors[field]}</div> : null;
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
            <input value={form.legal_name} onChange={(event) => setForm((current) => ({ ...current, legal_name: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
            <ErrorText field="legal_name" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="DBA" />
            <input value={form.dba} onChange={(event) => setForm((current) => ({ ...current, dba: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Code" />
            <input value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Customer Type" required />
            <Combobox
              options={CREATE_CUSTOMER_TYPE_OPTIONS}
              value={form.customer_type}
              onChange={(nextValue) => setForm((current) => ({ ...current, customer_type: ((nextValue as "broker" | "direct") ?? "broker") }))}
              placeholder="Select customer type"
            />
            <ErrorText field="customer_type" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Status" />
            <Combobox
              options={CUSTOMER_STATUS_OPTIONS}
              value={form.status}
              onChange={(nextValue) => setForm((current) => ({ ...current, status: nextValue ?? "active" }))}
              placeholder="Select status"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="DOT Number" />
            <input value={form.dot_number} onChange={(event) => setForm((current) => ({ ...current, dot_number: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="MC Number" />
            <input value={form.mc_number} onChange={(event) => setForm((current) => ({ ...current, mc_number: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex items-end">
            <Button type="button" variant="secondary" onClick={onOpenFmcsaVerification}>
              Verify FMCSA Authority
            </Button>
          </div>
          {showTaxId ? (
            <div className="flex flex-col gap-1">
              <FieldLabel text="Tax ID" />
              <input value={form.tax_id} onChange={(event) => setForm((current) => ({ ...current, tax_id: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
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
              <input value={String(form[field] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [field]: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
            </div>
          ))}
          <div className="flex flex-col gap-1">
            <FieldLabel text="Main Contact Email" />
            <input value={form.main_contact_email} onChange={(event) => setForm((current) => ({ ...current, main_contact_email: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
            <ErrorText field="main_contact_email" />
          </div>
        </div>
      </details>

      <details className="rounded border border-gray-200 p-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-700">Billing, Detention & Factoring</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/R Email" />
            <input value={form.ar_email} onChange={(event) => setForm((current) => ({ ...current, ar_email: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
            <ErrorText field="ar_email" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/R Phone" />
            <input value={form.ar_phone} onChange={(event) => setForm((current) => ({ ...current, ar_phone: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/P Email" />
            <input value={form.ap_email} onChange={(event) => setForm((current) => ({ ...current, ap_email: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
            <ErrorText field="ap_email" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="A/P Phone" />
            <input value={form.ap_phone} onChange={(event) => setForm((current) => ({ ...current, ap_phone: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Billing State" />
            <Combobox
              options={usStates.map((state) => ({
                value: state.code,
                label: `${state.code} - ${state.name}`,
                sublabel: state.region,
              }))}
              value={form.billing_state || null}
              onChange={(nextValue) => setForm((current) => ({ ...current, billing_state: nextValue ?? "" }))}
              loading={usStatesLoading}
              disabled={usStatesError}
              placeholder="Select state"
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Credit Limit" />
            <input value={form.credit_limit} onChange={(event) => setForm((current) => ({ ...current, credit_limit: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Credit Limit Source" />
            <Combobox
              options={CREDIT_LIMIT_SOURCE_OPTIONS}
              value={form.credit_limit_source}
              onChange={(nextValue) =>
                setForm((current) => ({ ...current, credit_limit_source: ((nextValue ?? "") as "" | "factor" | "manual" | "rmis_future") }))
              }
              placeholder="Select credit limit source"
            />
            <div className="text-[11px] text-gray-500">
              If set by your factor (Faro/RTS), select Factor and let daily report sync update. Otherwise select Manual.
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Payment Terms" />
            <Combobox
              options={[
                { value: "", label: "Default" },
                ...paymentTermOptions.map((option) => ({
                  value: option.id,
                  label: `${option.terms_name} (${option.days_until_due} days)`,
                })),
              ]}
              value={form.payment_terms_id}
              onChange={(nextValue) => setForm((current) => ({ ...current, payment_terms_id: nextValue ?? "" }))}
              placeholder="Select payment terms"
              loading={paymentTermsLoading}
              allowAddNew={
                canOwnerExtendCatalogs
                  ? {
                      label: "Add payment terms in catalog",
                      onAdd: (query) => setForm((current) => ({ ...current, notes: `${current.notes}\nRequested payment terms: ${query}`.trim() })),
                    }
                  : undefined
              }
            />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Free Time Pickup (minutes)" />
            <input value={form.free_time_pickup_minutes} onChange={(event) => setForm((current) => ({ ...current, free_time_pickup_minutes: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Free Time Delivery (minutes)" />
            <input value={form.free_time_delivery_minutes} onChange={(event) => setForm((current) => ({ ...current, free_time_delivery_minutes: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <FieldLabel text="Detention Rate / Hour" />
            <input value={form.detention_rate_per_hour} onChange={(event) => setForm((current) => ({ ...current, detention_rate_per_hour: event.target.value }))} className="rounded border border-gray-300 px-2 py-2 text-sm" />
          </div>
          <div className="md:col-span-2 mt-2 rounded border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">Layover Charges</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <FieldLabel text="Layover Charge per Day ($)" />
                <input
                  value={form.layover_charge_per_day}
                  onChange={(event) => setForm((current) => ({ ...current, layover_charge_per_day: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                  placeholder="e.g. 300"
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Currency" />
                <Combobox
                  options={LAYOVER_CURRENCY_OPTIONS}
                  value={form.layover_currency}
                  onChange={(nextValue) => setForm((current) => ({ ...current, layover_currency: (nextValue as "USD" | "MXN" | "CAD") ?? "USD" }))}
                  placeholder="Select currency"
                />
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
                  value={form.layover_max_days}
                  onChange={(event) => setForm((current) => ({ ...current, layover_max_days: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                  placeholder="No cap"
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <FieldLabel text="Layover notes" />
                <textarea
                  value={form.layover_notes}
                  onChange={(event) => setForm((current) => ({ ...current, layover_notes: event.target.value }))}
                  rows={2}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                />
              </div>
            </div>
            <div className="mt-2 text-[11px] text-gray-500">
              Industry standard layover ranges $250-500/day. Most customers expect the first night included in detention rate.
            </div>
          </div>
          <div className="flex flex-col gap-1 md:col-span-2">
            <FieldLabel text="Notes" />
            <textarea value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} rows={2} className="rounded border border-gray-300 px-2 py-2 text-sm" />
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
                  options={[
                    { value: "", label: "(none)" },
                    ...factoringVendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
                  ]}
                  value={form.factoring_company_vendor_id}
                  onChange={(nextValue) => setForm((current) => ({ ...current, factoring_company_vendor_id: nextValue ?? "" }))}
                  placeholder="Select factoring vendor"
                  allowClear
                  allowAddNew={
                    canOwnerExtendCatalogs
                      ? {
                          label: "Add vendor in catalog",
                          onAdd: (query) => setForm((current) => ({ ...current, factoring_notes: `${current.factoring_notes}\nRequested vendor: ${query}`.trim() })),
                        }
                      : undefined
                  }
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Advance Rate Override (%)" />
                <input
                  value={form.factoring_advance_rate_override}
                  placeholder="uses default"
                  onChange={(event) => setForm((current) => ({ ...current, factoring_advance_rate_override: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Reserve Override (%)" />
                <input
                  value={form.factoring_reserve_pct_override}
                  placeholder="uses default"
                  onChange={(event) => setForm((current) => ({ ...current, factoring_reserve_pct_override: event.target.value }))}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <FieldLabel text="Recourse Type" />
                <Combobox
                  options={RECOURSE_TYPE_OPTIONS}
                  value={form.factoring_recourse_type}
                  onChange={(nextValue) =>
                    setForm((current) => ({ ...current, factoring_recourse_type: ((nextValue ?? "") as "" | "recourse" | "non_recourse") }))
                  }
                  placeholder="Select recourse type"
                />
              </div>
              <div className="flex flex-col gap-1 md:col-span-2">
                <FieldLabel text="Factoring Notes" />
                <textarea
                  value={form.factoring_notes}
                  onChange={(event) => setForm((current) => ({ ...current, factoring_notes: event.target.value }))}
                  rows={2}
                  className="rounded border border-gray-300 px-2 py-2 text-sm"
                />
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
