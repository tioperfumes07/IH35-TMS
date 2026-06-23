import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createPartsInventoryPurchase } from "../../../api/maintenance";
import { createQboAccount, createQboCustomer, createQboItem, createQboVendor } from "../../../api/qbo-mdata";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  kind: QuickCreateKind;
  defaultIncomeAccountQboId?: string;
  onClose: () => void;
  onCreated: (created: { id: string; label: string }) => void;
};

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // render-v5 §D vendor: Display name (= name) and Company/Vendor name are distinct fields.
  company: z.string().trim().optional(),
  email: z.string().trim().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  sku: z.string().trim().optional(),
  unitPrice: z.coerce.number().int().min(0).optional(),
  qtyReceived: z.coerce.number().int().min(1).optional(),
  location: z.string().trim().optional(),
  // W-FIX-7b: render-v5 §D vendor fields (mig 202606231500).
  street: z.string().trim().optional(),
  city: z.string().trim().optional(),
  state: z.string().trim().optional(),
  zip: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  terms: z.string().trim().optional(),
  taxId: z.string().trim().optional(),
  track1099: z.boolean().optional(),
  defaultExpenseAccount: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function titleFor(kind: QuickCreateKind): string {
  if (kind === "vendor") return "Quick Create Vendor";
  if (kind === "customer") return "Quick Create Customer";
  if (kind === "item") return "Quick Create Product/Service";
  if (kind === "category") return "Quick Create Category";
  return "Quick Create Part";
}

export function QuickCreateEntityModal({
  open,
  operatingCompanyId,
  kind,
  defaultIncomeAccountQboId,
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: { name: "", company: "", email: "", phone: "", sku: "", unitPrice: 0, qtyReceived: 1, location: "", street: "", city: "", state: "", zip: "", accountNumber: "", terms: "", taxId: "", track1099: false, defaultExpenseAccount: "" },
  });

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
    if (kind === "item" && !defaultIncomeAccountQboId) {
      pushToast("Create an expense category first, then create an item.", "error");
      return;
    }

    setSaving(true);
    try {
      if (kind === "vendor") {
        const res = await createQboVendor(operatingCompanyId, {
          display_name: parsed.data.name,
          company_name: parsed.data.company?.trim() || parsed.data.name,
          primary_email: parsed.data.email || undefined,
          primary_phone: parsed.data.phone || undefined,
          // W-FIX-7b: render-v5 §D fields.
          billing_address_line1: parsed.data.street?.trim() || undefined,
          billing_city: parsed.data.city?.trim() || undefined,
          billing_state: parsed.data.state?.trim() || undefined,
          billing_postal_code: parsed.data.zip?.trim() || undefined,
          account_number: parsed.data.accountNumber?.trim() || undefined,
          terms: parsed.data.terms?.trim() || undefined,
          tax_id: parsed.data.taxId?.trim() || undefined,
          track_1099: parsed.data.track1099 || undefined,
          default_expense_account_qbo_id: parsed.data.defaultExpenseAccount?.trim() || undefined,
        });
        onCreated({ id: String(res.vendor.id), label: parsed.data.name });
      } else if (kind === "customer") {
        const res = await createQboCustomer(operatingCompanyId, {
          display_name: parsed.data.name,
          company_name: parsed.data.company?.trim() || parsed.data.name,
          primary_email: parsed.data.email || undefined,
          primary_phone: parsed.data.phone || undefined,
        });
        onCreated({ id: String(res.customer.id), label: parsed.data.name });
      } else if (kind === "item") {
        const res = await createQboItem(operatingCompanyId, {
          name: parsed.data.name,
          sku: parsed.data.sku || undefined,
          unit_price_cents: parsed.data.unitPrice,
          income_account_qbo_id: defaultIncomeAccountQboId!,
        });
        onCreated({ id: String(res.item.id), label: parsed.data.name });
      } else if (kind === "category") {
        const res = await createQboAccount(operatingCompanyId, {
          name: parsed.data.name,
          account_type: "Expense",
          account_sub_type: "OtherExpense",
          full_qualified_name: parsed.data.name,
        });
        onCreated({ id: String(res.account.id), label: parsed.data.name });
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
      onClose();
    } catch (error) {
      pushToast(String((error as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  });

  return (
    <Modal open={open} onClose={onClose} title={titleFor(kind)} modalKind="quick-create-entity" sizePreset="md" resizable>
      <form className="space-y-3 text-sm" onSubmit={submit}>
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{kind === "vendor" || kind === "customer" ? "Display name *" : "Name *"}</span>
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("name")} aria-label="Quick create name" />
        </label>

        {kind === "vendor" || kind === "customer" ? (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Company / {kind === "vendor" ? "Vendor" : "Customer"} name</span>
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("company")} aria-label="Quick create company name" placeholder="Defaults to display name" />
          </label>
        ) : null}

        {kind === "vendor" || kind === "customer" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">Email</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("email")} aria-label="Quick create email" />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">Phone</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("phone")} aria-label="Quick create phone" />
            </label>
          </div>
        ) : null}

        {/* W-FIX-7b: render-v5 §D vendor fields (persist to mdata.qbo_vendors columns, mig 202606231500). */}
        {kind === "vendor" ? (
          <div className="space-y-2 rounded border border-gray-100 bg-gray-50 p-2">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Vendor details (optional)</div>
            <label className="block">
              <span className="text-xs font-medium text-gray-600">Street</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("street")} aria-label="Quick create street" />
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label><span className="text-xs font-medium text-gray-600">City</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("city")} aria-label="Quick create city" /></label>
              <label><span className="text-xs font-medium text-gray-600">State</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("state")} aria-label="Quick create state" /></label>
              <label><span className="text-xs font-medium text-gray-600">Zip</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("zip")} aria-label="Quick create zip" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs font-medium text-gray-600">Account no.</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("accountNumber")} aria-label="Quick create account number" /></label>
              <label><span className="text-xs font-medium text-gray-600">Terms</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("terms")} aria-label="Quick create terms" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs font-medium text-gray-600">Tax ID (1099)</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("taxId")} aria-label="Quick create tax id" /></label>
              <label><span className="text-xs font-medium text-gray-600">Default expense account</span><input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("defaultExpenseAccount")} aria-label="Quick create default expense account" /></label>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" {...form.register("track1099")} aria-label="Quick create track 1099" /> Track 1099?
            </label>
          </div>
        ) : null}

        {kind === "item" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">SKU</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("sku")} aria-label="Quick create SKU" />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">Unit price (cents)</span>
              <input type="number" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("unitPrice")} aria-label="Quick create unit price cents" />
            </label>
          </div>
        ) : null}

        {kind === "part" ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            <label>
              <span className="text-xs font-medium text-gray-600">Qty received *</span>
              <input type="number" className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("qtyReceived")} aria-label="Quick create qty received" />
            </label>
            <label>
              <span className="text-xs font-medium text-gray-600">Location</span>
              <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1" {...form.register("location")} aria-label="Quick create part location" />
            </label>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
          <button type="button" className="rounded border border-gray-300 px-3 py-1.5" onClick={onClose} aria-label="Cancel quick create">
            Cancel
          </button>
          <button
            type="submit"
            className="rounded bg-emerald-600 px-3 py-1.5 font-medium text-white disabled:opacity-60"
            disabled={saving}
            aria-label="Save quick create"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
