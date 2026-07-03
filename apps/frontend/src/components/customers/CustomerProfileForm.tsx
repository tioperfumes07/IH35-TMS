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
 * Create/UpdateCustomerInput. QBO fields that have no column yet (sub-customer,
 * Cc/Bcc, name-to-print-on-checks, shipping address, payment method, delivery
 * method, language, tax-exemption details, attachments, communication
 * permissions) are surfaced in a labelled "Pending backend" note rather than as
 * silent inputs that would drop data — those are flagged follow-ups (need a
 * migration; out of scope for this non-financial UI block).
 */
import { useMemo, useState, type ReactNode } from "react";
import { Combobox } from "../Combobox";
import { Button } from "../Button";
import { createPaymentTermOption, type CreateCustomerInput, type Customer, type PaymentTermOption, type UpdateCustomerInput } from "../../api/mdata";
import type { CustomerType, MilesBasis } from "../../types/api";

export type CustomerProfileFormValues = {
  // Name & contact
  name: string;
  customer_type: "" | CustomerType;
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
  billing_state: string;
  // Terms & credit
  payment_terms_id: string;
  credit_limit: string;
  credit_limit_source: "" | "factor" | "manual" | "rmis_future";
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
  factoring_recourse_type: "" | "recourse" | "non_recourse";
  factoring_advance_rate_override: string;
  factoring_reserve_pct_override: string;
  factoring_notes: string;
  // Notes
  notes: string;
  // Status (edit only)
  status: Customer["status"];
};

export function emptyCustomerProfileValues(): CustomerProfileFormValues {
  return {
    name: "",
    customer_type: "",
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
    billing_state: "",
    payment_terms_id: "",
    credit_limit: "",
    credit_limit_source: "",
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
    factoring_recourse_type: "",
    factoring_advance_rate_override: "",
    factoring_reserve_pct_override: "",
    factoring_notes: "",
    notes: "",
    status: "active",
  };
}

export function customerToProfileValues(c: Customer): CustomerProfileFormValues {
  const str = (v: string | number | null | undefined) => (v == null ? "" : String(v));
  return {
    name: str(c.name),
    customer_type: c.customer_type ?? "",
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
    billing_state: str(c.billing_state),
    payment_terms_id: str(c.payment_terms_id),
    credit_limit: str(c.credit_limit),
    credit_limit_source: c.credit_limit_source ?? "",
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
    factoring_recourse_type: c.factoring_recourse_type ?? "",
    factoring_advance_rate_override: str(c.factoring_advance_rate_override),
    factoring_reserve_pct_override: str(c.factoring_reserve_pct_override),
    factoring_notes: str(c.factoring_notes),
    notes: str(c.notes),
    status: c.status,
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

export function profileValuesToCreatePayload(v: CustomerProfileFormValues, operatingCompanyId: string): CreateCustomerInput {
  const name = v.name.trim();
  return {
    name,
    legal_name: name,
    customer_code: trimOrUndef(v.customer_code),
    customer_type: v.customer_type || undefined,
    email: trimOrUndef(v.email),
    phone: trimOrUndef(v.phone),
    website: trimOrUndef(v.website),
    fax_phone: trimOrUndef(v.fax_phone),
    mc_number: trimOrUndef(v.mc_number),
    dot_number: trimOrUndef(v.dot_number),
    tax_id: trimOrUndef(v.tax_id),
    billing_address: trimOrUndef(v.billing_address),
    billing_state: trimOrUndef(v.billing_state),
    payment_terms_id: v.payment_terms_id || null,
    credit_limit: numOrUndef(v.credit_limit),
    credit_limit_source: v.credit_limit_source || null,
    main_contact_name: trimOrUndef(v.main_contact_name),
    main_contact_title: trimOrUndef(v.main_contact_title),
    main_contact_mobile: trimOrUndef(v.mobile),
    ar_email: trimOrUndef(v.ar_email),
    ar_phone: trimOrUndef(v.ar_phone),
    ap_email: trimOrUndef(v.ap_email),
    ap_phone: trimOrUndef(v.ap_phone),
    free_time_pickup_minutes: numOrUndef(v.free_time_pickup_minutes),
    free_time_delivery_minutes: numOrUndef(v.free_time_delivery_minutes),
    detention_rate_per_hour: numOrUndef(v.detention_rate_per_hour),
    default_billing_miles_basis: v.default_billing_miles_basis || undefined,
    factoring_eligible: v.factoring_eligible,
    factoring_recourse_type: v.factoring_recourse_type || null,
    factoring_advance_rate_override: numOrNull(v.factoring_advance_rate_override),
    factoring_reserve_pct_override: numOrNull(v.factoring_reserve_pct_override),
    factoring_notes: trimOrUndef(v.factoring_notes),
    notes: trimOrUndef(v.notes),
    operating_company_id: operatingCompanyId,
  };
}

export function profileValuesToUpdatePayload(v: CustomerProfileFormValues): UpdateCustomerInput {
  const name = v.name.trim();
  return {
    name,
    customer_code: trimOrNull(v.customer_code),
    customer_type: v.customer_type || null,
    email: trimOrNull(v.email),
    phone: trimOrNull(v.phone),
    website: trimOrNull(v.website),
    fax_phone: trimOrNull(v.fax_phone),
    mc_number: trimOrNull(v.mc_number),
    dot_number: trimOrNull(v.dot_number),
    tax_id: trimOrNull(v.tax_id),
    billing_address: trimOrNull(v.billing_address),
    billing_state: trimOrNull(v.billing_state),
    payment_terms_id: v.payment_terms_id || null,
    credit_limit: numOrNull(v.credit_limit),
    credit_limit_source: v.credit_limit_source || null,
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
    factoring_recourse_type: v.factoring_recourse_type || null,
    factoring_advance_rate_override: numOrNull(v.factoring_advance_rate_override),
    factoring_reserve_pct_override: numOrNull(v.factoring_reserve_pct_override),
    factoring_notes: trimOrNull(v.factoring_notes),
    notes: trimOrNull(v.notes),
    status: v.status,
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

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-gray-600">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
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

type Props = {
  values: CustomerProfileFormValues;
  onPatch: (patch: Partial<CustomerProfileFormValues>) => void;
  operatingCompanyId: string;
  mode: "create" | "edit";
  paymentTermOptions: PaymentTermOption[];
  onPaymentTermCreated?: (term: PaymentTermOption) => void;
};

export function CustomerProfileForm({ values, onPatch, mode, paymentTermOptions, onPaymentTermCreated }: Props) {
  const [localTerms, setLocalTerms] = useState<PaymentTermOption[]>([]);
  const [addTermOpen, setAddTermOpen] = useState(false);
  const [newTermName, setNewTermName] = useState("");
  const [newTermDays, setNewTermDays] = useState("30");
  const [savingTerm, setSavingTerm] = useState(false);
  const [termError, setTermError] = useState("");

  const termOptions = useMemo(() => {
    const merged = [...paymentTermOptions, ...localTerms];
    return merged.map((t) => ({ value: t.id, label: `${t.terms_name} (${t.days_until_due}d)` }));
  }, [paymentTermOptions, localTerms]);

  async function saveNewTerm() {
    const name = newTermName.trim();
    const days = Number(newTermDays);
    if (!name) {
      setTermError("Name is required.");
      return;
    }
    if (Number.isNaN(days) || days < 0) {
      setTermError("Days must be a non-negative number.");
      return;
    }
    setSavingTerm(true);
    setTermError("");
    try {
      const created = await createPaymentTermOption({ terms_name: name, days_until_due: days });
      setLocalTerms((prev) => [...prev, created]);
      onPaymentTermCreated?.(created);
      onPatch({ payment_terms_id: created.id });
      setAddTermOpen(false);
      setNewTermName("");
      setNewTermDays("30");
    } catch (err) {
      setTermError(String((err as Error)?.message || "Could not create payment term."));
    } finally {
      setSavingTerm(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Name & contact */}
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Name &amp; contact</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <TextField label="Customer display name" dataField="legal_name" value={values.name} onChange={(name) => onPatch({ name })} required />
          <SelectField
            label="Customer type"
            value={values.customer_type}
            onChange={(customer_type) => onPatch({ customer_type: customer_type as CustomerProfileFormValues["customer_type"] })}
            options={[
              { value: "", label: "— Select type —" },
              { value: "broker", label: "Broker" },
              { value: "direct_shipper", label: "Direct shipper" },
            ]}
          />
          <TextField label="Email" type="email" value={values.email} onChange={(email) => onPatch({ email })} />
          <TextField label="Phone" value={values.phone} onChange={(phone) => onPatch({ phone })} />
          <TextField label="Mobile" value={values.mobile} onChange={(mobile) => onPatch({ mobile })} />
          <TextField label="Fax" value={values.fax_phone} onChange={(fax_phone) => onPatch({ fax_phone })} />
          <TextField label="Website" value={values.website} onChange={(website) => onPatch({ website })} />
          <TextField label="Customer code" value={values.customer_code} onChange={(customer_code) => onPatch({ customer_code })} />
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
        <TextField label="Billing state" value={values.billing_state} onChange={(billing_state) => onPatch({ billing_state })} placeholder="TX" />
      </Section>

      {/* Terms & credit */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Terms &amp; credit</h3>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          <div className="block text-sm">
            <span className="mb-1 block text-xs font-semibold text-gray-600">Payment terms</span>
            <Combobox
              options={termOptions}
              value={values.payment_terms_id || null}
              onChange={(next) => onPatch({ payment_terms_id: next ?? "" })}
              placeholder="Select terms"
              allowAddNew={{ label: "+ Add new payment term", onAdd: () => setAddTermOpen(true) }}
            />
            {addTermOpen ? (
              <div className="mt-2 rounded-sm border border-gray-300 bg-gray-50 p-2">
                <p className="mb-2 text-xs font-semibold text-gray-600">New payment term</p>
                {termError ? <p className="mb-2 text-xs text-red-700">{termError}</p> : null}
                <div className="grid grid-cols-2 gap-2">
                  <TextField label="Terms name" value={newTermName} onChange={setNewTermName} placeholder="Net 30" />
                  <TextField label="Days until due" type="number" value={newTermDays} onChange={setNewTermDays} />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" variant="secondary" onClick={() => setAddTermOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" disabled={savingTerm} onClick={() => void saveNewTerm()}>
                    {savingTerm ? "Saving…" : "Add term"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
          <TextField label="Credit limit (USD)" type="number" value={values.credit_limit} onChange={(credit_limit) => onPatch({ credit_limit })} />
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
      </Section>

      {/* Detention & free time */}
      <Section title="Detention & free-time defaults">
        <TextField label="Free time — pickup (min)" type="number" value={values.free_time_pickup_minutes} onChange={(free_time_pickup_minutes) => onPatch({ free_time_pickup_minutes })} />
        <TextField label="Free time — delivery (min)" type="number" value={values.free_time_delivery_minutes} onChange={(free_time_delivery_minutes) => onPatch({ free_time_delivery_minutes })} />
        <TextField label="Detention rate ($/hr)" type="number" value={values.detention_rate_per_hour} onChange={(detention_rate_per_hour) => onPatch({ detention_rate_per_hour })} />
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

      {/* QuickBooks fields pending backend — honest follow-up, no silent data loss */}
      <section className="border-t border-gray-200 pt-3">
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">QuickBooks fields — pending backend</h3>
        <p className="text-xs text-gray-500">
          These QBO parity fields have no <code className="text-gray-600">mdata.customers</code> column yet and are a
          gated follow-up (needs a migration): sub-customer, Cc/Bcc email, name-to-print-on-checks, structured
          shipping address, payment method, preferred delivery method, customer language, tax-exemption details,
          attachments, and communication permissions. They are intentionally not shown as inputs here so no data is
          silently dropped.
        </p>
      </section>
    </div>
  );
}
