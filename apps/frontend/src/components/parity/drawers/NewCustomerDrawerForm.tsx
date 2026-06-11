/**
 * BK7 — New Customer drawer form (type-aware contact + sub-customer + comms).
 * OPERATIONAL gate: customer create is non-financial.
 */
import { useState } from "react";
import { createQboCustomer } from "../../../api/qbo-mdata";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

type FormState = {
  displayName: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  website: string;
  isSubCustomer: boolean;
  parentCustomer: string;
  emailConsent: boolean;
  billingLine1: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  sameAsShipping: boolean;
};

export function NewCustomerDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    displayName: "", companyName: "", firstName: "", lastName: "",
    email: "", phone: "", mobile: "", website: "",
    isSubCustomer: false, parentCustomer: "",
    emailConsent: false,
    billingLine1: "", billingCity: "", billingState: "", billingZip: "",
    sameAsShipping: true,
  });

  function set<K extends keyof FormState>(key: K, value: string | boolean) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const displayName = form.displayName.trim() || `${form.firstName} ${form.lastName}`.trim() || form.companyName.trim();
    if (!displayName) { pushToast("Customer display name is required.", "error"); return; }
    setSaving(true);
    try {
      const res = await createQboCustomer(operatingCompanyId, {
        display_name: displayName,
        company_name: form.companyName.trim() || undefined,
        primary_email: form.email.trim() || undefined,
        primary_phone: form.phone.trim() || undefined,
      });
      onCreated({ id: String(res.customer.id), label: displayName });
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
          <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} autoFocus />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Last name</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </label>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Company name</span>
        <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.companyName} onChange={(e) => set("companyName", e.target.value)} />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Display name *</span>
        <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.displayName} onChange={(e) => set("displayName", e.target.value)} placeholder="How this customer appears on transactions" />
      </label>
      <label className="block">
        <span className="text-xs font-medium text-gray-700">Email</span>
        <input type="email" className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.email} onChange={(e) => set("email", e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Phone</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Mobile</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.emailConsent} onChange={(e) => set("emailConsent", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
        This customer has consented to receive email
      </label>
      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={form.isSubCustomer} onChange={(e) => set("isSubCustomer", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
        Is a sub-customer
      </label>
      {form.isSubCustomer && (
        <label className="block">
          <span className="text-xs font-medium text-gray-700">Parent customer *</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" value={form.parentCustomer} onChange={(e) => set("parentCustomer", e.target.value)} placeholder="Parent customer name" />
        </label>
      )}
      <fieldset className="rounded border border-gray-200 p-3">
        <legend className="px-1 text-xs font-medium text-gray-500">Billing address</legend>
        <div className="flex flex-col gap-2">
          <input className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="Street" value={form.billingLine1} onChange={(e) => set("billingLine1", e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <input className="col-span-2 rounded border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="City" value={form.billingCity} onChange={(e) => set("billingCity", e.target.value)} />
            <input className="rounded border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="State" value={form.billingState} onChange={(e) => set("billingState", e.target.value)} maxLength={2} />
          </div>
          <input className="w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm" placeholder="ZIP" value={form.billingZip} onChange={(e) => set("billingZip", e.target.value)} />
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={form.sameAsShipping} onChange={(e) => set("sameAsShipping", e.target.checked)} className="h-4 w-4 rounded border-gray-300" />
          Same as shipping
        </label>
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button type="button" onClick={onClose} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={saving} className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 hover:bg-emerald-700">
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
