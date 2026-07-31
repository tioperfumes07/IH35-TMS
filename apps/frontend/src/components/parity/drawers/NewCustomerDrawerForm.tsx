/**
 * BK7 — New Customer drawer form (type-aware contact + sub-customer + comms).
 * OPERATIONAL gate: customer create is non-financial.
 */
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createCustomer, listCustomers } from "../../../api/mdata";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";
import { ReferenceSelect } from "../ReferenceSelect";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

type FormState = {
  displayName: string;
  companyName: string;
  customerType: "" | "broker" | "direct_shipper";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  isSubCustomer: boolean;
  parentCustomerId: string; // D1-4: the selected parent's real customer id (not free text)
  emailConsent: boolean;
  billingLine1: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  sameAsShipping: boolean;
};

export function NewCustomerDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    displayName: "", companyName: "", customerType: "", firstName: "", lastName: "",
    email: "", phone: "", mobile: "", website: "",
    isSubCustomer: false, parentCustomerId: "",
    emailConsent: false,
    billingLine1: "", billingCity: "", billingState: "", billingZip: "",
    sameAsShipping: true,
  });

  function set<K extends keyof FormState>(key: K, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // D1-4: candidate parents = active, TOP-LEVEL customers in this company (a parent can never itself
  // be a sub-customer, so drop any row that already has a parent_customer_id). Loaded lazily only when
  // the "is a sub-customer" box is checked.
  const parentQuery = useQuery({
    queryKey: ["customer-parent-options", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 5000 }).then((r) => r.customers),
    enabled: Boolean(operatingCompanyId) && form.isSubCustomer,
    staleTime: 60_000,
  });
  const parentOptions = useMemo(
    () =>
      (parentQuery.data ?? [])
        .filter((c) => !c.parent_customer_id && c.status !== "inactive")
        .map((c) => ({
          value: c.id,
          label: c.customer_code ? `${c.name} (${c.customer_code})` : c.name,
        })),
    [parentQuery.data]
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = form.displayName.trim() || `${form.firstName} ${form.lastName}`.trim() || form.companyName.trim();
    if (!displayName) { pushToast("Customer display name is required.", "error"); return; }
    // D1-5: customer_type is REQUIRED by the create endpoint (POST /api/v1/mdata/customers rejects a
    // missing type). Block client-side so the user gets an inline message instead of a raw 400, and so
    // the field's "*" marker is actually enforced.
    if (!form.customerType) { pushToast("Customer type is required.", "error"); return; }
    // D1-4: a sub-customer with no parent selected is invalid — the "Parent customer *" marker was never
    // enforced before (submit went through and the parent was silently dropped). Block submit here.
    if (form.isSubCustomer && !form.parentCustomerId) {
      pushToast("Parent customer is required for a sub-customer.", "error");
      return;
    }
    setSaving(true);
    try {
      // D1-1: write to the REAL mdata.customers table (POST /api/v1/mdata/customers — the same
      // endpoint the full Customers page create uses) so the returned id is a bookable/invoiceable
      // FK. Previously this wrote to the QBO mirror (mdata.qbo_customers) that no customer picker/
      // search/list reads, so an inline-created customer never appeared and its id was dangling.
      const res = await createCustomer({
        name: displayName,
        operating_company_id: operatingCompanyId,
        customer_type: form.customerType,
        // D1-4: persist the REAL parent hard link (parent_customer_id column added by migration
        // 202607050820). Only sent when this is a sub-customer; the backend re-validates it.
        parent_customer_id: form.isSubCustomer ? form.parentCustomerId : undefined,
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        website: form.website.trim() || undefined,
        billing_address: form.billingLine1.trim() || undefined,
        billing_state: form.billingState.trim() || undefined,
        main_contact_name: `${form.firstName} ${form.lastName}`.trim() || undefined,
        main_contact_email: form.email.trim() || undefined,
        main_contact_phone: form.phone.trim() || undefined,
        main_contact_mobile: form.mobile.trim() || undefined,
      });
      onCreated({ id: String(res.id), label: displayName });
      pushToast("Customer created", "success");
      onClose();
    } catch (err) {
      pushToast(String((err as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">First name</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Last name</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Company name</span>
        <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Customer type *</span>
        <select
          name="customer_type"
          className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm"
          value={form.customerType}
          aria-required
          onChange={(e) => set("customerType", e.target.value)}
        >
          <option value="">— Select type —</option>
          <option value="broker">Broker</option>
          <option value="direct_shipper">Direct shipper</option>
        </select>
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Display name *</span>
        <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="How this customer appears on transactions" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Email</span>
        <input type="email" className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Phone</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Mobile</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.emailConsent} onChange={(e) => set("emailConsent", e.target.checked)} className="h-4 w-4 rounded-sm border-gray-300" />
        This customer has consented to receive email
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.isSubCustomer} onChange={(e) => set("isSubCustomer", e.target.checked)} className="h-4 w-4 rounded-sm border-gray-300" />
        Is a sub-customer
      </label>
      {form.isSubCustomer && (
        <label className="block" data-testid="customer-parent-select">
          <span className="text-xs font-medium text-gray-700">Parent customer *</span>
          {/* LST-PICKER-01: bare <select> → ReferenceSelect createKind=customer (mdata.customers). */}
          <div className="mt-1">
            <ReferenceSelect
              value={form.parentCustomerId || null}
              onChange={(next) => set("parentCustomerId", next ?? "")}
              options={parentOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              loading={parentQuery.isLoading}
              placeholder={parentQuery.isLoading ? "Loading customers…" : "— Select parent —"}
              addNewLabel="+ Add new parent customer"
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["customer-parent-options", operatingCompanyId] });
              }}
            />
          </div>
        </label>
      )}
      <fieldset className="rounded-sm border border-gray-200 p-3">
        <legend className="px-1 text-xs font-medium text-gray-500">Billing address</legend>
        <div className="flex flex-col gap-2">
          <input className="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="Street" value={form.billingLine1} onChange={(e) => set("billingLine1", e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <input className="col-span-2 rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="City" value={form.billingCity} onChange={(e) => set("billingCity", e.target.value)} />
            <input className="rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="State" value={form.billingState} onChange={(e) => set("billingState", e.target.value)} maxLength={2} />
          </div>
          <input className="w-full rounded-sm border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="ZIP" value={form.billingZip} onChange={(e) => set("billingZip", e.target.value)} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.sameAsShipping} onChange={(e) => set("sameAsShipping", e.target.checked)} className="h-4 w-4 rounded-sm border-gray-300" />
          Same as shipping
        </label>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded-sm border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-sm bg-[#1f2a44] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-[#0f1729]">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
