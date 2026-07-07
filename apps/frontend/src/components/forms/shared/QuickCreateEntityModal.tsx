import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createPartsInventoryPurchase } from "../../../api/maintenance";
import { createVendor, createCustomer } from "../../../api/mdata";
import { chartOfAccountsCatalogClient, itemsCatalogClient } from "../../../api/catalogs-accounting";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part";

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

const VENDOR_TYPES = ["Fuel", "Repair", "Tires", "Towing", "Insurance", "Permit", "Toll", "Other"] as const;

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // render-v5 §D vendor: Display name (= name) and Company/Vendor name are distinct fields.
  company: z.string().trim().optional(),
  email: z.string().trim().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  vendorType: z.enum(VENDOR_TYPES).optional(),
  sku: z.string().trim().optional(),
  unitPrice: z.coerce.number().int().min(0).optional(),
  qtyReceived: z.coerce.number().int().min(1).optional(),
  location: z.string().trim().optional(),
  // W-FIX-7b: render-v5 §D vendor fields. City/state/zip/terms/track1099 are collected in the UI
  // but held back from the canonical create until migration 202607110230 lands on prod.
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
  onClose,
  onCreated,
}: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const form = useForm<FormValues>({
    defaultValues: { name: "", company: "", email: "", phone: "", vendorType: "Other", sku: "", unitPrice: 0, qtyReceived: 1, location: "", street: "", city: "", state: "", zip: "", accountNumber: "", terms: "", taxId: "", track1099: false, defaultExpenseAccount: "" },
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

    setSaving(true);
    try {
      if (kind === "vendor") {
        // QB-STD-5: write to canonical mdata.vendors (same table listVendors reads from) so the
        // created vendor survives reload. Previously wrote to mdata.qbo_vendors (mirror), which
        // no vendor picker reads — the created row was invisible after refresh.
        // Fields dropped (mirror-only, not in mdata.vendors pre-HELD migration 202607110230):
        //   company_name, account_number, terms, track_1099, city, state, postal_code.
        const res = await createVendor({
          name: parsed.data.name,
          vendor_type: parsed.data.vendorType ?? "Other",
          email: parsed.data.email || undefined,
          phone: parsed.data.phone || undefined,
          address: parsed.data.street?.trim() || undefined,
          tax_id: parsed.data.taxId?.trim() || undefined,
          operating_company_id: operatingCompanyId,
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "customer") {
        // D1-1: writes to mdata.customers (canonical) — already fixed in the prior customer path.
        const res = await createCustomer({
          name: parsed.data.name,
          operating_company_id: operatingCompanyId,
          email: parsed.data.email || undefined,
          phone: parsed.data.phone || undefined,
          main_contact_name: parsed.data.company?.trim() || undefined,
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "item") {
        // QB-STD-5: write to catalogs.items (canonical) — same table itemsCatalogClient.list()
        // reads. Previously wrote to mdata.qbo_items (mirror), invisible after refresh.
        // item_type defaults to "Service" (factory requiredMetadata["item_type"]).
        const nameSlug = (parsed.data.sku?.trim() || parsed.data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 20) || "ITEM").slice(0, 120);
        const itemCode = nameSlug || "ITEM";
        const res = await itemsCatalogClient.create(operatingCompanyId, {
          code: itemCode,
          display_name: parsed.data.name,
          metadata: {
            item_type: "Service",
            unit_price_cents: parsed.data.unitPrice ?? 0,
          },
        });
        onCreated({ id: String(res.id), label: parsed.data.name });
      } else if (kind === "category") {
        // QB-STD-5: write to catalogs.accounts (canonical) — same table getCoaAccounts reads via
        // /api/v1/catalogs/accounts. Previously wrote to mdata.qbo_accounts (mirror), invisible
        // after refresh. chartOfAccountsCatalogClient maps to tableName:"accounts" in the factory.
        // Default account_type/subtype = Expense/OtherExpense (appropriate for a cost category).
        const rawSlug = parsed.data.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12) || "ACCT";
        const safeSlug = /^[A-Z]/.test(rawSlug) ? rawSlug : `E${rawSlug}`;
        // Timestamp suffix avoids account_number unique-constraint violations on same-name creates.
        const accountCode = `${safeSlug}${String(Date.now()).slice(-6)}`;
        const res = await chartOfAccountsCatalogClient.create(operatingCompanyId, {
          code: accountCode,
          display_name: parsed.data.name,
          metadata: { account_type: "Expense", account_subtype: "OtherExpense" },
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
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("name")} aria-label="Quick create name" />
        </label>

        {kind === "vendor" ? (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Vendor type</span>
            <select className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm" {...form.register("vendorType")} aria-label="Quick create vendor type">
              {VENDOR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
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

        {/* W-FIX-7b: render-v5 §D vendor fields. Street → mdata.vendors.address (live). City/state/
        zip/account_number/terms/track1099 are collected here but NOT sent to the canonical endpoint
        until migration 202607110230 lands (those columns are HELD on mdata.vendors). */}
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
              <label><span className="text-xs font-medium text-gray-600">Terms</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("terms")} aria-label="Quick create terms" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label><span className="text-xs font-medium text-gray-600">Tax ID (1099)</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("taxId")} aria-label="Quick create tax id" /></label>
              <label><span className="text-xs font-medium text-gray-600">Default expense account</span><input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("defaultExpenseAccount")} aria-label="Quick create default expense account" /></label>
            </div>
            <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <input type="checkbox" {...form.register("track1099")} aria-label="Quick create track 1099" /> Track 1099?
            </label>
          </div>
        ) : null}

        {kind === "item" ? (
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
    </Modal>
  );
}
