/**
 * CustomerProfileForm — the single, canonical field source for the full
 * QuickBooks-style customer profile (V4/V5 create · V6 edit).
 *
 * ONE flat sectioned form is rendered by BOTH the "+ Create Customer" panel and
 * the Edit panel, so Edit can never drift to a subset of the profile fields
 * (the V6 defect: the old edit popup showed 8 of ~35 fields). Sections are flat
 * (heading + rule + field grid) — no box-within-box card nesting.
 *
 * Every field here round-trips to an EXISTING mdata.customers column via
 * Create/UpdateCustomerInput. VENDOR-CUSTOMER-QBO-PARITY (migration
 * 202607110230, HELD) closed the Cc/Bcc, print-on-invoice name, structured
 * shipping address, preferred payment/delivery method, customer language, and
 * tax-exemption gaps that used to be listed here as "pending backend" — they
 * are now real sections below. Only fine-grained communication-consent
 * tracking (beyond the delivery-method choice) remains a flagged follow-up;
 * see the trailing note.
 */
import { useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import type { CreateCustomerInput, Customer, PaymentTermOption, UpdateCustomerInput } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { customerTypesCatalogClient } from "../../api/catalogs-customers";
import type { CustomerType, MilesBasis } from "../../types/api";
import { MoneyInput } from "../forms/MoneyInput";
import { EntityPicker } from "../parity/EntityPicker";

export type CustomerProfileFormValues = {
  // Name & contact
  name: string;
  customer_type: "" | CustomerType;
  // LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER: additional, optional catalogs.customer_types
  // FK ("Customer category") alongside the legacy customer_type enum above — not a replacement.
  customer_type_id: string; // "" = none selected
  parent_customer_id: string; // D1-4: sub-customer -> parent hard link ("" = top-level customer)
  email: string;
  phone: string;
  mobile: string;
  fax_phone: string;
  website: string;
  customer_code: string;
  // Company identifiers
  mc_number: string;
  dot_number: string;
  tax_id: string;
  // Billing address
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  // Terms & credit
  payment_terms_id: string;
  credit_limit: string;
  credit_limit_source: "" | "factor" | "manual" | "rmis_future";
  default_income_account_id: string; // Option-B: recommendation only, pre-fills invoice lines
  // AR / AP contacts
  main_contact_name: string;
  main_contact_title: string;
  ar_email: string;
  ar_phone: string;
  ap_email: string;
  ap_phone: string;
  // Detention & free-time defaults
  free_time_pickup_minutes: string;
  free_time_delivery_minutes: string;
  detention_rate_per_hour: string;
  default_billing_miles_basis: "" | MilesBasis;
  // Factoring
  factoring_eligible: boolean;
  factoring_company_vendor_id: string;
  factoring_recourse_type: "" | "recourse" | "non_recourse";
  factoring_advance_rate_override: string;
  factoring_reserve_pct_override: string;
  factoring_notes: string;
  // Notes
  notes: string;
  // Status (edit only)
  status: Customer["status"];
  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
  print_on_invoice_name: string;
  cc_email: string;
  bcc_email: string;
  shipping_same_as_billing: boolean;
  shipping_address_line1: string;
  shipping_address_line2: string;
  shipping_city: string;
  shipping_state: string;
  shipping_postal_code: string;
  shipping_country: string;
  preferred_payment_method: "" | "check" | "ach" | "credit_card" | "cash" | "other";
  preferred_delivery_method: "email" | "print" | "none";
  preferred_language: "en" | "es";
  tax_exempt: boolean;
  tax_exempt_reason: string;
};

export function emptyCustomerProfileValues(): CustomerProfileFormValues {
  return {
    name: "",
    customer_type: "",
    customer_type_id: "",
    parent_customer_id: "",
    email: "",
    phone: "",
    mobile: "",
    fax_phone: "",
    website: "",
    customer_code: "",
    mc_number: "",
    dot_number: "",
    tax_id: "",
    billing_address: "",
    billing_city: "",
    billing_state: "",
    billing_zip: "",
    payment_terms_id: "",
    credit_limit: "",
    credit_limit_source: "",
    default_income_account_id: "",
    main_contact_name: "",
    main_contact_title: "",
    ar_email: "",
    ar_phone: "",
    ap_email: "",
    ap_phone: "",
    free_time_pickup_minutes: "",
    free_time_delivery_minutes: "",
    detention_rate_per_hour: "",
    default_billing_miles_basis: "",
    factoring_eligible: false,
    factoring_company_vendor_id: "",
    factoring_recourse_type: "",
    factoring_advance_rate_override: "",
    factoring_reserve_pct_override: "",
    factoring_notes: "",
    notes: "",
    status: "active",
    print_on_invoice_name: "",
    cc_email: "",
    bcc_email: "",
    shipping_same_as_billing: true,
    shipping_address_line1: "",
    shipping_address_line2: "",
    shipping_city: "",
    shipping_state: "",
    shipping_postal_code: "",
    shipping_country: "US",
    preferred_payment_method: "",
    preferred_delivery_method: "email",
    preferred_language: "en",
    tax_exempt: false,
    tax_exempt_reason: "",
  };
}

export function customerToProfileValues(c: Customer): CustomerProfileFormValues {
  const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    name: str(c.name),
    customer_type: c.customer_type ?? "",
    customer_type_id: str(c.customer_type_id),
    parent_customer_id: str(c.parent_customer_id),
    email: str(c.email),
    phone: str(c.phone),
    mobile: str(c.main_contact_mobile),
    fax_phone: str(c.fax_phone),
    website: str(c.website),
    customer_code: str(c.customer_code),
    mc_number: str(c.mc_number),
    dot_number: str(c.dot_number),
    tax_id: str(c.tax_id),
    billing_address: str(c.billing_address),
    billing_city: str(c.billing_city),
    billing_state: str(c.billing_state),
    billing_zip: str(c.billing_zip),
    payment_terms_id: str(c.payment_terms_id),
    credit_limit: str(c.credit_limit),
    credit_limit_source: c.credit_limit_source ?? "",
    default_income_account_id: str(c.default_income_account_id),
    main_contact_name: str(c.main_contact_name),
    main_contact_title: str(c.main_contact_title),
    ar_email: str(c.ar_email),
    ar_phone: str(c.ar_phone),
    ap_email: str(c.ap_email),
    ap_phone: str(c.ap_phone),
    free_time_pickup_minutes: str(c.free_time_pickup_minutes),
    free_time_delivery_minutes: str(c.free_time_delivery_minutes),
    detention_rate_per_hour: str(c.detention_rate_per_hour),
    default_billing_miles_basis: c.default_billing_miles_basis ?? "",
    factoring_eligible: Boolean(c.factoring_eligible),
    factoring_company_vendor_id: c.factoring_company_vendor_id ?? "",
    factoring_recourse_type: c.factoring_recourse_type ?? "",
    factoring_advance_rate_override: str(c.factoring_advance_rate_override),
    factoring_reserve_pct_override: str(c.factoring_reserve_pct_override),
    factoring_notes: str(c.factoring_notes),
    notes: str(c.notes),
    status: c.status,
    print_on_invoice_name: str(c.print_on_invoice_name),
    cc_email: str(c.cc_email),
    bcc_email: str(c.bcc_email),
    shipping_same_as_billing: c.shipping_same_as_billing ?? true,
    shipping_address_line1: str(c.shipping_address_line1),
    shipping_address_line2: str(c.shipping_address_line2),
    shipping_city: str(c.shipping_city),
    shipping_state: str(c.shipping_state),
    shipping_postal_code: str(c.shipping_postal_code),
    shipping_country: c.shipping_country ?? "US",
    preferred_payment_method: c.preferred_payment_method ?? "",
    preferred_delivery_method: c.preferred_delivery_method ?? "email",
    preferred_language: c.preferred_language ?? "en",
    tax_exempt: Boolean(c.tax_exempt),
    tax_exempt_reason: str(c.tax_exempt_reason),
  };
}

const trimOrUndef = (v: string) => (v.trim() ? v.trim() : undefined);
const trimOrNull = (v: string) => (v.trim() ? v.trim() : null);
const numOrUndef = (v: string) => {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? undefined : n;
};
const numOrNull = (v: string) => {
  const n = Number(v);
  return v.trim() === "" || Number.isNaN(n) ? null : n;
};

export type CustomerCreateValidationCode = "legal_name_required" | "customer_type_required" | "email_required" | "parent_customer_required";

/** Shared create validation for Customers module + inline picker create (same required fields). */
export function validateCustomerProfileForCreate(
  v: CustomerProfileFormValues
): { ok: true } | { ok: false; code: CustomerCreateValidationCode; message: string } {
  if (!v.name.trim()) {
    return { ok: false, code: "legal_name_required", message: "Legal name is required" };
  }
  if (!v.customer_type) {
    return { ok: false, code: "customer_type_required", message: "Customer type is required" };
  }
  if (!v.email.trim()) {
    return { ok: false, code: "email_required", message: "Email is required" };
  }
  return { ok: true };
}

export function profileValuesToCreatePayload(v: CustomerProfileFormValues, operatingCompanyId: string): CreateCustomerInput {
  const name = v.name.trim();
  const email = trimOrUndef(v.email);
  const arEmail = trimOrUndef(v.ar_email) ?? email;
  const apEmail = trimOrUndef(v.ap_email) ?? email;
  return {
    name,
    legal_name: name,
    customer_code: trimOrUndef(v.customer_code),
    customer_type: v.customer_type || undefined,
    customer_type_id: v.customer_type_id || undefined,
    parent_customer_id: v.parent_customer_id || undefined, // D1-4: persist parent hard link
    email,
    phone: trimOrUndef(v.phone),
    website: trimOrUndef(v.website),
    fax_phone: trimOrUndef(v.fax_phone),
    mc_number: trimOrUndef(v.mc_number),
    dot_number: trimOrUndef(v.dot_number),
    tax_id: trimOrUndef(v.tax_id),
    billing_address: trimOrUndef(v.billing_address),
    billing_city: trimOrUndef(v.billing_city),
    billing_state: trimOrUndef(v.billing_state),
    billing_zip: trimOrUndef(v.billing_zip),
    payment_terms_id: v.payment_terms_id || null,
    credit_limit: numOrUndef(v.credit_limit),
    credit_limit_source: v.credit_limit_source || null,
    default_income_account_id: v.default_income_account_id || null,
    main_contact_name: trimOrUndef(v.main_contact_name),
    main_contact_title: trimOrUndef(v.main_contact_title),
    main_contact_mobile: trimOrUndef(v.mobile),
    ar_email: arEmail,
    ar_phone: trimOrUndef(v.ar_phone),
    ap_email: apEmail,
    ap_phone: trimOrUndef(v.ap_phone),
    free_time_pickup_minutes: numOrUndef(v.free_time_pickup_minutes),
    free_time_delivery_minutes: numOrUndef(v.free_time_delivery_minutes),
    detention_rate_per_hour: numOrUndef(v.detention_rate_per_hour),
    default_billing_miles_basis: v.default_billing_miles_basis || undefined,
    factoring_eligible: v.factoring_eligible,
    factoring_company_vendor_id: v.factoring_company_vendor_id || null,
    factoring_recourse_type: v.factoring_recourse_type || null,
    factoring_advance_rate_override: numOrNull(v.factoring_advance_rate_override),
    factoring_reserve_pct_override: numOrNull(v.factoring_reserve_pct_override),
    factoring_notes: trimOrUndef(v.factoring_notes),
    notes: trimOrUndef(v.notes),
    operating_company_id: operatingCompanyId,
    print_on_invoice_name: trimOrUndef(v.print_on_invoice_name),
    cc_email: trimOrUndef(v.cc_email),
    bcc_email: trimOrUndef(v.bcc_email),
    shipping_same_as_billing: v.shipping_same_as_billing,
    shipping_address_line1: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_address_line1),
    shipping_address_line2: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_address_line2),
    shipping_city: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_city),
    shipping_state: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_state),
    shipping_postal_code: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_postal_code),
    shipping_country: v.shipping_same_as_billing ? undefined : trimOrUndef(v.shipping_country),
    preferred_payment_method: v.preferred_payment_method || null,
    preferred_delivery_method: v.preferred_delivery_method || undefined,
    preferred_language: v.preferred_language || undefined,
    tax_exempt: v.tax_exempt,
    tax_exempt_reason: v.tax_exempt ? trimOrNull(v.tax_exempt_reason) : null,
  };
}

export function profileValuesToUpdatePayload(v: CustomerProfileFormValues): UpdateCustomerInput {
  const name = v.name.trim();
  return {
    name,
    customer_code: trimOrNull(v.customer_code),
    customer_type: v.customer_type || null,
    customer_type_id: v.customer_type_id || null,
    parent_customer_id: v.parent_customer_id || null, // D1-4: persist / clear parent hard link
    email: trimOrNull(v.email),
    phone: trimOrNull(v.phone),
    website: trimOrNull(v.website),
    fax_phone: trimOrNull(v.fax_phone),
    mc_number: trimOrNull(v.mc_number),
    dot_number: trimOrNull(v.dot_number),
    tax_id: trimOrNull(v.tax_id),
    billing_address: trimOrNull(v.billing_address),
    billing_city: trimOrNull(v.billing_city),
    billing_state: trimOrNull(v.billing_state),
    billing_zip: trimOrNull(v.billing_zip),
    payment_terms_id: v.payment_terms_id || null,
    credit_limit: numOrNull(v.credit_limit),
    credit_limit_source: v.credit_limit_source || null,
    default_income_account_id: v.default_income_account_id || null,
    main_contact_name: trimOrNull(v.main_contact_name),
    main_contact_title: trimOrNull(v.main_contact_title),
    main_contact_mobile: trimOrNull(v.mobile),
    ar_email: trimOrNull(v.ar_email),
    ar_phone: trimOrNull(v.ar_phone),
    ap_email: trimOrNull(v.ap_email),
    ap_phone: trimOrNull(v.ap_phone),
    free_time_pickup_minutes: numOrUndef(v.free_time_pickup_minutes),
    free_time_delivery_minutes: numOrUndef(v.free_time_delivery_minutes),
    detention_rate_per_hour: numOrUndef(v.detention_rate_per_hour),
    default_billing_miles_basis: v.default_billing_miles_basis || undefined,
    factoring_eligible: v.factoring_eligible,
    factoring_company_vendor_id: v.factoring_company_vendor_id || null,
    factoring_recourse_type: v.factoring_recourse_type || null,
    factoring_advance_rate_override: numOrNull(v.factoring_advance_rate_override),
    factoring_reserve_pct_override: numOrNull(v.factoring_reserve_pct_override),
    factoring_notes: trimOrNull(v.factoring_notes),
    notes: trimOrNull(v.notes),
    status: v.status,
    print_on_invoice_name: trimOrNull(v.print_on_invoice_name),
    cc_email: trimOrNull(v.cc_email),
    bcc_email: trimOrNull(v.bcc_email),
    shipping_same_as_billing: v.shipping_same_as_billing,
    shipping_address_line1: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_address_line1),
    shipping_address_line2: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_address_line2),
    shipping_city: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_city),
    shipping_state: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_state),
    shipping_postal_code: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_postal_code),
    shipping_country: v.shipping_same_as_billing ? null : trimOrNull(v.shipping_country),
    preferred_payment_method: v.preferred_payment_method || null,
    preferred_delivery_method: v.preferred_delivery_method || undefined,
    preferred_language: v.preferred_language || undefined,
    tax_exempt: v.tax_exempt,
    tax_exempt_reason: v.tax_exempt ? trimOrNull(v.tax_exempt_reason) : null,
  };
}

// ── field primitives (flat, no nested cards) ──────────────────────────────
function TextField({
  label,
  value,
  onChange,
  type = "text",
  required = false,
  placeholder,
  dataField,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
  dataField?: string;
}) {
  const fieldName = dataField ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        name={fieldName}
        data-field={dataField}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-required={required || undefined}
        className="h-9 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
      />
    </label>
  );
}

// LV-CUSTOMER-PROFILE-MONEY-FIELDS-GENERIC-NUMBER — Credit limit / Detention rate were the only two
// dollar fields still routed through the plain TextField's native <input type="number">, bypassing
// governed MoneyInput. Both already store/round-trip as a bare dollar number (never cents — M-1
// ruling), so this wraps MoneyInput's existing valueDollars/onChangeDollars mode over the SAME string
// form-state field, converting only at the seam: the emitted/patched value stays the identical string
// shape onPatch already expects, byte-for-byte unchanged from the TextField it replaces.
function MoneyField({
  label,
  value,
  onChange,
  dataField,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  dataField?: string;
}) {
  const fieldName = dataField ?? label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  return (
    <label className="block text-sm" data-field={dataField}>
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <MoneyInput
        id={fieldName}
        name={fieldName}
        ariaLabel={label}
        valueDollars={value === "" ? null : Number(value)}
        onChangeDollars={(dollars) => onChange(dollars == null ? "" : String(dollars))}
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  required = false,
  name,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
  name?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required ? " *" : ""}
      </span>
      <select
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required || undefined}
        className="h-9 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-gray-200 pt-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">{children}</div>
    </section>
  );
}

// D1-4: candidate parents for the sub-customer picker. Callers pass ACTIVE, TOP-LEVEL customers in the
// same company (a parent can never itself be a sub). `customerId` is the row being edited, excluded so a
// customer can't pick itself as parent. When no options are supplied the section renders read-only guidance.
export type ParentCustomerOption = { id: string; name: string; customer_code: string | null };

type Props = {
  values: CustomerProfileFormValues;
  onPatch: (patch: Partial<CustomerProfileFormValues>) => void;
  operatingCompanyId: string;
  mode: "create" | "edit";
  paymentTermOptions: PaymentTermOption[];
  onPaymentTermCreated?: (term: PaymentTermOption) => void;
  parentCustomerOptions?: ParentCustomerOption[];
  /** LST-PICKER-01: refetch parent roster after inline "+ Add new customer". */
  onParentCustomerCreated?: () => void;
  customerId?: string;
};

export function CustomerProfileForm({ values, onPatch, operatingCompanyId, mode, paymentTermOptions, onPaymentTermCreated, onParentCustomerCreated, parentCustomerOptions, customerId }: Props) {
  const queryClient = useQueryClient();
  // LV-CUSTOMERS-FULL-EDIT-PAYMENT-TERMS-CACHE-SHAPE — Array.isArray (not `?? []`): a truthy non-array
  // (react-query cache holding the `{ payment_terms }` envelope under a shared key) still crashes `.map`.
  const termOptions = useMemo(() => {
    const terms = Array.isArray(paymentTermOptions) ? paymentTermOptions : [];
    return terms.map((t) => ({ value: t.id, label: `${t.terms_name} (${t.days_until_due}d)` }));
  }, [paymentTermOptions]);

  // LST-WIRE-07-CUSTOMER-TYPES-CATALOG-NO-CONSUMER: catalogs.customer_types had a working backend
  // route and zero frontend consumers. Self-contained fetch (mirrors detentionReasonsCatalogClient
  // and every other generic-catalog picker) rather than threading a new prop through 3 parents.
  const customerTypeCatalogQuery = useQuery({
    queryKey: ["catalogs", "customer-types", operatingCompanyId],
    queryFn: () => customerTypesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true" }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const customerTypeOptions = useMemo(() => {
    const rows = customerTypeCatalogQuery.data?.rows ?? [];
    return rows.map((row) => ({ value: row.id, label: row.display_name }));
  }, [customerTypeCatalogQuery.data?.rows]);

  // D1-4: parent-customer options, excluding the row being edited (a customer can't be its own parent).
  const parentOptions = useMemo(() => {
    const rows = Array.isArray(parentCustomerOptions) ? parentCustomerOptions : [];
    return rows
      .filter((c) => c.id !== customerId)
      .map((c) => ({ value: c.id, label: c.customer_code ? `${c.name} (${c.customer_code})` : c.name }));
  }, [parentCustomerOptions, customerId]);

  // Option-B (vendor-customer-categorization-option-b): default income account is a RECOMMENDATION
  // that pre-fills invoice lines — the user can always override it. Scoped to Income-type accounts.
  const incomeAccountsQuery = useQuery({
    queryKey: ["catalog-accounts", "income-for-customer-default", operatingCompanyId],
    // LST-F14: default income account is a posting target — postable_only.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const incomeAccountOptions = useMemo(() => {
    const raw = incomeAccountsQuery.data?.accounts;
    const accounts = Array.isArray(raw) ? raw : [];
    return accounts
      .filter((a) => a.account_type === "Income")
      .map((a) => ({ value: a.id, label: a.account_name }));
  }, [incomeAccountsQuery.data]);

  return (
    <div className="space-y-3">
      {/* Name & contact */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Name &amp; contact</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <TextField label="Customer display name" dataField="legal_name" value={values.name} onChange={(name) => onPatch({ name })} required />
          <SelectField
            label="Customer type"
            name="customer_type"
            required
            value={values.customer_type}
            onChange={(customer_type) => onPatch({ customer_type: customer_type as CustomerProfileFormValues["customer_type"] })}
            options={[
              { value: "", label: "— Select type —" },
              { value: "broker", label: "Broker" },
              { value: "direct_shipper", label: "Direct shipper" },
            ]}
          />
          <div className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Customer category</span>
            <ReferenceSelect
              value={values.customer_type_id || null}
              onChange={(next) => onPatch({ customer_type_id: next ?? "" })}
              options={customerTypeOptions}
              createKind="customer_type"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select category"
              onOptionCreated={() => void customerTypeCatalogQuery.refetch()}
            />
          </div>
          <TextField label="Email" type="email" value={values.email} onChange={(email) => onPatch({ email })} required />
          <TextField label="Phone" value={values.phone} onChange={(phone) => onPatch({ phone })} />
          <TextField label="Mobile" value={values.mobile} onChange={(mobile) => onPatch({ mobile })} />
          <TextField label="Fax" value={values.fax_phone} onChange={(fax_phone) => onPatch({ fax_phone })} />
          <TextField label="Website" value={values.website} onChange={(website) => onPatch({ website })} />
          <TextField label="Customer code" value={values.customer_code} onChange={(customer_code) => onPatch({ customer_code })} />
        </div>
      </section>

      {/* D1-4: Sub-customer / parent hard link — LST-PICKER-01: ReferenceSelect createKind=customer */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Sub-customer</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="block text-sm md:col-span-2" data-testid="customer-parent-select">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Parent customer</span>
            <ReferenceSelect
              value={values.parent_customer_id || null}
              onChange={(next) => onPatch({ parent_customer_id: next ?? "" })}
              options={parentOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              placeholder={parentOptions.length === 0 ? "Select or + Add new parent customer" : "Select a parent (leave blank for a top-level customer)"}
              addNewLabel="+ Add new parent customer"
              onOptionCreated={() => onParentCustomerCreated?.()}
            />
            <p className="mt-1 text-xs text-gray-500">
              Link this customer as a sub-customer of an existing top-level customer. Leave blank for a top-level
              customer. A parent must itself be top-level (no nesting beyond two levels). Adding a parent here
              saves it to the customer list and selects it in this form.
            </p>
          </div>
        </div>
      </section>

      {/* Company identifiers */}
      <Section title="Company identifiers">
        <TextField label="MC number" value={values.mc_number} onChange={(mc_number) => onPatch({ mc_number })} />
        <TextField label="DOT number" value={values.dot_number} onChange={(dot_number) => onPatch({ dot_number })} />
        <TextField label="Tax ID (EIN)" value={values.tax_id} onChange={(tax_id) => onPatch({ tax_id })} />
      </Section>

      {/* Billing address */}
      <Section title="Billing address">
        <label className="block text-sm md:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-gray-600">Billing address</span>
          <textarea
            value={values.billing_address}
            onChange={(e) => onPatch({ billing_address: e.target.value })}
            rows={2}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
          />
        </label>
        <TextField label="Billing city" value={values.billing_city} onChange={(billing_city) => onPatch({ billing_city })} />
        <TextField label="Billing state" value={values.billing_state} onChange={(billing_state) => onPatch({ billing_state })} placeholder="TX" />
        <TextField label="Billing ZIP" value={values.billing_zip} onChange={(billing_zip) => onPatch({ billing_zip })} placeholder="78040" />
      </Section>

      {/* Terms & credit */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Terms &amp; credit</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Payment terms</span>
            <ReferenceSelect
              value={values.payment_terms_id || null}
              onChange={(next) => onPatch({ payment_terms_id: next ?? "" })}
              options={termOptions}
              createKind="payment_term"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select terms"
              onOptionCreated={(opt) => {
                onPaymentTermCreated?.({
                  id: opt.value,
                  terms_name: opt.label.replace(/\s*\(\d+d\)$/, ""),
                  days_until_due: 0,
                });
              }}
            />
          </div>
          <MoneyField label="Credit limit (USD)" value={values.credit_limit} onChange={(credit_limit) => onPatch({ credit_limit })} />
          <SelectField
            label="Credit limit source"
            value={values.credit_limit_source}
            onChange={(v) => onPatch({ credit_limit_source: v as CustomerProfileFormValues["credit_limit_source"] })}
            options={[
              { value: "", label: "— Select source —" },
              { value: "factor", label: "Factor (Faro/RTS sync)" },
              { value: "manual", label: "Manual" },
              { value: "rmis_future", label: "RMIS (future)" },
            ]}
          />
          <div className="block text-sm md:col-span-2" data-testid="customer-default-income-account">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Default income account</span>
            <ReferenceSelect
              options={incomeAccountOptions}
              value={values.default_income_account_id || null}
              onChange={(next) => onPatch({ default_income_account_id: next ?? "" })}
              createKind="account"
              operatingCompanyId={operatingCompanyId}
              placeholder="— None —"
              onOptionCreated={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["catalog-accounts", "income-for-customer-default", operatingCompanyId],
                });
              }}
            />
            <p className="mt-1 text-xs text-gray-500">
              Suggested when creating an invoice line for this customer. You can always change it before
              saving; it is never posted automatically.
            </p>
          </div>
        </div>
      </section>

      {/* AR / AP contacts */}
      <Section title="A/R & A/P contacts">
        <TextField label="Main contact name" value={values.main_contact_name} onChange={(main_contact_name) => onPatch({ main_contact_name })} />
        <TextField label="Main contact title" value={values.main_contact_title} onChange={(main_contact_title) => onPatch({ main_contact_title })} />
        <TextField label="A/R email" type="email" value={values.ar_email} onChange={(ar_email) => onPatch({ ar_email })} />
        <TextField label="A/R phone" value={values.ar_phone} onChange={(ar_phone) => onPatch({ ar_phone })} />
        <TextField label="A/P email" type="email" value={values.ap_email} onChange={(ap_email) => onPatch({ ap_email })} />
        <TextField label="A/P phone" value={values.ap_phone} onChange={(ap_phone) => onPatch({ ap_phone })} />
        <TextField label="Cc email (invoice copy)" type="email" value={values.cc_email} onChange={(cc_email) => onPatch({ cc_email })} />
        <TextField label="Bcc email (invoice copy)" type="email" value={values.bcc_email} onChange={(bcc_email) => onPatch({ bcc_email })} />
        <TextField
          label="Print on invoice as"
          value={values.print_on_invoice_name}
          onChange={(print_on_invoice_name) => onPatch({ print_on_invoice_name })}
          placeholder="Leave blank to use the customer display name"
        />
      </Section>

      {/* Shipping address */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Shipping address</h3>
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            name="shipping_same_as_billing"
            type="checkbox"
            checked={values.shipping_same_as_billing}
            onChange={(e) => onPatch({ shipping_same_as_billing: e.target.checked })}
          />
          Ship to is the same as the billing address
        </label>
        {!values.shipping_same_as_billing ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Shipping street</span>
              <input
                value={values.shipping_address_line1}
                onChange={(e) => onPatch({ shipping_address_line1: e.target.value })}
                className="h-9 w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </label>
            <TextField label="Shipping address line 2" value={values.shipping_address_line2} onChange={(shipping_address_line2) => onPatch({ shipping_address_line2 })} />
            <TextField label="Shipping city" value={values.shipping_city} onChange={(shipping_city) => onPatch({ shipping_city })} />
            <TextField label="Shipping state" value={values.shipping_state} onChange={(shipping_state) => onPatch({ shipping_state })} placeholder="TX" />
            <TextField label="Shipping ZIP / postal code" value={values.shipping_postal_code} onChange={(shipping_postal_code) => onPatch({ shipping_postal_code })} />
            <TextField label="Shipping country" value={values.shipping_country} onChange={(shipping_country) => onPatch({ shipping_country })} placeholder="US" />
          </div>
        ) : null}
      </section>

      {/* Preferences */}
      <Section title="Preferences">
        <SelectField
          label="Preferred delivery method"
          value={values.preferred_delivery_method}
          onChange={(v) => onPatch({ preferred_delivery_method: v as CustomerProfileFormValues["preferred_delivery_method"] })}
          options={[
            { value: "email", label: "Email" },
            { value: "print", label: "Print" },
            { value: "none", label: "None" },
          ]}
        />
        <SelectField
          label="Preferred payment method"
          value={values.preferred_payment_method}
          onChange={(v) => onPatch({ preferred_payment_method: v as CustomerProfileFormValues["preferred_payment_method"] })}
          options={[
            { value: "", label: "— Select —" },
            { value: "check", label: "Check" },
            { value: "ach", label: "ACH" },
            { value: "credit_card", label: "Credit card" },
            { value: "cash", label: "Cash" },
            { value: "other", label: "Other" },
          ]}
        />
        <SelectField
          label="Customer language"
          value={values.preferred_language}
          onChange={(v) => onPatch({ preferred_language: v as CustomerProfileFormValues["preferred_language"] })}
          options={[
            { value: "en", label: "English" },
            { value: "es", label: "Español" },
          ]}
        />
      </Section>

      {/* Tax */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Tax</h3>
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            name="tax_exempt"
            type="checkbox"
            checked={values.tax_exempt}
            onChange={(e) => onPatch({ tax_exempt: e.target.checked })}
          />
          Tax exempt
        </label>
        {values.tax_exempt ? (
          <TextField
            label="Exemption reason / certificate on file"
            value={values.tax_exempt_reason}
            onChange={(tax_exempt_reason) => onPatch({ tax_exempt_reason })}
          />
        ) : null}
      </section>

      {/* Detention & free time */}
      <Section title="Detention & free-time defaults">
        <TextField label="Free time — pickup (min)" type="number" value={values.free_time_pickup_minutes} onChange={(free_time_pickup_minutes) => onPatch({ free_time_pickup_minutes })} />
        <TextField label="Free time — delivery (min)" type="number" value={values.free_time_delivery_minutes} onChange={(free_time_delivery_minutes) => onPatch({ free_time_delivery_minutes })} />
        <MoneyField label="Detention rate ($/hr)" value={values.detention_rate_per_hour} onChange={(detention_rate_per_hour) => onPatch({ detention_rate_per_hour })} />
        <SelectField
          label="Default miles basis"
          value={values.default_billing_miles_basis}
          onChange={(v) => onPatch({ default_billing_miles_basis: v as CustomerProfileFormValues["default_billing_miles_basis"] })}
          options={[
            { value: "", label: "— Select basis —" },
            { value: "practical_miles", label: "Practical miles" },
            { value: "short_miles", label: "Short miles" },
          ]}
        />
      </Section>

      {/* Factoring */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Factoring</h3>
        <label className="mb-2 flex items-center gap-2 text-sm text-gray-700">
          <input
            name="factoring_eligible"
            type="checkbox"
            checked={values.factoring_eligible}
            onChange={(e) => onPatch({ factoring_eligible: e.target.checked })}
          />
          Factoring eligible
        </label>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Factoring company</span>
            <EntityPicker
              kind="vendor"
              allowCreate
              operatingCompanyId={operatingCompanyId}
              value={values.factoring_company_vendor_id || null}
              onChange={(value) => onPatch({ factoring_company_vendor_id: value ?? "" })}
              placeholder="Search factoring company…"
              dataField="customer-factoring-company-vendor"
            />
          </label>
          <SelectField
            label="Recourse type"
            value={values.factoring_recourse_type}
            onChange={(v) => onPatch({ factoring_recourse_type: v as CustomerProfileFormValues["factoring_recourse_type"] })}
            options={[
              { value: "", label: "— Select —" },
              { value: "recourse", label: "Recourse" },
              { value: "non_recourse", label: "Non-recourse" },
            ]}
          />
          <TextField label="Advance rate override (%)" type="number" value={values.factoring_advance_rate_override} onChange={(factoring_advance_rate_override) => onPatch({ factoring_advance_rate_override })} />
          <TextField label="Reserve % override" type="number" value={values.factoring_reserve_pct_override} onChange={(factoring_reserve_pct_override) => onPatch({ factoring_reserve_pct_override })} />
          <label className="block text-sm md:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Factoring notes</span>
            <textarea
              value={values.factoring_notes}
              onChange={(e) => onPatch({ factoring_notes: e.target.value })}
              rows={2}
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
            />
          </label>
        </div>
      </section>

      {/* Notes */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h3>
        <textarea
          value={values.notes}
          onChange={(e) => onPatch({ notes: e.target.value })}
          rows={3}
          className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
        />
      </section>

      {mode === "edit" ? (
        <section className="border-t border-gray-200 pt-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Status</h3>
          <SelectField
            label="Status"
            value={values.status}
            onChange={(v) => onPatch({ status: v as Customer["status"] })}
            options={[
              { value: "active", label: "Active" },
              { value: "inactive", label: "Inactive" },
              { value: "credit_hold", label: "Credit hold" },
              { value: "blacklist", label: "Blacklist" },
            ]}
          />
        </section>
      ) : null}

    </div>
  );
}
