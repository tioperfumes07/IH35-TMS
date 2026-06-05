import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { z } from "zod";
import { listInvoices, type Invoice } from "../api/accounting";
import { listCustomerPayments, recordCustomerPayment, unapplyCustomerPayment, type CustomerPaymentListRow } from "../api/customers";
import { listUsStates } from "../api/catalogs";
import { ApiError, apiRequest } from "../api/client";
import { listFmcsaLookups } from "../api/fmcsa";
import {
  createCustomerLane,
  createCustomerQualityEvent,
  createCustomerContact,
  deactivateCustomerLane,
  deactivateCustomerContact,
  getCustomerBillingSummary,
  getCustomerDetail,
  getCustomerFinancialSummary,
  listCustomerLanes,
  listCustomerQualityEventReasons,
  listCustomerQualityEvents,
  listVendors,
  listCustomerContacts,
  reactivateCustomerContact,
  updateCustomerLane,
  updateCustomer,
  verifyCustomerFmcsa,
  updateCustomerContact,
  updateCustomerQualityEvent,
  voidCustomerQualityEvent,
  type Customer,
  type CustomerBillingSummary,
  type CustomerFinancialSummary,
  type CustomerLane,
  type CustomerContact,
  type CustomerContactDepartment,
  type CustomerQualityEvent,
} from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { Button } from "../components/Button";
import { Combobox } from "../components/Combobox";
import { CustomerEditModal, type CustomerEditFormValues } from "../components/customers/CustomerEditModal";
import { FMCSAVerificationModal } from "../components/customers/FMCSAVerificationModal";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Modal } from "../components/Modal";
import { CoiRequestsTab } from "./customers/tabs/CoiRequestsTab";
import { PortalUsersTab } from "./customers/components/PortalUsersTab";
import { parseApiErrorPayload } from "../components/forms/useFormValidation";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";
import { SecondaryNavTabs } from "../components/shared/SecondaryNavTabs";
import { useToast } from "../components/Toast";
import { DataPanel } from "../components/layout/DataPanel";
import { FlatFieldGrid } from "../components/layout/FlatFieldGrid";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { StatusBadge } from "../components/layout/StatusBadge";
import { SelectCombobox } from "../components/shared/SelectCombobox";
import { scrubQboArchiveProjectionNotes } from "../lib/qboArchiveNotes";
import { useCompanyContext } from "../contexts/CompanyContext";

const tabs = ["Profile", "Contacts", "Billing & Receivables", "Quality & History", "Lanes & Pricing", "Documents", "COI", "Contracts", "Portal Users"] as const;
type CustomerTab = (typeof tabs)[number];

function formatBillingSummaryError(error: unknown): string {
  if (error instanceof ApiError) {
    const parsed = parseApiErrorPayload(error.data);
    const formError = parsed.message;
    const fieldSummary = Object.entries(parsed.fieldErrors)
      .map(([key, val]) => `${key}: ${val}`)
      .join("; ");
    return [formError, fieldSummary].filter(Boolean).join(" — ") || error.message;
  }
  if (error instanceof Error) return error.message;
  return "Failed to load billing summary.";
}

const customerSchema = z.object({
  name: z.string().trim().min(1).max(200),
  customer_code: z.string().trim().max(100).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  dot_number: z.string().trim().max(50).optional(),
  mc_number: z.string().trim().max(50).optional(),
  tax_id: z.string().trim().max(50).optional(),
  billing_state: z.string().trim().max(8).optional(),
  status: z.enum(["active", "inactive", "credit_hold", "blacklist"]),
  customer_type: z.enum(["broker", "direct_shipper"]).optional().or(z.literal("")),
  billing_address: z.string().trim().max(500).optional(),
  website: z.string().trim().max(200).optional(),
  office_phone: z.string().trim().max(50).optional(),
  fax_phone: z.string().trim().max(50).optional(),
  main_contact_name: z.string().trim().max(120).optional(),
  main_contact_title: z.string().trim().max(120).optional(),
  main_contact_email: z.string().trim().email().optional().or(z.literal("")),
  main_contact_phone: z.string().trim().max(50).optional(),
  main_contact_mobile: z.string().trim().max(50).optional(),
  ar_email: z.string().trim().email().optional().or(z.literal("")),
  ar_phone: z.string().trim().max(50).optional(),
  ap_email: z.string().trim().email().optional().or(z.literal("")),
  ap_phone: z.string().trim().max(50).optional(),
  credit_limit: z.string().trim().optional(),
  credit_limit_source: z.enum(["", "factor", "manual", "rmis_future"]).default(""),
  credit_limit_updated_at: z.string().trim().optional(),
  quality_overall_flag: z.enum(["preferred", "standard", "caution", "avoid"]),
  quality_notes: z.string().trim().max(5000).optional(),
  free_time_pickup_minutes: z.string().trim(),
  free_time_delivery_minutes: z.string().trim(),
  detention_rate_per_hour: z.string().trim(),
  layover_charge_per_day: z.string().trim().optional(),
  layover_currency: z.enum(["", "USD", "MXN", "CAD"]).default("USD"),
  layover_first_night_free: z.enum(["true", "false"]).default("true"),
  layover_max_days: z.string().trim().optional(),
  layover_notes: z.string().trim().max(2000).optional(),
  factoring_eligible: z.enum(["true", "false"]),
  factoring_company_vendor_id: z.string().uuid().optional().or(z.literal("")),
  factoring_advance_rate_override: z.string().trim().optional(),
  factoring_reserve_pct_override: z.string().trim().optional(),
  factoring_recourse_type: z.enum(["", "recourse", "non_recourse"]).default(""),
  factoring_notes: z.string().trim().max(5000).optional(),
  notes: z.string().trim().max(5000).optional(),
});

const contactSchema = z.object({
  name: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional(),
  email: z.string().trim().email().optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional(),
  mobile: z.string().trim().max(50).optional(),
  department: z.enum(["sales", "billing", "dispatch", "operations", "owner", "other"]),
  is_primary: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional(),
});

const laneSchema = z.object({
  lane_label: z.string().trim().min(1).max(150),
  origin_city: z.string().trim().min(1).max(120),
  origin_state: z.string().trim().min(1).max(12),
  destination_city: z.string().trim().min(1).max(120),
  destination_state: z.string().trim().min(1).max(12),
  typical_miles: z.string().trim().optional(),
  base_rate_cents: z.string().trim().min(1),
  fsc_per_mile_cents: z.string().trim().optional(),
  notes: z.string().trim().max(2000).optional(),
});

function statusVariant(status: Customer["status"]): "crit" | "warn" | "neutral" | "positive" {
  if (status === "blacklist") return "crit";
  if (status === "credit_hold") return "warn";
  if (status === "inactive") return "neutral";
  return "positive";
}

function statusLabel(status: Customer["status"]) {
  if (status === "credit_hold") return "Credit Hold";
  if (status === "blacklist") return "Blacklist";
  if (status === "inactive") return "Inactive";
  return "Active";
}

function departmentVariant(department: CustomerContactDepartment): "crit" | "warn" | "info" | "positive" | "neutral" {
  if (department === "billing") return "positive";
  if (department === "dispatch") return "warn";
  if (department === "sales") return "info";
  if (department === "owner") return "crit";
  return "neutral";
}

function qualityFlagVariant(flag: Customer["quality_overall_flag"]): "positive" | "neutral" | "warn" | "crit" {
  if (flag === "preferred") return "positive";
  if (flag === "caution") return "warn";
  if (flag === "avoid") return "crit";
  return "neutral";
}

function qualityRatingFromScores(customer: Customer): "Good" | "Watch" | "Late-pay" {
  const numeric = Number(customer.quality_payment_score ?? "");
  if (Number.isFinite(numeric)) {
    if (numeric >= 90) return "Good";
    if (numeric >= 70) return "Watch";
    return "Late-pay";
  }
  if (customer.quality_overall_flag === "preferred") return "Good";
  if (customer.quality_overall_flag === "avoid") return "Late-pay";
  return "Watch";
}

function CustomerFinancialOverviewSection(props: {
  summary: CustomerFinancialSummary | undefined;
  loading: boolean;
  error: boolean;
}) {
  if (props.loading) return <div className="text-xs text-gray-500">Loading financial overview…</div>;
  if (props.error || !props.summary) return null;

  const chartData = props.summary.revenue_by_month.map((r) => ({
    month: r.month,
    revenue: r.total_cents / 100,
  }));

  const agingLabels: Record<string, string> = {
    current: "Current",
    "1_30": "1–30",
    "31_60": "31–60",
    "61_90": "61–90",
    "90_plus": "90+",
  };

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <DataPanel title="Revenue (last 12 months)">
        {chartData.length === 0 ? (
          <p className="text-xs text-gray-500">No invoice history.</p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip formatter={(v: number) => [`$${v.toFixed(0)}`, "Revenue"]} />
                <Bar dataKey="revenue" fill="#0f172a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DataPanel>
      <DataPanel title="AR aging (open invoices)">
        <div className="space-y-1 text-sm">
          {props.summary.ar_aging_buckets.length === 0 ? <p className="text-xs text-gray-500">No open AR.</p> : null}
          {props.summary.ar_aging_buckets.map((b) => (
            <div key={b.bucket} className="flex justify-between">
              <span>{agingLabels[b.bucket] ?? b.bucket}</span>
              <span>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(b.open_cents / 100)}</span>
            </div>
          ))}
        </div>
      </DataPanel>
      <DataPanel title="Recent loads">
        <div className="max-h-56 space-y-1 overflow-auto text-xs">
          {props.summary.recent_loads.map((l) => (
            <div key={l.id} className="flex justify-between gap-2 border-b border-gray-100 py-1">
              <span className="truncate">{l.load_number ?? l.id.slice(0, 8)}</span>
              <StatusBadge variant="neutral">{l.status ?? "—"}</StatusBadge>
              <span>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(l.rate_total_cents ?? 0) / 100)}</span>
            </div>
          ))}
          {props.summary.recent_loads.length === 0 ? <p className="text-gray-500">No loads.</p> : null}
        </div>
      </DataPanel>
      <DataPanel title="Documents">
        <div className="max-h-56 space-y-1 overflow-auto text-xs">
          {(props.summary.documents as Array<{ id?: string; filename?: string; category?: string }>).map((d, i) => (
            <div key={d.id ?? String(i)} className="flex justify-between gap-2 border-b border-gray-100 py-1">
              <span className="truncate">{d.filename ?? d.id ?? "File"}</span>
              <span className="text-gray-500">{d.category ?? ""}</span>
            </div>
          ))}
          {props.summary.documents.length === 0 ? <p className="text-gray-500">No documents linked.</p> : null}
        </div>
      </DataPanel>
    </div>
  );
}

function emptyContactForm() {
  return {
    name: "",
    title: "",
    email: "",
    phone: "",
    mobile: "",
    department: "other",
    is_primary: false,
    notes: "",
  };
}

function emptyLaneForm() {
  return {
    lane_label: "",
    origin_city: "",
    origin_state: "",
    destination_city: "",
    destination_state: "",
    typical_miles: "",
    base_rate_cents: "",
    fsc_per_mile_cents: "",
    notes: "",
  };
}

const usdFormatter = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function formatCurrencyCents(cents: number | null | undefined) {
  return usdFormatter.format((Number(cents ?? 0) || 0) / 100);
}

function formatDateShort(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US");
}

type SaferEntityStatus = {
  id: string;
  mc_number: string | null;
  dot_number: string | null;
  safer_verified_at: string | null;
  safer_status: "verified" | "unverified" | "not_found" | "lookup_failed" | "skipped" | null;
  safer_authority_status: "active" | "inactive" | "revoked" | "unknown" | null;
  safer_oos_status: "in_service" | "out_of_service" | "unknown" | null;
};

export function CustomerDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();

  const [activeTab, setActiveTab] = useState<CustomerTab>("Profile");
  useEffect(() => {
    if (searchParams.get("tab") === "billing") {
      setActiveTab("Billing & Receivables");
    }
  }, [searchParams]);
  const [editMode, setEditMode] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [contactForm, setContactForm] = useState(emptyContactForm());
  const [includeInactiveContacts, setIncludeInactiveContacts] = useState(false);
  const [laneModalOpen, setLaneModalOpen] = useState(false);
  const [editingLane, setEditingLane] = useState<CustomerLane | null>(null);
  const [laneForm, setLaneForm] = useState(emptyLaneForm());
  const [includeInactiveLanes, setIncludeInactiveLanes] = useState(false);
  const [statusConfirmOpen, setStatusConfirmOpen] = useState(false);
  const [statusReason, setStatusReason] = useState("");
  const [showVoidedQuality, setShowVoidedQuality] = useState(false);
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [voidingQualityEvent, setVoidingQualityEvent] = useState<CustomerQualityEvent | null>(null);
  const [fmcsaModalOpen, setFmcsaModalOpen] = useState(false);
  const [fmcsaHistoryOpen, setFmcsaHistoryOpen] = useState(false);
  const [qualityForm, setQualityForm] = useState({
    event_type: "late_payment" as CustomerQualityEvent["event_type"],
    event_date: new Date().toISOString().slice(0, 10),
    reason_id: "",
    severity: "info" as CustomerQualityEvent["severity"],
    summary: "",
    details: "",
    dollar_impact_amount: "",
    days_late: "",
  });
  const [voidReason, setVoidReason] = useState("");
  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("ach");
  const [payRef, setPayRef] = useState("");
  const [payMemo, setPayMemo] = useState("");
  const [payAutoApply, setPayAutoApply] = useState(true);
  const [payInvoiceInclude, setPayInvoiceInclude] = useState<Record<string, boolean>>({});
  const [payInvoiceAmount, setPayInvoiceAmount] = useState<Record<string, string>>({});

  const detailQuery = useQuery({
    queryKey: ["customer-detail", id, selectedCompanyId ?? "none"],
    queryFn: () => getCustomerDetail(id, selectedCompanyId).then((result) => result.customer),
    enabled: Boolean(id),
  });
  const operatingCompanyId = detailQuery.data?.operating_company_id ?? null;

  const contactsQuery = useQuery({
    queryKey: ["customer-contacts", id, includeInactiveContacts, operatingCompanyId],
    queryFn: () => listCustomerContacts(id, includeInactiveContacts, operatingCompanyId).then((result) => result.contacts),
    enabled: Boolean(id && operatingCompanyId),
  });
  const billingSummaryQuery = useQuery({
    queryKey: ["customer-billing-summary", id, operatingCompanyId],
    queryFn: () => getCustomerBillingSummary(id, operatingCompanyId!),
    enabled: Boolean(id && operatingCompanyId),
  });
  const financialSummaryQuery = useQuery({
    queryKey: ["customer-financial-summary", id, operatingCompanyId],
    queryFn: () => getCustomerFinancialSummary(id, operatingCompanyId!),
    enabled: Boolean(id && operatingCompanyId),
  });
  const lanesQuery = useQuery({
    queryKey: ["customer-lanes", id, operatingCompanyId, includeInactiveLanes],
    queryFn: () => listCustomerLanes(id, operatingCompanyId!, includeInactiveLanes).then((result) => result.lanes),
    enabled: Boolean(id && operatingCompanyId),
  });
  const recentInvoicesQuery = useQuery({
    queryKey: ["customer-recent-invoices", id, operatingCompanyId],
    queryFn: () =>
      listInvoices(operatingCompanyId!, { customer_id: id }).then((res) =>
        (res.invoices ?? []).slice(0, 10)
      ),
    enabled: Boolean(id && operatingCompanyId),
  });
  const paymentInvoicesQuery = useQuery({
    queryKey: ["customer-open-invoices-payment", id, operatingCompanyId],
    queryFn: () => listInvoices(operatingCompanyId!, { customer_id: id }).then((res) => res.invoices ?? []),
    enabled: Boolean(id && operatingCompanyId && activeTab === "Billing & Receivables"),
  });
  const customerPaymentsQuery = useQuery({
    queryKey: ["customer-payments", id],
    queryFn: () => listCustomerPayments(id, { limit: 50 }),
    enabled: Boolean(id && activeTab === "Billing & Receivables"),
    retry: false,
  });
  const vendorsQuery = useQuery({
    queryKey: ["vendors", "active", detailQuery.data?.operating_company_id ?? "none"],
    queryFn: () =>
      listVendors({ status: "active", operating_company_id: detailQuery.data?.operating_company_id ?? undefined }).then((result) => result.vendors),
    enabled: Boolean(detailQuery.data?.operating_company_id),
  });
  const usStatesQuery = useQuery({
    queryKey: ["catalogs", "us-states"],
    queryFn: () => listUsStates().then((result) => result.states),
  });
  const qualityEventsQuery = useQuery({
    queryKey: ["customer-quality-events", id, showVoidedQuality],
    queryFn: () => listCustomerQualityEvents(id, showVoidedQuality).then((result) => result.events),
    enabled: Boolean(id),
  });
  const qualityReasonsQuery = useQuery({
    queryKey: ["customer-quality-reasons", qualityForm.event_type],
    queryFn: () => listCustomerQualityEventReasons(qualityForm.event_type).then((result) => result.reasons),
    enabled: qualityModalOpen,
  });
  const fmcsaHistoryQuery = useQuery({
    queryKey: ["fmcsa-lookups", detailQuery.data?.operating_company_id ?? "none"],
    queryFn: () => listFmcsaLookups({ limit: 25 }).then((res) => res.lookups),
    enabled: fmcsaHistoryOpen,
  });
  const customer = detailQuery.data;
  const contacts = contactsQuery.data ?? customer?.contacts ?? [];
  const factoringVendors = useMemo(
    () =>
      (vendorsQuery.data ?? []).filter((vendor) => {
        const notes = (vendor.notes ?? "").toLowerCase();
        const name = vendor.name.toLowerCase();
        return vendor.vendor_type === "factoring_company" || notes.includes("factor") || name.includes("factor") || name.includes("faro") || name.includes("rts");
      }),
    [vendorsQuery.data]
  );
  const canManageContacts = ["Owner", "Administrator", "Manager"].includes(user?.role ?? "");
  const canViewInactiveContacts = ["Owner", "Administrator"].includes(user?.role ?? "");
  const canManageLanes = ["Owner", "Administrator", "Manager"].includes(user?.role ?? "");
  const canReadQuality = ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant", "Safety"].includes(user?.role ?? "");
  const canWriteQuality = user?.role === "Owner";
  const canEditQualityNotes = ["Owner", "Administrator", "Manager"].includes(user?.role ?? "");
  const canEditCreditLimit = user?.role === "Owner" || user?.role === "Administrator";
  const canViewDocuments = ["Owner", "Administrator", "Manager", "Dispatcher", "Accountant"].includes(user?.role ?? "");
  const canVerifyFmcsa = user?.role === "Owner" || user?.role === "Administrator";
  const canUnapplyCustomerPayment = user?.role === "Owner" || user?.role === "Administrator";

  const hydratedForm = useMemo(() => {
    if (!customer) return form;
    if (Object.keys(form).length > 0) return form;
    return {
      name: customer.name ?? "",
      customer_code: customer.customer_code ?? "",
      email: customer.email ?? "",
      phone: customer.phone ?? "",
      billing_address: customer.billing_address ?? "",
      billing_state: customer.billing_state ?? "",
      dot_number: customer.dot_number ?? "",
      mc_number: customer.mc_number ?? "",
      tax_id: customer.tax_id ?? "",
      status: customer.status,
      customer_type: customer.customer_type ?? "",
      website: customer.website ?? "",
      office_phone: customer.office_phone ?? "",
      fax_phone: customer.fax_phone ?? "",
      main_contact_name: customer.main_contact_name ?? "",
      main_contact_title: customer.main_contact_title ?? "",
      main_contact_email: customer.main_contact_email ?? "",
      main_contact_phone: customer.main_contact_phone ?? "",
      main_contact_mobile: customer.main_contact_mobile ?? "",
      ar_email: customer.ar_email ?? "",
      ar_phone: customer.ar_phone ?? "",
      ap_email: customer.ap_email ?? "",
      ap_phone: customer.ap_phone ?? "",
      credit_limit: customer.credit_limit ? String(customer.credit_limit) : "",
      credit_limit_source: customer.credit_limit_source ?? "",
      credit_limit_updated_at: customer.credit_limit_updated_at ?? "",
      quality_overall_flag: customer.quality_overall_flag ?? "standard",
      quality_notes: customer.quality_notes ?? "",
      free_time_pickup_minutes: String(customer.free_time_pickup_minutes ?? 120),
      free_time_delivery_minutes: String(customer.free_time_delivery_minutes ?? 120),
      detention_rate_per_hour: String(customer.detention_rate_per_hour ?? "0"),
      layover_charge_per_day: customer.layover_charge_per_day ? String(customer.layover_charge_per_day) : "",
      layover_currency: customer.layover_currency ?? "USD",
      layover_first_night_free: customer.layover_first_night_free ? "true" : "false",
      layover_max_days: customer.layover_max_days ? String(customer.layover_max_days) : "",
      layover_notes: customer.layover_notes ?? "",
      factoring_eligible: customer.factoring_eligible ? "true" : "false",
      factoring_company_vendor_id: customer.factoring_company_vendor_id ?? "",
      factoring_advance_rate_override: customer.factoring_advance_rate_override ? String(customer.factoring_advance_rate_override) : "",
      factoring_reserve_pct_override: customer.factoring_reserve_pct_override ? String(customer.factoring_reserve_pct_override) : "",
      factoring_recourse_type: customer.factoring_recourse_type ?? "",
      factoring_notes: customer.factoring_notes ?? "",
      notes: scrubQboArchiveProjectionNotes(customer.notes),
    };
  }, [customer, form]);

  const updateCustomerMutation = useMutation({
    mutationFn: (statusChangeReason?: string) =>
      updateCustomer(id, {
        operating_company_id: selectedCompanyId ?? operatingCompanyId ?? undefined,
        name: hydratedForm.name,
        customer_code: hydratedForm.customer_code || null,
        email: hydratedForm.email || null,
        phone: hydratedForm.phone || null,
        billing_address: hydratedForm.billing_address || null,
        billing_state: hydratedForm.billing_state || null,
        dot_number: hydratedForm.dot_number || null,
        mc_number: hydratedForm.mc_number || null,
        tax_id: hydratedForm.tax_id || null,
        customer_type: hydratedForm.customer_type ? (hydratedForm.customer_type as "broker" | "direct_shipper") : null,
        status: hydratedForm.status as Customer["status"],
        status_change_reason: statusChangeReason,
        website: hydratedForm.website || null,
        office_phone: hydratedForm.office_phone || null,
        fax_phone: hydratedForm.fax_phone || null,
        main_contact_name: hydratedForm.main_contact_name || null,
        main_contact_title: hydratedForm.main_contact_title || null,
        main_contact_email: hydratedForm.main_contact_email || null,
        main_contact_phone: hydratedForm.main_contact_phone || null,
        main_contact_mobile: hydratedForm.main_contact_mobile || null,
        ar_email: hydratedForm.ar_email || null,
        ar_phone: hydratedForm.ar_phone || null,
        ap_email: hydratedForm.ap_email || null,
        ap_phone: hydratedForm.ap_phone || null,
        credit_limit: hydratedForm.credit_limit ? Number(hydratedForm.credit_limit) : null,
        credit_limit_source: hydratedForm.credit_limit_source ? (hydratedForm.credit_limit_source as "factor" | "manual" | "rmis_future") : null,
        credit_limit_updated_at: hydratedForm.credit_limit_updated_at || null,
        quality_overall_flag: hydratedForm.quality_overall_flag as "preferred" | "standard" | "caution" | "avoid",
        quality_notes: hydratedForm.quality_notes || null,
        free_time_pickup_minutes: Number(hydratedForm.free_time_pickup_minutes || "0"),
        free_time_delivery_minutes: Number(hydratedForm.free_time_delivery_minutes || "0"),
        detention_rate_per_hour: Number(hydratedForm.detention_rate_per_hour || "0"),
        layover_charge_per_day: hydratedForm.layover_charge_per_day ? Number(hydratedForm.layover_charge_per_day) : null,
        layover_currency: hydratedForm.layover_currency ? (hydratedForm.layover_currency as "USD" | "MXN" | "CAD") : null,
        layover_first_night_free: hydratedForm.layover_first_night_free === "true",
        layover_max_days: hydratedForm.layover_max_days ? Number(hydratedForm.layover_max_days) : null,
        layover_notes: hydratedForm.layover_notes || null,
        factoring_eligible: hydratedForm.factoring_eligible === "true",
        factoring_company_vendor_id: hydratedForm.factoring_company_vendor_id || null,
        factoring_advance_rate_override: hydratedForm.factoring_advance_rate_override ? Number(hydratedForm.factoring_advance_rate_override) : null,
        factoring_reserve_pct_override: hydratedForm.factoring_reserve_pct_override ? Number(hydratedForm.factoring_reserve_pct_override) : null,
        factoring_recourse_type: hydratedForm.factoring_recourse_type ? (hydratedForm.factoring_recourse_type as "recourse" | "non_recourse") : null,
        factoring_notes: hydratedForm.factoring_notes || null,
        notes: hydratedForm.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setEditMode(false);
      setStatusConfirmOpen(false);
      setStatusReason("");
      pushToast("Customer updated", "success");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        pushToast("Customer conflict detected", "error");
        return;
      }
      pushToast("Failed to update customer", "error");
    },
  });

  const verifyFmcsaMutation = useMutation({
    mutationFn: () => verifyCustomerFmcsa(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      pushToast("FMCSA verification refreshed", "success");
    },
    onError: () => {
      pushToast("FMCSA verification failed", "error");
    },
  });
  const saferStatusQuery = useQuery({
    queryKey: ["fmcsa-safer-status", "customer", id, operatingCompanyId ?? "none"],
    queryFn: () => {
      const q = new URLSearchParams({
        entity_type: "customer",
        entity_id: id,
        operating_company_id: operatingCompanyId ?? "",
      });
      return apiRequest<{ entity_type: "customer"; entity: SaferEntityStatus }>(
        `/api/v1/compliance/fmcsa-safer/status?${q.toString()}`
      );
    },
    enabled: Boolean(id && operatingCompanyId),
    retry: false,
  });
  const saferEntity = saferStatusQuery.data?.entity ?? null;

  const verifySaferMutation = useMutation({
    mutationFn: () =>
      apiRequest("/api/v1/compliance/fmcsa-safer/verify-now", {
        method: "POST",
        body: {
          entity_type: "customer",
          entity_id: id,
          force: true,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fmcsa-safer-status", "customer", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      pushToast("SAFER verification refreshed", "success");
    },
    onError: () => pushToast("SAFER verification failed", "error"),
  });

  const createContactMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCustomerContact>[1]) => createCustomerContact(id, payload, operatingCompanyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      setContactModalOpen(false);
      setEditingContact(null);
      setContactForm(emptyContactForm());
      pushToast("Contact added", "success");
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ contactId, payload }: { contactId: string; payload: Parameters<typeof updateCustomerContact>[2] }) =>
      updateCustomerContact(id, contactId, payload, operatingCompanyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      setContactModalOpen(false);
      setEditingContact(null);
      pushToast("Contact updated", "success");
    },
  });

  const deactivateContactMutation = useMutation({
    mutationFn: (contactId: string) => deactivateCustomerContact(id, contactId, operatingCompanyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      pushToast("Contact deactivated", "info");
    },
  });

  const reactivateContactMutation = useMutation({
    mutationFn: (contactId: string) => reactivateCustomerContact(id, contactId, operatingCompanyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contacts", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      pushToast("Contact reactivated", "success");
    },
  });

  const createQualityEventMutation = useMutation({
    mutationFn: () =>
      createCustomerQualityEvent(id, {
        event_type: qualityForm.event_type,
        event_date: qualityForm.event_date,
        reason_id: qualityForm.reason_id || undefined,
        severity: qualityForm.severity,
        summary: qualityForm.summary,
        details: qualityForm.details || undefined,
        dollar_impact_amount: qualityForm.dollar_impact_amount ? Number(qualityForm.dollar_impact_amount) : undefined,
        days_late: qualityForm.days_late ? Number(qualityForm.days_late) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-quality-events", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setQualityModalOpen(false);
      setQualityForm({
        event_type: "late_payment",
        event_date: new Date().toISOString().slice(0, 10),
        reason_id: "",
        severity: "info",
        summary: "",
        details: "",
        dollar_impact_amount: "",
        days_late: "",
      });
      pushToast("Quality event created", "success");
    },
    onError: () => pushToast("Failed to create quality event", "error"),
  });

  const voidQualityEventMutation = useMutation({
    mutationFn: ({ eventId, reason }: { eventId: string; reason: string }) => voidCustomerQualityEvent(id, eventId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-quality-events", id] });
      queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      setVoidingQualityEvent(null);
      setVoidReason("");
      pushToast("Quality event voided", "info");
    },
  });

  const updateQualityEventMutation = useMutation({
    mutationFn: ({ eventId, details }: { eventId: string; details: string }) => updateCustomerQualityEvent(id, eventId, { details }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-quality-events", id] });
      pushToast("Quality event updated", "success");
    },
  });

  const createLaneMutation = useMutation({
    mutationFn: (payload: Parameters<typeof createCustomerLane>[2]) => createCustomerLane(id, operatingCompanyId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-lanes", id] });
      setLaneModalOpen(false);
      setEditingLane(null);
      setLaneForm(emptyLaneForm());
      pushToast("Lane created", "success");
    },
  });

  const updateLaneMutation = useMutation({
    mutationFn: ({ laneId, payload }: { laneId: string; payload: Parameters<typeof updateCustomerLane>[3] }) =>
      updateCustomerLane(id, laneId, operatingCompanyId!, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-lanes", id] });
      setLaneModalOpen(false);
      setEditingLane(null);
      setLaneForm(emptyLaneForm());
      pushToast("Lane updated", "success");
    },
  });

  const deactivateLaneMutation = useMutation({
    mutationFn: (laneId: string) => deactivateCustomerLane(id, laneId, operatingCompanyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-lanes", id] });
      pushToast("Lane deactivated", "info");
    },
  });

  const openInvoicesForPayment = useMemo(
    () =>
      (paymentInvoicesQuery.data ?? [])
        .filter((inv: Invoice) => inv.status !== "void" && inv.status !== "paid" && Number(inv.amount_open_cents ?? 0) > 0)
        .sort((a: Invoice, b: Invoice) => a.issue_date.localeCompare(b.issue_date)),
    [paymentInvoicesQuery.data]
  );

  const paymentCents = Math.round(Number(payAmount) * 100) || 0;

  const paymentApplicationBreakdown = useMemo(() => {
    if (payAutoApply) {
      let remaining = paymentCents;
      const apps: Array<{ invoice_id: string; amount_cents: number }> = [];
      for (const inv of openInvoicesForPayment) {
        if (remaining <= 0) break;
        const open = Number(inv.amount_open_cents ?? 0);
        const apply = Math.min(open, remaining);
        if (apply > 0) {
          apps.push({ invoice_id: inv.id, amount_cents: apply });
          remaining -= apply;
        }
      }
      const appliedSum = paymentCents - remaining;
      return { applications: apps, appliedSum, creditBalanceCents: remaining };
    }
    let total = 0;
    const apps: Array<{ invoice_id: string; amount_cents: number }> = [];
    for (const inv of openInvoicesForPayment) {
      if (!payInvoiceInclude[inv.id]) continue;
      const cents = Math.round(Number(payInvoiceAmount[inv.id] || 0) * 100);
      if (cents > 0) {
        apps.push({ invoice_id: inv.id, amount_cents: cents });
        total += cents;
      }
    }
    return { applications: apps, appliedSum: total, creditBalanceCents: Math.max(0, paymentCents - total) };
  }, [payAutoApply, paymentCents, openInvoicesForPayment, payInvoiceInclude, payInvoiceAmount]);

  const payManualInvalid = !payAutoApply && paymentApplicationBreakdown.appliedSum > paymentCents;

  const paymentsBackendPending =
    customerPaymentsQuery.isError &&
    customerPaymentsQuery.error instanceof ApiError &&
    (customerPaymentsQuery.error.status === 404 ||
      customerPaymentsQuery.error.status === 500 ||
      customerPaymentsQuery.error.status === 501);

  const recordCustomerPaymentMutation = useMutation({
    mutationFn: () =>
      recordCustomerPayment(id, {
        date: payDate,
        amount_cents: paymentCents,
        method: payMethod,
        reference: payRef.trim() || undefined,
        memo: payMemo.trim() || undefined,
        applications: paymentApplicationBreakdown.applications,
        remaining_to_credit_balance_cents: paymentApplicationBreakdown.creditBalanceCents,
      }),
    onSuccess: () => {
      const n = paymentApplicationBreakdown.applications.length;
      pushToast(`Payment of ${formatCurrencyCents(paymentCents)} recorded, applied to ${n} invoice(s)`, "success");
      void queryClient.invalidateQueries({ queryKey: ["customer-recent-invoices", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-open-invoices-payment", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-billing-summary", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-payments", id] });
      setRecordPaymentOpen(false);
      setPayAmount("");
      setPayRef("");
      setPayMemo("");
      setPayDate(new Date().toISOString().slice(0, 10));
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const unapplyCustomerPaymentMutation = useMutation({
    mutationFn: (paymentId: string) => unapplyCustomerPayment(id, paymentId),
    onSuccess: () => {
      pushToast("Payment unapplied", "success");
      void queryClient.invalidateQueries({ queryKey: ["customer-payments", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-recent-invoices", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-open-invoices-payment", id] });
      void queryClient.invalidateQueries({ queryKey: ["customer-billing-summary", id] });
    },
    onError: (e) => pushToast(String((e as Error).message ?? "Failed"), "error"),
  });

  const qualityEvents = qualityEventsQuery.data ?? [];
  const billingSummary = billingSummaryQuery.data as CustomerBillingSummary | undefined;
  const customerLanes = lanesQuery.data ?? [];
  const recentInvoices = recentInvoicesQuery.data ?? [];
  const aging = billingSummary?.aging_buckets;
  const hasOpenInvoices = (aging?.total_open ?? 0) > 0;
  const qualityStats = useMemo(() => {
    const active = qualityEvents.filter((event) => !event.voided_at);
    const severeCount = active.filter((event) => event.severity === "severe").length;
    const totalImpact = active.reduce((sum, event) => sum + Number(event.dollar_impact_amount ?? 0), 0);
    const lateEvents = active.filter((event) => event.event_type === "late_payment" && typeof event.days_late === "number");
    const avgDaysLate = lateEvents.length > 0 ? lateEvents.reduce((sum, event) => sum + Number(event.days_late ?? 0), 0) / lateEvents.length : 0;
    return { totalEvents: active.length, severeCount, totalImpact, avgDaysLate };
  }, [qualityEvents]);
  const visibleTabs = useMemo(
    () => tabs.filter((tab) => (tab === "Quality & History" ? canReadQuality : tab === "Documents" ? canViewDocuments : true)),
    [canReadQuality, canViewDocuments]
  );

  if (detailQuery.isLoading) return <div className="text-sm text-gray-500">Loading customer...</div>;
  if (!customer) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Customer not found.</div>
        <Button variant="secondary" onClick={() => navigate("/customers")}>
          Back to Customers
        </Button>
      </div>
    );
  }

  async function saveCustomer() {
    if (!customer) return;
    const parsed = customerSchema.safeParse(hydratedForm);
    if (!parsed.success) {
      pushToast(parsed.error.issues[0]?.message ?? "Please correct the form", "error");
      return;
    }
    const statusChanged = parsed.data.status !== customer.status;
    const requiresReason = statusChanged && (parsed.data.status === "credit_hold" || parsed.data.status === "blacklist");
    if (requiresReason) {
      setStatusConfirmOpen(true);
      return;
    }
    await updateCustomerMutation.mutateAsync(undefined);
  }

  const primaryContact = contacts.find((contact) => contact.is_primary && contact.deactivated_at === null);

  return (
    <div className="space-y-3">
      <PageHeader
        title={customer.name}
        backHref="/customers"
        breadcrumb={[
          { label: "Customers", href: "/customers" },
          { label: customer.name },
        ]}
        subtitle={customer.customer_code ?? "No code"}
        actions={
          !editMode ? (
            <Button onClick={() => setEditModalOpen(true)}>Edit</Button>
          ) : (
            <Button onClick={() => void saveCustomer()} loading={updateCustomerMutation.isPending}>
              Save
            </Button>
          )
        }
      />

      <div className="flex items-center gap-2">
        <StatusBadge variant={statusVariant(customer.status)}>{statusLabel(customer.status)}</StatusBadge>
        {customer.fmcsa_verified_at ? (
          <button type="button" onClick={() => setFmcsaHistoryOpen(true)}>
            <StatusBadge variant="positive">{`FMCSA Verified ${new Date(customer.fmcsa_verified_at).toLocaleDateString()}`}</StatusBadge>
          </button>
        ) : null}
        <Button size="sm" variant="secondary" onClick={() => setFmcsaModalOpen(true)}>
          Verify FMCSA Authority
        </Button>
        {canVerifyFmcsa ? (
          <Button size="sm" variant="secondary" onClick={() => verifyFmcsaMutation.mutate()} loading={verifyFmcsaMutation.isPending}>
            Verify FMCSA
          </Button>
        ) : null}
        {customer.fmcsa_last_checked_at ? <span className="text-xs text-gray-500">{`Last checked ${new Date(customer.fmcsa_last_checked_at).toLocaleString()}`}</span> : null}
        {saferEntity?.safer_verified_at ? (
          <StatusBadge variant="positive">
            {`SAFER ${saferEntity.safer_authority_status ?? "unknown"} · ${new Date(saferEntity.safer_verified_at).toLocaleDateString()}`}
          </StatusBadge>
        ) : saferEntity?.safer_status ? (
          <StatusBadge variant={saferEntity.safer_status === "verified" ? "positive" : "warn"}>
            {`SAFER ${saferEntity.safer_status}`}
          </StatusBadge>
        ) : null}
        {canVerifyFmcsa ? (
          <Button size="sm" variant="secondary" onClick={() => verifySaferMutation.mutate()} loading={verifySaferMutation.isPending}>
            Verify SAFER
          </Button>
        ) : null}
      </div>

      <CustomerFinancialOverviewSection summary={financialSummaryQuery.data} loading={financialSummaryQuery.isLoading} error={financialSummaryQuery.isError} />

      <SecondaryNavTabs
        tabs={visibleTabs.map((tab) => ({ id: tab, label: tab }))}
        activeId={activeTab}
        onChange={(nextTab) => setActiveTab(nextTab as CustomerTab)}
      />

      {activeTab === "Profile" ? (
        <div className="grid gap-3 lg:grid-cols-2">
          <DataPanel title="Identity">
            <Field label="Name" value={hydratedForm.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} disabled={!editMode} />
            <Field label="Code" value={hydratedForm.customer_code} onChange={(value) => setForm((current) => ({ ...current, customer_code: value }))} disabled={!editMode} />
            <Field label="DOT Number" value={hydratedForm.dot_number} onChange={(value) => setForm((current) => ({ ...current, dot_number: value }))} disabled={!editMode} />
            <Field label="MC Number" value={hydratedForm.mc_number} onChange={(value) => setForm((current) => ({ ...current, mc_number: value }))} disabled={!editMode} />
            {canVerifyFmcsa ? (
              <div className="mb-2">
                <Button size="sm" variant="secondary" onClick={() => verifyFmcsaMutation.mutate()} loading={verifyFmcsaMutation.isPending}>
                  Verify FMCSA
                </Button>
              </div>
            ) : null}
            <Field label="Tax ID (EIN)" value={hydratedForm.tax_id} onChange={(value) => setForm((current) => ({ ...current, tax_id: value }))} disabled={!editMode} />
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Billing State</label>
              <Combobox
                options={(usStatesQuery.data ?? []).map((state) => ({
                  value: state.code,
                  label: `${state.code} - ${state.name}`,
                  sublabel: state.region,
                }))}
                value={hydratedForm.billing_state || null}
                onChange={(nextValue) => setForm((current) => ({ ...current, billing_state: nextValue ?? "" }))}
                loading={usStatesQuery.isLoading}
                disabled={!editMode || usStatesQuery.isError}
                placeholder="Select state"
              />
            </div>
          </DataPanel>

          <DataPanel title="Main Contact">
            <Field label="Name" value={hydratedForm.main_contact_name} onChange={(value) => setForm((current) => ({ ...current, main_contact_name: value }))} disabled={!editMode} />
            <Field label="Title" value={hydratedForm.main_contact_title} onChange={(value) => setForm((current) => ({ ...current, main_contact_title: value }))} disabled={!editMode} />
            <Field label="Email" value={hydratedForm.main_contact_email} onChange={(value) => setForm((current) => ({ ...current, main_contact_email: value }))} disabled={!editMode} />
            <Field label="Phone" value={hydratedForm.main_contact_phone} onChange={(value) => setForm((current) => ({ ...current, main_contact_phone: value }))} disabled={!editMode} />
            <Field label="Mobile" value={hydratedForm.main_contact_mobile} onChange={(value) => setForm((current) => ({ ...current, main_contact_mobile: value }))} disabled={!editMode} />
          </DataPanel>

          <DataPanel title="Billing Endpoints">
            <Field label="A/R Email" value={hydratedForm.ar_email} onChange={(value) => setForm((current) => ({ ...current, ar_email: value }))} disabled={!editMode} />
            <Field label="A/R Phone" value={hydratedForm.ar_phone} onChange={(value) => setForm((current) => ({ ...current, ar_phone: value }))} disabled={!editMode} />
            <Field label="A/P Email" value={hydratedForm.ap_email} onChange={(value) => setForm((current) => ({ ...current, ap_email: value }))} disabled={!editMode} />
            <Field label="A/P Phone" value={hydratedForm.ap_phone} onChange={(value) => setForm((current) => ({ ...current, ap_phone: value }))} disabled={!editMode} />
          </DataPanel>

          <DataPanel title="Credit Limit">
            <Field
              label="Credit Limit (USD)"
              value={hydratedForm.credit_limit}
              onChange={(value) => setForm((current) => ({ ...current, credit_limit: value }))}
              disabled={
                !editMode ||
                !canEditCreditLimit ||
                (hydratedForm.credit_limit_source === "factor" && user?.role !== "Owner")
              }
              type="number"
            />
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Credit Limit Source</label>
              <Combobox
                options={[
                  { value: "factor", label: "Factor" },
                  { value: "manual", label: "Manual" },
                  { value: "rmis_future", label: "RMIS Future" },
                ]}
                value={hydratedForm.credit_limit_source || null}
                onChange={(nextValue) => setForm((current) => ({ ...current, credit_limit_source: nextValue ?? "" }))}
                disabled={!editMode || !canEditCreditLimit}
                placeholder="Select source"
              />
            </div>
            <Field
              label="Last Updated"
              value={hydratedForm.credit_limit_updated_at ? new Date(hydratedForm.credit_limit_updated_at).toLocaleString() : "Not set"}
              onChange={() => {}}
              disabled
            />
            <p className="text-[11px] text-gray-500">
              If set by your factor (Faro/RTS), select Factor and let daily report sync update. Otherwise select Manual.
            </p>
          </DataPanel>

          <DataPanel title="Detention Configuration">
            <Field
              label="Free Time Pickup (min)"
              value={hydratedForm.free_time_pickup_minutes}
              onChange={(value) => setForm((current) => ({ ...current, free_time_pickup_minutes: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Free Time Delivery (min)"
              value={hydratedForm.free_time_delivery_minutes}
              onChange={(value) => setForm((current) => ({ ...current, free_time_delivery_minutes: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Detention Rate ($/hr)"
              value={hydratedForm.detention_rate_per_hour}
              onChange={(value) => setForm((current) => ({ ...current, detention_rate_per_hour: value }))}
              disabled={!editMode}
              type="number"
            />
          </DataPanel>

          <DataPanel title="Layover Charges">
            {editMode ? (
              <>
                <Field
                  label="Layover Charge per Day ($)"
                  value={hydratedForm.layover_charge_per_day}
                  onChange={(value) => setForm((current) => ({ ...current, layover_charge_per_day: value }))}
                  type="number"
                />
                <SelectField
                  label="Currency"
                  value={hydratedForm.layover_currency}
                  onChange={(value) => setForm((current) => ({ ...current, layover_currency: value }))}
                  options={[
                    { value: "USD", label: "USD" },
                    { value: "MXN", label: "MXN" },
                    { value: "CAD", label: "CAD" },
                  ]}
                />
                <div className="mb-2 flex items-center gap-2">
                  <input
                    id="layover-first-night-free"
                    type="checkbox"
                    checked={hydratedForm.layover_first_night_free === "true"}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        layover_first_night_free: event.target.checked ? "true" : "false",
                      }))
                    }
                  />
                  <label htmlFor="layover-first-night-free" className="text-xs font-semibold text-gray-600">
                    First night included in detention rate (no layover charge)
                  </label>
                </div>
                <Field
                  label="Max billable layover days"
                  value={hydratedForm.layover_max_days}
                  onChange={(value) => setForm((current) => ({ ...current, layover_max_days: value }))}
                  type="number"
                />
                <div className="mb-2 flex flex-col gap-1">
                  <label className="text-xs font-semibold text-gray-600">Layover notes</label>
                  <textarea
                    value={hydratedForm.layover_notes}
                    onChange={(event) => setForm((current) => ({ ...current, layover_notes: event.target.value }))}
                    rows={3}
                    className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
                  />
                </div>
              </>
            ) : (
              <>
                <DataPanelRow>
                  <span className="text-xs font-semibold text-gray-600">Layover Charge per Day</span>
                  <span className="text-[13px] text-gray-900">
                    {customer.layover_charge_per_day ? `${customer.layover_currency ?? "USD"} ${Number(customer.layover_charge_per_day).toFixed(2)}` : "Not set"}
                  </span>
                </DataPanelRow>
                <DataPanelRow>
                  <span className="text-xs font-semibold text-gray-600">First Night Included</span>
                  <span className="text-[13px] text-gray-900">{customer.layover_first_night_free ? "Yes" : "No"}</span>
                </DataPanelRow>
                <DataPanelRow>
                  <span className="text-xs font-semibold text-gray-600">Max Billable Days</span>
                  <span className="text-[13px] text-gray-900">{customer.layover_max_days ?? "No cap"}</span>
                </DataPanelRow>
                <DataPanelRow>
                  <span className="text-xs font-semibold text-gray-600">Layover Notes</span>
                  <span className="text-[13px] text-gray-900">{customer.layover_notes || "-"}</span>
                </DataPanelRow>
              </>
            )}
            <p className="text-[11px] text-gray-500">
              Industry standard layover ranges $250-500/day. Most customers expect the first night included in detention rate.
            </p>
          </DataPanel>

          <DataPanel title="Factoring Configuration">
            <div className="mb-2 flex items-center gap-2">
              <input
                id="factoring-eligible"
                type="checkbox"
                checked={hydratedForm.factoring_eligible === "true"}
                onChange={(event) => setForm((current) => ({ ...current, factoring_eligible: event.target.checked ? "true" : "false" }))}
                disabled={!editMode}
              />
              <label htmlFor="factoring-eligible" className="text-xs font-semibold text-gray-600">
                Factoring eligible
              </label>
            </div>
            <SelectField
              label="Factoring Company"
              value={hydratedForm.factoring_company_vendor_id}
              onChange={(value) => setForm((current) => ({ ...current, factoring_company_vendor_id: value }))}
              disabled={!editMode}
              options={[
                { value: "", label: "(none)" },
                ...factoringVendors.map((vendor) => ({ value: vendor.id, label: vendor.name })),
              ]}
            />
            <Field
              label="Advance Rate Override (%)"
              value={hydratedForm.factoring_advance_rate_override}
              onChange={(value) => setForm((current) => ({ ...current, factoring_advance_rate_override: value }))}
              disabled={!editMode}
              type="number"
            />
            <Field
              label="Reserve Override (%)"
              value={hydratedForm.factoring_reserve_pct_override}
              onChange={(value) => setForm((current) => ({ ...current, factoring_reserve_pct_override: value }))}
              disabled={!editMode}
              type="number"
            />
            <SelectField
              label="Recourse Type"
              value={hydratedForm.factoring_recourse_type}
              onChange={(value) => setForm((current) => ({ ...current, factoring_recourse_type: value }))}
              disabled={!editMode}
              options={[
                { value: "", label: "Use default" },
                { value: "recourse", label: "Recourse" },
                { value: "non_recourse", label: "Non-recourse" },
              ]}
            />
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Factoring Notes</label>
              <textarea
                value={hydratedForm.factoring_notes}
                onChange={(event) => setForm((current) => ({ ...current, factoring_notes: event.target.value }))}
                disabled={!editMode}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
              />
            </div>
          </DataPanel>

          <DataPanel title="Notes">
            <div className="mb-2 flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">General Notes</label>
              <textarea
                value={hydratedForm.notes}
                onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
                disabled={!editMode}
                rows={4}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
              />
            </div>
          </DataPanel>

          <div className="lg:col-span-2">
            <DataPanel title={`Contacts (${contacts.length})`}>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs text-gray-600">Operational contacts and communication owners</div>
                <div className="flex items-center gap-2">
                  {canViewInactiveContacts ? (
                    <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                      <input type="checkbox" checked={includeInactiveContacts} onChange={(event) => setIncludeInactiveContacts(event.target.checked)} />
                      Show inactive
                    </label>
                  ) : null}
                  {canManageContacts ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        setEditingContact(null);
                        setContactForm(emptyContactForm());
                        setContactModalOpen(true);
                      }}
                    >
                      + Create Contact
                    </Button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                {contacts.map((contact) => (
                  <DataPanelRow key={contact.id}>
                    <div className="flex items-center gap-2 py-1">
                      {contact.is_primary ? <span className="text-xs">⭐</span> : null}
                      <span className="text-[13px] font-semibold text-gray-900">{contact.name}</span>
                      {contact.title ? <span className="text-[11px] text-gray-500">{contact.title}</span> : null}
                      <StatusBadge variant={departmentVariant(contact.department)}>{contact.department}</StatusBadge>
                      {contact.deactivated_at ? <StatusBadge variant="neutral">inactive</StatusBadge> : null}
                    </div>
                    <div className="flex items-center gap-1 py-1">
                      {canManageContacts ? (
                        !contact.deactivated_at ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingContact(contact);
                                setContactForm({
                                  name: contact.name,
                                  title: contact.title ?? "",
                                  email: contact.email ?? "",
                                  phone: contact.phone ?? "",
                                  mobile: contact.mobile ?? "",
                                  department: contact.department,
                                  is_primary: contact.is_primary,
                                  notes: contact.notes ?? "",
                                });
                                setContactModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => deactivateContactMutation.mutate(contact.id)}>
                              Deactivate
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => reactivateContactMutation.mutate(contact.id)}>
                            Reactivate
                          </Button>
                        )
                      ) : null}
                    </div>
                  </DataPanelRow>
                ))}
              </div>
            </DataPanel>
          </div>
        </div>
      ) : null}

      {activeTab === "Quality & History" ? (
        <div className="space-y-3">
          <DataPanel title="Quality Overview">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <StatusBadge variant={qualityFlagVariant((hydratedForm.quality_overall_flag as Customer["quality_overall_flag"]) ?? customer.quality_overall_flag)}>
                  {(hydratedForm.quality_overall_flag || customer.quality_overall_flag).toUpperCase()}
                </StatusBadge>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    qualityRatingFromScores(customer) === "Good"
                      ? "bg-emerald-100 text-emerald-800"
                      : qualityRatingFromScores(customer) === "Late-pay"
                        ? "bg-red-100 text-red-800"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {qualityRatingFromScores(customer)}
                </span>
              </div>
              {canWriteQuality && editMode ? (
                <SelectField
                  label="Overall Flag"
                  value={hydratedForm.quality_overall_flag}
                  onChange={(value) => setForm((current) => ({ ...current, quality_overall_flag: value }))}
                  options={[
                    { value: "preferred", label: "Preferred" },
                    { value: "standard", label: "Standard" },
                    { value: "caution", label: "Caution" },
                    { value: "avoid", label: "Avoid" },
                  ]}
                />
              ) : null}
            </div>
            <FlatFieldGrid
              columns={3}
              fields={[
                { label: "Payment Score", value: customer.quality_payment_score ?? "Not evaluated" },
                { label: "Cancellation Score", value: customer.quality_cancellation_score ?? "Not evaluated" },
                { label: "Disputes (12m)", value: String(customer.quality_disputes_count ?? 0) },
                { label: "FMCSA Standing", value: customer.fmcsa_authority_status_at_verification ?? "Not verified" },
                {
                  label: "SAFER Status",
                  value: saferEntity?.safer_verified_at
                    ? `${saferEntity.safer_authority_status ?? "unknown"} · ${saferEntity.safer_oos_status ?? "unknown"} · ${new Date(saferEntity.safer_verified_at).toLocaleDateString()}`
                    : saferEntity?.safer_status ?? "Not verified",
                },
              ]}
            />
            <div className="mt-3">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Quality Notes</label>
              <textarea
                value={hydratedForm.quality_notes ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, quality_notes: event.target.value }))}
                disabled={!editMode || !canEditQualityNotes}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
              />
            </div>
          </DataPanel>

          <DataPanel title="Event Summary">
            <FlatFieldGrid
              columns={4}
              fields={[
                { label: "Total Events", value: String(qualityStats.totalEvents) },
                { label: "Severe", value: String(qualityStats.severeCount) },
                { label: "Dollar Impact", value: `$${qualityStats.totalImpact.toFixed(2)}` },
                { label: "Avg Days Late", value: qualityStats.avgDaysLate.toFixed(1) },
              ]}
            />
          </DataPanel>

          <DataPanel title="Timeline">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                {canWriteQuality ? (
                  <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                    <input type="checkbox" checked={showVoidedQuality} onChange={(event) => setShowVoidedQuality(event.target.checked)} />
                    Show voided
                  </label>
                ) : null}
              </div>
              {canWriteQuality ? (
                <Button size="sm" onClick={() => setQualityModalOpen(true)}>
                  + Create Event
                </Button>
              ) : null}
            </div>
            <div className="space-y-2">
              {qualityEventsQuery.isLoading ? <div className="text-xs text-gray-500">Loading events...</div> : null}
              {qualityEvents.map((event) => (
                <div key={event.id} className={`rounded border px-3 py-2 ${event.voided_at ? "border-gray-200 bg-gray-50 text-gray-500" : "border-gray-300 bg-white"}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded bg-gray-100 px-2 py-0.5 text-[11px]">{event.event_date}</span>
                    <StatusBadge variant={event.severity === "severe" ? "crit" : event.severity === "warning" ? "warn" : "info"}>{event.severity}</StatusBadge>
                    <span className="text-xs uppercase tracking-wide">{event.event_type.replaceAll("_", " ")}</span>
                    {event.dollar_impact_amount ? <strong className="text-sm">${Number(event.dollar_impact_amount).toFixed(2)}</strong> : null}
                    {typeof event.days_late === "number" ? <span className="text-xs">Days late: {event.days_late}</span> : null}
                  </div>
                  <div className={event.voided_at ? "mt-1 text-sm line-through" : "mt-1 text-sm"}>{event.summary}</div>
                  {event.reason_label ? <div className="text-xs text-gray-500">Reason: {event.reason_label}</div> : null}
                  {event.details ? <div className="mt-1 text-xs text-gray-600">{event.details}</div> : null}
                  {event.voided_at ? <div className="mt-1 text-xs text-gray-500">Voided: {event.void_reason}</div> : null}
                  {canWriteQuality && !event.voided_at ? (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          const next = window.prompt("Update details", event.details ?? "");
                          if (next === null) return;
                          updateQualityEventMutation.mutate({ eventId: event.id, details: next });
                        }}
                      >
                        Edit Details
                      </Button>
                      <Button size="sm" variant="danger" onClick={() => setVoidingQualityEvent(event)}>
                        Void
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </DataPanel>
        </div>
      ) : null}

      {activeTab === "Documents" ? (
        canViewDocuments ? (
          <ErrorBoundary>
            <DocumentsTab entityType="customer" entityId={customer.id} entityName={customer.name} />
          </ErrorBoundary>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            You do not have permission to view customer documents.
          </div>
        )
      ) : null}

      {activeTab === "COI" ? (
        <CoiRequestsTab
          customerId={customer.id}
          customerName={customer.name}
          operatingCompanyId={operatingCompanyId ?? undefined}
        />
      ) : null}

      {activeTab === "Contracts" ? (
        canViewDocuments ? (
          <ErrorBoundary>
            <DataPanel title="Contracts">
              <p className="mb-2 text-xs text-gray-600">
                Upload broker/customer contract PDFs. Files are stored per-customer and remain viewable and downloadable.
              </p>
              <DocumentsTab entityType="customer" entityId={customer.id} entityName={customer.name} />
            </DataPanel>
          </ErrorBoundary>
        ) : (
          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            You do not have permission to view customer contracts.
          </div>
        )
      ) : null}

      {activeTab === "Portal Users" ? (
        <PortalUsersTab customerId={customer.id} operatingCompanyId={operatingCompanyId ?? undefined} />
      ) : null}

      {activeTab === "Contacts" ? (
        <DataPanel title={`Contacts (${contacts.length})`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs text-gray-600">Operational contacts and communication owners</div>
            <div className="flex items-center gap-2">
              {canViewInactiveContacts ? (
                <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                  <input type="checkbox" checked={includeInactiveContacts} onChange={(event) => setIncludeInactiveContacts(event.target.checked)} />
                  Show inactive
                </label>
              ) : null}
              {canManageContacts ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingContact(null);
                    setContactForm(emptyContactForm());
                    setContactModalOpen(true);
                  }}
                >
                  + Create Contact
                </Button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-1.5 font-semibold">Name</th>
                  <th className="px-2 py-1.5 font-semibold">Role</th>
                  <th className="px-2 py-1.5 font-semibold">Phone</th>
                  <th className="px-2 py-1.5 font-semibold">Email</th>
                  <th className="px-2 py-1.5 font-semibold">Primary</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {contacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-900">{contact.name}</td>
                    <td className="px-2 py-1.5 text-gray-700">{contact.title || contact.department}</td>
                    <td className="px-2 py-1.5 text-gray-700">{contact.phone || contact.mobile || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{contact.email || "-"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{contact.is_primary ? "Yes" : "No"}</td>
                    <td className="px-2 py-1.5 text-gray-700">{contact.deactivated_at ? "Inactive" : "Active"}</td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {canManageContacts ? (
                        !contact.deactivated_at ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                setEditingContact(contact);
                                setContactForm({
                                  name: contact.name,
                                  title: contact.title ?? "",
                                  email: contact.email ?? "",
                                  phone: contact.phone ?? "",
                                  mobile: contact.mobile ?? "",
                                  department: contact.department,
                                  is_primary: contact.is_primary,
                                  notes: contact.notes ?? "",
                                });
                                setContactModalOpen(true);
                              }}
                            >
                              Edit
                            </Button>
                            <Button size="sm" variant="danger" onClick={() => deactivateContactMutation.mutate(contact.id)}>
                              Deactivate
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="secondary" onClick={() => reactivateContactMutation.mutate(contact.id)}>
                            Reactivate
                          </Button>
                        )
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {contacts.length === 0 ? <div className="mt-3 text-sm text-gray-600">No contacts on file. Add via Edit Customer.</div> : null}
        </DataPanel>
      ) : null}

      {activeTab === "Billing & Receivables" ? (
        <div className="space-y-3">
          {billingSummaryQuery.isError ? (
            <ListErrorBanner
              message={formatBillingSummaryError(billingSummaryQuery.error)}
              onRetry={() => void billingSummaryQuery.refetch()}
            />
          ) : null}
        <div className="grid gap-3 md:grid-cols-3">
          <DataPanel title="Factoring Config">
            <div className="space-y-1 text-sm text-gray-700">
              <div>Eligible: {billingSummary?.factoring_eligible ? "Yes" : "No"}</div>
              <div>Recourse: {billingSummary?.factoring_recourse_type ?? "Default"}</div>
              <div>Company Vendor: {billingSummary?.factoring_company_vendor_id ?? "Not set"}</div>
            </div>
          </DataPanel>
          <DataPanel title="Credit Terms">
            <div className="space-y-1 text-sm text-gray-700">
              <div>A/R Email: {billingSummary?.ar_email ?? "-"}</div>
              <div>Terms (days): {billingSummary?.credit_terms_days ?? "-"}</div>
              <div>Outstanding Balance: {billingSummary?.outstanding_balance_cents == null ? "-" : formatCurrencyCents(billingSummary.outstanding_balance_cents)}</div>
            </div>
          </DataPanel>
          <DataPanel title="Detention + Layover Defaults">
            <div className="space-y-1 text-sm text-gray-700">
              <div>Detention/hr: {billingSummary?.default_detention_rate ?? "-"}</div>
              <div>Free time hrs: {billingSummary?.default_free_time_hours ?? "-"}</div>
              <div>Layover/day: {billingSummary?.layover_config?.layover_charge_per_day ?? "-"}</div>
            </div>
          </DataPanel>
          <div className="md:col-span-3 rounded border border-gray-200 bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-semibold text-gray-900 hover:bg-gray-50"
              onClick={() => setRecordPaymentOpen((o: boolean) => !o)}
            >
              <span>Record Payment</span>
              <span className="text-xs font-normal text-gray-500">{recordPaymentOpen ? "Hide" : "Show"}</span>
            </button>
            {recordPaymentOpen ? (
              <div className="space-y-3 border-t border-gray-100 p-3 text-xs">
                {paymentsBackendPending ? (
                  <div className="rounded border border-amber-200 bg-amber-50 p-2 text-amber-950">
                    Backend pending — file <strong>P6-T11204</strong> for customer payment APIs.{" "}
                    <button type="button" className="font-semibold text-blue-700 underline" onClick={() => void customerPaymentsQuery.refetch()}>
                      Retry
                    </button>
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="block">
                    Payment date
                    <input type="date" className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                  </label>
                  <label className="block">
                    Amount (USD)
                    <input
                      className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1"
                      inputMode="decimal"
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                    />
                  </label>
                  <label className="block">
                    Method
                    <SelectCombobox className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      <option value="ach">ACH</option>
                      <option value="check">Check</option>
                      <option value="wire">Wire</option>
                      <option value="credit_card">Credit Card</option>
                      <option value="other">Other</option>
                    </SelectCombobox>
                  </label>
                  <label className="block">
                    Reference
                    <input className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" value={payRef} onChange={(e) => setPayRef(e.target.value)} />
                  </label>
                </div>
                <label className="block">
                  Memo
                  <textarea className="mt-0.5 w-full rounded border border-gray-300 px-2 py-1" rows={2} value={payMemo} onChange={(e) => setPayMemo(e.target.value)} />
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={payAutoApply}
                    onChange={(e) => {
                      const on = e.target.checked;
                      if (!on) {
                        let remaining = paymentCents;
                        const snapInclude: Record<string, boolean> = {};
                        const snapAmt: Record<string, string> = {};
                        for (const inv of openInvoicesForPayment) {
                          if (remaining <= 0) break;
                          const openAmt = Number(inv.amount_open_cents ?? 0);
                          const apply = Math.min(openAmt, remaining);
                          if (apply > 0) {
                            snapInclude[inv.id] = true;
                            snapAmt[inv.id] = (apply / 100).toFixed(2);
                            remaining -= apply;
                          }
                        }
                        setPayInvoiceInclude(snapInclude);
                        setPayInvoiceAmount(snapAmt);
                      }
                      setPayAutoApply(on);
                    }}
                  />
                  Auto-match oldest open invoices first
                </label>
                <div className="rounded border border-gray-100 bg-gray-50 p-2">
                  <div className="font-semibold text-gray-800">Apply to invoices</div>
                  <p className="mt-1 text-gray-600">
                    Applying {formatCurrencyCents(paymentApplicationBreakdown.appliedSum)} of {formatCurrencyCents(paymentCents)} payment
                    {paymentApplicationBreakdown.creditBalanceCents > 0 ? (
                      <span className="text-amber-800"> · {formatCurrencyCents(paymentApplicationBreakdown.creditBalanceCents)} to customer credit</span>
                    ) : null}
                  </p>
                  {payManualInvalid ? <p className="mt-1 text-red-600">Total applied cannot exceed payment amount.</p> : null}
                  <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
                    {openInvoicesForPayment.length === 0 ? <p className="text-gray-500">No open invoices.</p> : null}
                    {openInvoicesForPayment.map((inv: Invoice) => (
                      <div key={inv.id} className="flex flex-wrap items-center gap-2 border-b border-gray-100 py-1">
                        {!payAutoApply ? (
                          <input
                            type="checkbox"
                            checked={Boolean(payInvoiceInclude[inv.id])}
                            onChange={(e) => setPayInvoiceInclude((p) => ({ ...p, [inv.id]: e.target.checked }))}
                          />
                        ) : null}
                        <span className="font-medium text-gray-800">{inv.display_id}</span>
                        <span className="text-gray-600">Open {formatCurrencyCents(inv.amount_open_cents)}</span>
                        {!payAutoApply ? (
                          <input
                            type="number"
                            step="0.01"
                            className="w-24 rounded border border-gray-300 px-1 py-0.5"
                            placeholder="Apply"
                            value={payInvoiceAmount[inv.id] ?? ""}
                            onChange={(e) => setPayInvoiceAmount((p) => ({ ...p, [inv.id]: e.target.value }))}
                          />
                        ) : (
                          <span className="text-gray-700">
                            {(() => {
                              const row = paymentApplicationBreakdown.applications.find((a) => a.invoice_id === inv.id);
                              return row ? formatCurrencyCents(row.amount_cents) : "—";
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
                    disabled={paymentCents <= 0 || payManualInvalid || recordCustomerPaymentMutation.isPending}
                    loading={recordCustomerPaymentMutation.isPending}
                    onClick={() => void recordCustomerPaymentMutation.mutateAsync()}
                  >
                    Record payment
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setRecordPaymentOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="md:col-span-3 rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Payment history</div>
            {paymentsBackendPending ? (
              <p className="text-sm text-amber-800">
                Backend pending — payment history unavailable until backend ships (P6-T11204).
              </p>
            ) : customerPaymentsQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading payments…</p>
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
                      <th className="px-2 py-1.5 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(customerPaymentsQuery.data?.payments ?? []).map((p: CustomerPaymentListRow) => {
                      const jeId = p.journal_entry_id ?? p.qbo_journal_entry_id;
                      const applied = p.amount_applied_cents ?? p.applied_total_cents;
                      return (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="px-2 py-1.5">{p.payment_date}</td>
                          <td className="px-2 py-1.5">{formatCurrencyCents(p.amount_cents)}</td>
                          <td className="px-2 py-1.5">{p.payment_method ?? p.method ?? "—"}</td>
                          <td className="px-2 py-1.5">{applied != null ? formatCurrencyCents(applied) : "—"}</td>
                          <td className="px-2 py-1.5">{p.reference ?? "—"}</td>
                          <td className="px-2 py-1.5">
                            {jeId ? (
                              <button type="button" className="mr-2 text-blue-700 underline" onClick={() => navigate(`/accounting/journal-entries/${jeId}`)}>
                                View JE
                              </button>
                            ) : null}
                            {canUnapplyCustomerPayment ? (
                              <button
                                type="button"
                                className="text-red-700 underline"
                                onClick={() => void unapplyCustomerPaymentMutation.mutateAsync(p.id)}
                              >
                                Unapply
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                    {(customerPaymentsQuery.data?.payments ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-2 py-3 text-gray-500">
                          No payments recorded.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="md:col-span-3 rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 text-sm font-semibold text-gray-900">Receivables Aging</div>
            {!hasOpenInvoices ? (
              <div className="text-sm text-gray-600">No open invoices.</div>
            ) : (
              <div className="space-y-1 text-sm text-gray-700">
                <div className="flex items-center justify-between">
                  <span>Current</span>
                  <span className="font-medium text-gray-900">{formatCurrencyCents(aging?.current)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>1-30 days</span>
                  <span className="font-medium text-gray-900">{formatCurrencyCents(aging?.bucket_1_30)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>31-60 days</span>
                  <span className="font-medium text-gray-900">{formatCurrencyCents(aging?.bucket_31_60)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>61-90 days</span>
                  <span className={`font-medium ${Number(aging?.bucket_61_90 ?? 0) > 0 ? "text-amber-600" : "text-gray-900"}`}>
                    {formatCurrencyCents(aging?.bucket_61_90)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span>91+ days</span>
                  <span className={`font-medium ${Number(aging?.bucket_91_plus ?? 0) > 0 ? "text-red-600" : "text-gray-900"}`}>
                    {formatCurrencyCents(aging?.bucket_91_plus)}
                  </span>
                </div>
                <div className="my-1 border-t border-gray-200" />
                <div className="flex items-center justify-between font-semibold text-gray-900">
                  <span>Total open</span>
                  <span>{formatCurrencyCents(aging?.total_open)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Open invoices</span>
                  <span className="font-medium text-gray-900">{Number(aging?.open_invoice_count ?? 0)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Last payment</span>
                  <span className="font-medium text-gray-900">{formatDateShort(billingSummary?.last_payment_at)}</span>
                </div>
              </div>
            )}
          </div>
          <div className="md:col-span-3 rounded border border-gray-200 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">Recent Invoices</h3>
              <button type="button" className="text-xs font-semibold text-blue-700 underline" onClick={() => navigate("/accounting/invoices")}>
                View all
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-600">
                    <th className="px-2 py-1.5 font-semibold">Invoice</th>
                    <th className="px-2 py-1.5 font-semibold">Issue</th>
                    <th className="px-2 py-1.5 font-semibold">Status</th>
                    <th className="px-2 py-1.5 font-semibold">Total</th>
                    <th className="px-2 py-1.5 font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInvoices.map((invoice) => (
                    <tr key={invoice.id} className="cursor-pointer border-b border-gray-100 hover:bg-gray-50" onClick={() => navigate(`/accounting/invoices/${invoice.id}`)}>
                      <td className="px-2 py-1.5 text-gray-900">{invoice.display_id}</td>
                      <td className="px-2 py-1.5 text-gray-700">{invoice.issue_date}</td>
                      <td className="px-2 py-1.5 text-gray-700">{invoice.status}</td>
                      <td className="px-2 py-1.5 text-gray-700">{(Number(invoice.total_cents ?? 0) / 100).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-gray-700">{(Number(invoice.amount_open_cents ?? 0) / 100).toFixed(2)}</td>
                    </tr>
                  ))}
                  {recentInvoices.length === 0 ? (
                    <tr>
                      <td className="px-2 py-2 text-gray-500" colSpan={5}>
                        No invoices yet for this customer.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        </div>
      ) : null}

      {activeTab === "Lanes & Pricing" ? (
        <div className="rounded border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm text-gray-600">Customer lane pricing definitions</div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[11px] text-gray-600">
                <input type="checkbox" checked={includeInactiveLanes} onChange={(event) => setIncludeInactiveLanes(event.target.checked)} />
                Show inactive
              </label>
              {canManageLanes ? (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditingLane(null);
                    setLaneForm(emptyLaneForm());
                    setLaneModalOpen(true);
                  }}
                >
                  + Create Lane
                </Button>
              ) : null}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-600">
                  <th className="px-2 py-1.5 font-semibold">Lane</th>
                  <th className="px-2 py-1.5 font-semibold">Origin</th>
                  <th className="px-2 py-1.5 font-semibold">Destination</th>
                  <th className="px-2 py-1.5 font-semibold">Miles</th>
                  <th className="px-2 py-1.5 font-semibold">Base Rate</th>
                  <th className="px-2 py-1.5 font-semibold">FSC/mi</th>
                  <th className="px-2 py-1.5 font-semibold">Status</th>
                  <th className="px-2 py-1.5 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {customerLanes.map((lane) => (
                  <tr key={lane.id} className="border-b border-gray-100">
                    <td className="px-2 py-1.5 text-gray-900">{lane.lane_label}</td>
                    <td className="px-2 py-1.5 text-gray-700">{lane.origin_city}, {lane.origin_state}</td>
                    <td className="px-2 py-1.5 text-gray-700">{lane.destination_city}, {lane.destination_state}</td>
                    <td className="px-2 py-1.5 text-gray-700">{lane.typical_miles ?? "-"}</td>
                    <td className="px-2 py-1.5 text-gray-700">${(Number(lane.base_rate_cents ?? 0) / 100).toFixed(2)}</td>
                    <td className="px-2 py-1.5 text-gray-700">{lane.fsc_per_mile_cents == null ? "-" : `$${(lane.fsc_per_mile_cents / 100).toFixed(2)}`}</td>
                    <td className="px-2 py-1.5 text-gray-700">{lane.deactivated_at ? "Inactive" : "Active"}</td>
                    <td className="px-2 py-1.5 text-gray-700">
                      {canManageLanes && !lane.deactivated_at ? (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEditingLane(lane);
                              setLaneForm({
                                lane_label: lane.lane_label,
                                origin_city: lane.origin_city,
                                origin_state: lane.origin_state,
                                destination_city: lane.destination_city,
                                destination_state: lane.destination_state,
                                typical_miles: lane.typical_miles?.toString() ?? "",
                                base_rate_cents: lane.base_rate_cents?.toString() ?? "",
                                fsc_per_mile_cents: lane.fsc_per_mile_cents?.toString() ?? "",
                                notes: lane.notes ?? "",
                              });
                              setLaneModalOpen(true);
                            }}
                          >
                            Edit
                          </Button>
                          <Button size="sm" variant="danger" onClick={() => deactivateLaneMutation.mutate(lane.id)}>
                            Deactivate
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {customerLanes.length === 0 ? <div className="mt-3 text-sm text-gray-600">Add your first lane to track customer pricing.</div> : null}
        </div>
      ) : null}

      <Modal open={laneModalOpen} onClose={() => setLaneModalOpen(false)} title={editingLane ? "Edit Lane" : "Create Lane"}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = laneSchema.safeParse(laneForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete lane details", "error");
              return;
            }
            const payload = {
              lane_label: parsed.data.lane_label,
              origin_city: parsed.data.origin_city,
              origin_state: parsed.data.origin_state,
              destination_city: parsed.data.destination_city,
              destination_state: parsed.data.destination_state,
              typical_miles: parsed.data.typical_miles ? Number(parsed.data.typical_miles) : undefined,
              base_rate_cents: Number(parsed.data.base_rate_cents),
              fsc_per_mile_cents: parsed.data.fsc_per_mile_cents ? Number(parsed.data.fsc_per_mile_cents) : undefined,
              notes: parsed.data.notes || undefined,
            };
            if (!editingLane) {
              await createLaneMutation.mutateAsync(payload);
              return;
            }
            await updateLaneMutation.mutateAsync({
              laneId: editingLane.id,
              payload: {
                ...payload,
                typical_miles: payload.typical_miles ?? null,
                fsc_per_mile_cents: payload.fsc_per_mile_cents ?? null,
                notes: payload.notes ?? null,
              },
            });
          }}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Lane Label" value={laneForm.lane_label} onChange={(value) => setLaneForm((current) => ({ ...current, lane_label: value }))} />
            <Field label="Typical Miles" value={laneForm.typical_miles} onChange={(value) => setLaneForm((current) => ({ ...current, typical_miles: value }))} />
            <Field label="Origin City" value={laneForm.origin_city} onChange={(value) => setLaneForm((current) => ({ ...current, origin_city: value }))} />
            <Field label="Origin State" value={laneForm.origin_state} onChange={(value) => setLaneForm((current) => ({ ...current, origin_state: value }))} />
            <Field label="Destination City" value={laneForm.destination_city} onChange={(value) => setLaneForm((current) => ({ ...current, destination_city: value }))} />
            <Field label="Destination State" value={laneForm.destination_state} onChange={(value) => setLaneForm((current) => ({ ...current, destination_state: value }))} />
            <Field label="Base Rate (cents)" value={laneForm.base_rate_cents} onChange={(value) => setLaneForm((current) => ({ ...current, base_rate_cents: value }))} />
            <Field label="FSC per mile (cents)" value={laneForm.fsc_per_mile_cents} onChange={(value) => setLaneForm((current) => ({ ...current, fsc_per_mile_cents: value }))} />
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Notes</label>
              <textarea
                value={laneForm.notes}
                onChange={(event) => setLaneForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLaneModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createLaneMutation.isPending || updateLaneMutation.isPending}>
              {editingLane ? "Update Lane" : "Create Lane"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={contactModalOpen} onClose={() => setContactModalOpen(false)} title={editingContact ? "Edit Contact" : "Create Contact"}>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const parsed = contactSchema.safeParse(contactForm);
            if (!parsed.success) {
              pushToast(parsed.error.issues[0]?.message ?? "Please complete required fields", "error");
              return;
            }

            if (parsed.data.is_primary && primaryContact && primaryContact.id !== editingContact?.id) {
              pushToast(`Primary contact will be replaced (${primaryContact.name})`, "info");
            }

            if (!editingContact) {
              await createContactMutation.mutateAsync({
                ...parsed.data,
                email: parsed.data.email || undefined,
                title: parsed.data.title || undefined,
                phone: parsed.data.phone || undefined,
                mobile: parsed.data.mobile || undefined,
                notes: parsed.data.notes || undefined,
              });
              return;
            }

            await updateContactMutation.mutateAsync({
              contactId: editingContact.id,
              payload: {
                ...parsed.data,
                title: parsed.data.title || null,
                email: parsed.data.email || null,
                phone: parsed.data.phone || null,
                mobile: parsed.data.mobile || null,
                notes: parsed.data.notes || null,
              },
            });
          }}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <Field label="Name" value={contactForm.name} onChange={(value) => setContactForm((current) => ({ ...current, name: value }))} />
            <Field label="Title" value={contactForm.title} onChange={(value) => setContactForm((current) => ({ ...current, title: value }))} />
            <Field label="Email" value={contactForm.email} onChange={(value) => setContactForm((current) => ({ ...current, email: value }))} />
            <Field label="Phone" value={contactForm.phone} onChange={(value) => setContactForm((current) => ({ ...current, phone: value }))} />
            <Field label="Mobile" value={contactForm.mobile} onChange={(value) => setContactForm((current) => ({ ...current, mobile: value }))} />
            <SelectField
              label="Department"
              value={contactForm.department}
              onChange={(value) => setContactForm((current) => ({ ...current, department: value as CustomerContactDepartment }))}
              options={[
                { value: "sales", label: "Sales" },
                { value: "billing", label: "Billing" },
                { value: "dispatch", label: "Dispatch" },
                { value: "operations", label: "Operations" },
                { value: "owner", label: "Owner" },
                { value: "other", label: "Other" },
              ]}
            />
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input type="checkbox" checked={contactForm.is_primary} onChange={(event) => setContactForm((current) => ({ ...current, is_primary: event.target.checked }))} />
              Primary contact
            </label>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Notes</label>
              <textarea
                value={contactForm.notes}
                onChange={(event) => setContactForm((current) => ({ ...current, notes: event.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setContactModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createContactMutation.isPending || updateContactMutation.isPending}>
              Save
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={qualityModalOpen} onClose={() => setQualityModalOpen(false)} title="Create Quality Event">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!qualityForm.summary.trim()) {
              pushToast("Summary is required", "error");
              return;
            }
            await createQualityEventMutation.mutateAsync();
          }}
        >
          <div className="grid gap-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Event Type</label>
              <Combobox
                options={[
                  "late_payment",
                  "non_payment",
                  "lumper_dispute",
                  "detention_dispute",
                  "tonu_dispute",
                  "load_cancelled",
                  "rate_dispute",
                  "damage_claim",
                  "commendation",
                  "other",
                ].map((value) => ({ value, label: value.replaceAll("_", " ") }))}
                value={qualityForm.event_type}
                onChange={(nextValue) =>
                  setQualityForm((current) => ({ ...current, event_type: (nextValue as CustomerQualityEvent["event_type"]) ?? "late_payment", reason_id: "" }))
                }
                placeholder="Select event type"
              />
            </div>
            <Field
              label="Event Date"
              value={qualityForm.event_date}
              onChange={(value) => setQualityForm((current) => ({ ...current, event_date: value }))}
              type="date"
            />
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600">Reason</label>
              <Combobox
                options={(qualityReasonsQuery.data ?? []).map((reason) => ({
                  value: reason.id,
                  label: reason.label,
                  sublabel: reason.severity,
                }))}
                value={qualityForm.reason_id || null}
                onChange={(nextValue) => {
                  const reason = (qualityReasonsQuery.data ?? []).find((entry) => entry.id === nextValue);
                  setQualityForm((current) => ({ ...current, reason_id: nextValue ?? "", severity: reason?.severity ?? current.severity }));
                }}
                loading={qualityReasonsQuery.isLoading}
                placeholder="Select reason"
              />
            </div>
            <SelectField
              label="Severity"
              value={qualityForm.severity}
              onChange={(value) => setQualityForm((current) => ({ ...current, severity: value as CustomerQualityEvent["severity"] }))}
              options={[
                { value: "info", label: "Info" },
                { value: "warning", label: "Warning" },
                { value: "severe", label: "Severe" },
              ]}
            />
            <Field label="Dollar Impact" value={qualityForm.dollar_impact_amount} onChange={(value) => setQualityForm((current) => ({ ...current, dollar_impact_amount: value }))} type="number" />
            {qualityForm.event_type === "late_payment" ? (
              <Field label="Days Late" value={qualityForm.days_late} onChange={(value) => setQualityForm((current) => ({ ...current, days_late: value }))} type="number" />
            ) : null}
            <div className="md:col-span-2">
              <Field label="Summary" value={qualityForm.summary} onChange={(value) => setQualityForm((current) => ({ ...current, summary: value }))} />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs font-semibold text-gray-600">Details</label>
              <textarea
                value={qualityForm.details}
                onChange={(event) => setQualityForm((current) => ({ ...current, details: event.target.value }))}
                rows={3}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setQualityModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={createQualityEventMutation.isPending}>
              Create Event
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={Boolean(voidingQualityEvent)} onClose={() => setVoidingQualityEvent(null)} title="Void Quality Event">
        <div className="space-y-3">
          <p className="text-sm text-gray-700">Voiding keeps the historical record but marks this event as inactive.</p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Void reason</label>
            <textarea
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setVoidingQualityEvent(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!voidingQualityEvent) return;
                if (voidReason.trim().length < 10) {
                  pushToast("Void reason must be at least 10 characters", "error");
                  return;
                }
                voidQualityEventMutation.mutate({ eventId: voidingQualityEvent.id, reason: voidReason.trim() });
              }}
              loading={voidQualityEventMutation.isPending}
            >
              Void Event
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={statusConfirmOpen} onClose={() => setStatusConfirmOpen(false)} title="Confirm Status Change">
        <div className="space-y-3">
          <p className="text-[13px] text-gray-700">
            Changing this customer to <strong>{statusLabel((hydratedForm.status as Customer["status"]) ?? customer.status)}</strong> can block dispatch unless overridden.
          </p>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600">Reason</label>
            <textarea value={statusReason} onChange={(event) => setStatusReason(event.target.value)} rows={3} className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStatusConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!statusReason.trim()) {
                  pushToast("Reason is required for credit hold/blacklist", "error");
                  return;
                }
                updateCustomerMutation.mutate(statusReason.trim());
              }}
              loading={updateCustomerMutation.isPending}
            >
              Confirm
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={fmcsaHistoryOpen} onClose={() => setFmcsaHistoryOpen(false)} title="FMCSA Verification History">
        <div className="space-y-2">
          {fmcsaHistoryQuery.isLoading ? <div className="text-sm text-gray-500">Loading verification history...</div> : null}
          {(fmcsaHistoryQuery.data ?? []).map((lookup) => (
            <div key={lookup.lookup_id} className="rounded border border-gray-200 p-2 text-sm">
              <div className="flex items-center justify-between">
                <strong>{lookup.legal_name ?? "Unknown carrier"}</strong>
                <StatusBadge variant={lookup.authority_status === "ACTIVE" ? "positive" : "crit"}>{lookup.authority_status}</StatusBadge>
              </div>
              <div className="text-xs text-gray-600">
                {lookup.lookup_type.toUpperCase()} {lookup.lookup_value} • {new Date(lookup.fetched_at).toLocaleString()}
              </div>
            </div>
          ))}
          {(fmcsaHistoryQuery.data ?? []).length === 0 && !fmcsaHistoryQuery.isLoading ? (
            <div className="text-sm text-gray-500">No FMCSA verifications found for this company.</div>
          ) : null}
        </div>
      </Modal>

      <CustomerEditModal
        open={editModalOpen}
        customer={customer}
        saving={updateCustomerMutation.isPending}
        onClose={() => setEditModalOpen(false)}
        onSave={async (values: CustomerEditFormValues) => {
          const parsed = customerSchema.safeParse({ ...hydratedForm, ...values });
          if (!parsed.success) {
            pushToast(parsed.error.issues[0]?.message ?? "Please correct the form", "error");
            return;
          }
          setForm((current) => ({ ...current, ...values }));
          try {
            await updateCustomer(id, {
              operating_company_id: selectedCompanyId ?? operatingCompanyId ?? undefined,
              name: values.name,
              customer_code: values.customer_code || null,
              email: values.email || null,
              phone: values.phone || null,
              dot_number: values.dot_number || null,
              mc_number: values.mc_number || null,
              tax_id: values.tax_id || null,
              billing_state: values.billing_state || null,
              status: values.status,
            });
            pushToast("Customer updated", "success");
            setEditModalOpen(false);
            await queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
          } catch {
            pushToast("Failed to update customer", "error");
          }
        }}
      />

      <FMCSAVerificationModal
        open={fmcsaModalOpen}
        onClose={() => setFmcsaModalOpen(false)}
        customerId={customer.id}
        initialUsdot={hydratedForm.dot_number}
        initialMc={hydratedForm.mc_number}
        onApplyToCustomer={(fmcsaResult) => {
          setForm((current) => ({
            ...current,
            name: fmcsaResult.legal_name ?? current.name,
            dot_number: fmcsaResult.usdot_number ?? current.dot_number,
            mc_number: fmcsaResult.mc_number ?? current.mc_number,
            office_phone: fmcsaResult.phone ?? current.office_phone,
          }));
          pushToast("FMCSA values applied. Save customer to persist profile changes.", "success");
        }}
        onSavedAsVerified={() => {
          queryClient.invalidateQueries({ queryKey: ["customer-detail", id] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
        }}
      />
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <input
        type={type}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="h-9 rounded border border-gray-300 px-2 py-1.5 text-[13px] disabled:bg-gray-100"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <div className="mb-2 flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">{label}</label>
      <Combobox
        options={options}
        value={value ?? ""}
        onChange={(nextValue) => onChange(nextValue ?? "")}
        disabled={disabled}
        placeholder="Select option"
      />
    </div>
  );
}
