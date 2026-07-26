import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../api/client";
import { createVendor, type CreateVendorInput } from "../../api/mdata";
import { listPaymentTermOptions } from "../../api/mdata";
import { listCatalogAccounts } from "../../api/catalog-accounts";
import { Modal } from "../Modal";
import { ActionButton } from "../shared/ActionButton";
import { SelectCombobox } from "../shared/SelectCombobox";
import { Combobox } from "../Combobox";
import { useToast } from "../Toast";
import { emptyVendorProfileMeta, serializeVendorNotes, type VendorProfileMeta } from "../../lib/vendorProfileMeta";
import { isTestVendorFixtureName } from "../../lib/testVendorFixtureName";

// V4/V5 — full QuickBooks-style vendor creator (QBO parity spec §1B: Name and contact / Address / Notes),
// extended with the trucking classification fields (vendor type / tax ID / vendor code) the profile edits.
// The lean structured-contact + address fields serialize into the same `notes` meta blob the Vendor
// profile reads, so anything captured here round-trips to the profile (VendorDetail) with no migration.
// NOTE (V1 follow-up): vendor_type is a fixed enum today — a catalog-backed vendor-type list with an
// inline "+ Add new type" mini-create needs catalogs.vendor_types (gated migration), tracked separately.

const VENDOR_TYPES: CreateVendorInput["vendor_type"][] = [
  "Fuel",
  "Repair",
  "Tires",
  "Towing",
  "Insurance",
  "Permit",
  "Toll",
  "Other",
];

type SectionProps = { title: string; children: React.ReactNode };

function Section({ title, children }: SectionProps) {
  // Flat section: a single label + a field grid. No nested bordered card (no box-within-box).
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h3>
      {children}
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  dataField?: string;
  errorId?: string;
  error?: string;
};

function Field({ label, value, onChange, placeholder, required, dataField, errorId, error }: FieldProps) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-semibold text-gray-600">
        {label}
        {required ? " *" : ""}
      </span>
      <input
        data-field={dataField}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-sm border border-gray-300 px-2 py-1.5"
      />
      {error ? (
        <span id={errorId} className="mt-1 block text-xs text-red-700">
          {error}
        </span>
      ) : null}
    </label>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
};

export function VendorCreateModal({ open, onClose, operatingCompanyId }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  // Name and contact
  const [name, setName] = useState("");
  const [vendorType, setVendorType] = useState<CreateVendorInput["vendor_type"]>("Other");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactTitle, setContactTitle] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  // Address (structured → single address string, matching the profile's one-line address column)
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  // Classification
  const [taxId, setTaxId] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
  const [website, setWebsite] = useState("");
  const [printOnCheckName, setPrintOnCheckName] = useState("");
  const [eligible1099, setEligible1099] = useState(false);
  const [paymentTermsId, setPaymentTermsId] = useState<string | null>(null);
  const [defaultExpenseAccountId, setDefaultExpenseAccountId] = useState<string | null>(null);
  // Notes
  const [notes, setNotes] = useState("");

  const [formError, setFormError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; vendor_code?: string }>({});

  const paymentTermsQuery = useQuery({
    queryKey: ["payment-term-options", operatingCompanyId],
    queryFn: () => listPaymentTermOptions(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const paymentTermOptions = useMemo(
    () => (paymentTermsQuery.data?.payment_terms ?? []).map((t) => ({ value: t.id, label: `${t.terms_name} (${t.days_until_due}d)` })),
    [paymentTermsQuery.data]
  );
  // Option-B (vendor-customer-categorization-option-b): recommendation only, pre-fills bill lines.
  const expenseAccountsQuery = useQuery({
    queryKey: ["catalog-accounts", "expense-for-vendor-default", operatingCompanyId],
    // LST-F14: default expense account is a posting target — postable_only.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 5 * 60 * 1000,
  });
  const expenseAccountOptions = useMemo(
    () =>
      (expenseAccountsQuery.data?.accounts ?? [])
        .filter((a) => a.account_type === "Expense")
        .map((a) => ({ value: a.id, label: a.account_name })),
    [expenseAccountsQuery.data]
  );

  function reset() {
    setName("");
    setVendorType("Other");
    setEmail("");
    setPhone("");
    setContactName("");
    setContactTitle("");
    setContactPhone("");
    setContactEmail("");
    setStreet("");
    setCity("");
    setState("");
    setZip("");
    setTaxId("");
    setVendorCode("");
    setWebsite("");
    setPrintOnCheckName("");
    setEligible1099(false);
    setPaymentTermsId(null);
    setDefaultExpenseAccountId(null);
    setNotes("");
    setFormError("");
    setFieldErrors({});
  }

  function composeAddress() {
    const cityState = [city.trim(), state.trim()].filter(Boolean).join(", ");
    return [street.trim(), cityState, zip.trim()].filter(Boolean).join(", ");
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const displayName = name.trim();
      if (!displayName) {
        const error = new Error("Vendor name is required.");
        (error as Error & { code?: string }).code = "name_required";
        throw error;
      }
      if (import.meta.env.PROD && isTestVendorFixtureName(displayName)) {
        const error = new Error("TEST-VENDOR fixture names are not allowed in production.");
        (error as Error & { code?: string }).code = "mdata_vendor_test_fixture_rejected";
        throw error;
      }
      const address = composeAddress();
      const meta: VendorProfileMeta = {
        ...emptyVendorProfileMeta(),
        telephone: phone.trim(),
        address,
        generalEmail: email.trim(),
        primaryContactName: contactName.trim(),
        primaryContactTitle: contactTitle.trim(),
        primaryContactPhone: contactPhone.trim(),
        primaryContactEmail: contactEmail.trim(),
      };
      return createVendor({
        name: displayName,
        vendor_type: vendorType,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        postal_code: zip.trim() || undefined,
        tax_id: taxId.trim() || undefined,
        vendor_code: vendorCode.trim() || undefined,
        operating_company_id: operatingCompanyId,
        notes: serializeVendorNotes(meta, notes.trim()),
        // VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD)
        website: website.trim() || undefined,
        print_on_check_name: printOnCheckName.trim() || undefined,
        eligible_1099: eligible1099,
        payment_terms_id: paymentTermsId,
        default_expense_account_id: defaultExpenseAccountId,
      });
    },
    onSuccess: async (vendor) => {
      await queryClient.invalidateQueries({ queryKey: ["vendors"] });
      pushToast("Vendor created.", "success");
      reset();
      onClose();
      if (vendor?.id) navigate(`/vendors/${vendor.id}`);
    },
    onError: (error) => {
      setFormError("");
      setFieldErrors({});
      if ((error as Error & { code?: string }).code === "name_required") {
        setFieldErrors({ name: "Vendor name is required" });
        return;
      }
      if ((error as Error & { code?: string }).code === "mdata_vendor_test_fixture_rejected") {
        setFieldErrors({ name: "TEST-VENDOR fixture names are not allowed in production" });
        return;
      }
      if (error instanceof ApiError && error.status === 409) {
        setFormError("Could not save vendor.");
        setFieldErrors({ vendor_code: "Already in use" });
        pushToast("Could not save vendor: duplicate vendor record.", "error");
        return;
      }
      setFormError("Could not save vendor.");
      pushToast(String((error as Error)?.message || "Could not save vendor."), "error");
    },
  });

  // C7: this is the only converted surface that also passed `wide`. The prop is KEPT (additive —
  // C7 removes nothing) but has no effect in the drawer variant, which is a fixed 480px column.
  // Create Vendor was NOT one of the two owner-ratified wide-wizard exceptions.
  return (
    <Modal variant="drawer" open={open} onClose={onClose} title="Create Vendor" wide>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          setFormError("");
          setFieldErrors({});
          createMutation.mutate();
        }}
      >
        {formError ? (
          <div role="alert" className="rounded-sm border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
            {formError}
          </div>
        ) : null}

        <Section title="Name and contact">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Field
              label="Vendor display name"
              value={name}
              onChange={setName}
              required
              dataField="name"
              errorId="vendor_name-error"
              error={fieldErrors.name}
            />
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Vendor type</span>
              <SelectCombobox
                value={vendorType}
                onChange={(event) => setVendorType(event.target.value as CreateVendorInput["vendor_type"])}
                className="h-9 w-full text-sm"
              >
                {VENDOR_TYPES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </SelectCombobox>
            </label>
            <Field label="Email" value={email} onChange={setEmail} />
            <Field label="Phone" value={phone} onChange={setPhone} />
            <Field label="Contact name" value={contactName} onChange={setContactName} />
            <Field label="Contact title" value={contactTitle} onChange={setContactTitle} />
            <Field label="Contact phone" value={contactPhone} onChange={setContactPhone} />
            <Field label="Contact email" value={contactEmail} onChange={setContactEmail} />
          </div>
        </Section>

        <Section title="Address">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <div className="md:col-span-2">
              <Field label="Street" value={street} onChange={setStreet} />
            </div>
            <Field label="City" value={city} onChange={setCity} />
            <div className="grid grid-cols-2 gap-2">
              <Field label="State" value={state} onChange={setState} />
              <Field label="ZIP" value={zip} onChange={setZip} />
            </div>
          </div>
        </Section>

        <Section title="Classification">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <Field label="Tax ID" value={taxId} onChange={setTaxId} />
            <Field
              label="Vendor code"
              value={vendorCode}
              onChange={setVendorCode}
              dataField="vendor_code"
              errorId="vendor_code-error"
              error={fieldErrors.vendor_code}
            />
            <Field label="Website" value={website} onChange={setWebsite} />
            <Field label="Print on check as" value={printOnCheckName} onChange={setPrintOnCheckName} placeholder="Leave blank to use vendor display name" />
            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input type="checkbox" checked={eligible1099} onChange={(event) => setEligible1099(event.target.checked)} />
              Track payments for 1099 (Form 1099-NEC)
            </label>
          </div>
        </Section>

        {/* VENDOR-CUSTOMER-QBO-PARITY (migration 202607110230, HELD) */}
        <Section title="Terms & Option-B recommendation">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Payment terms</span>
              <Combobox options={paymentTermOptions} value={paymentTermsId} onChange={setPaymentTermsId} placeholder="Select terms" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Default expense account</span>
              <Combobox options={expenseAccountOptions} value={defaultExpenseAccountId} onChange={setDefaultExpenseAccountId} placeholder="— None —" />
              <p className="mt-1 text-xs text-gray-500">
                Recommendation only: pre-fills the expense account on new bills for this vendor. Always
                editable — never posted silently.
              </p>
            </label>
          </div>
        </Section>

        <Section title="Notes">
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
          />
        </Section>

        <div className="flex justify-end gap-2">
          <ActionButton type="button" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton type="submit" disabled={createMutation.isPending || !operatingCompanyId}>
            {createMutation.isPending ? "Saving..." : "Save"}
          </ActionButton>
        </div>
      </form>
    </Modal>
  );
}
