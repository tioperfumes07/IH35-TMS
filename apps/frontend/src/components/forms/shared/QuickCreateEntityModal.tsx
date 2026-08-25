import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { createPartsInventoryPurchase } from "../../../api/maintenance";
import { createCustomer } from "../../../api/mdata";
import { classesCatalogClient, itemsCatalogClient } from "../../../api/catalogs-accounting";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { NewAccountDrawerForm } from "../../../components/parity/drawers/NewAccountDrawerForm";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { properPersonOrPlaceName } from "../../../lib/properDisplayText";
import { VendorCreateModal } from "../../vendors/VendorCreateModal";
import { ItemEditorModal } from "../../../pages/lists/accounting/ItemEditorModal";
import { AccountingCatalogModal } from "../../../pages/lists/accounting/AccountingCatalogModal";

// "class" writes catalogs.classes (a reporting DIMENSION, NOT catalogs.accounts — no GL/posting math),
// via the entity-scoped POST /api/v1/catalogs/accounting/classes route. Non-financial, same pattern as item.
export type QuickCreateKind = "vendor" | "customer" | "item" | "category" | "part" | "class";

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

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  company: z.string().trim().optional(),
  email: z.string().trim().email("Valid email required").optional().or(z.literal("")),
  phone: z.string().trim().optional(),
  qtyReceived: z.coerce.number().int().min(1).optional(),
  location: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function titleFor(kind: Exclude<QuickCreateKind, "vendor" | "item" | "class" | "category">): string {
  if (kind === "customer") return "Quick Create Customer";
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
    defaultValues: {
      name: "",
      company: "",
      email: "",
      phone: "",
      qtyReceived: 1,
      location: "",
    },
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
    // CUSTOMER-EMAIL-REQUIRED: email is required for invoice deliverability.
    if (kind === "customer" && !parsed.data.email?.trim()) {
      pushToast("Email is required for a customer.", "error");
      return;
    }

    setSaving(true);
    try {
      if (kind === "customer") {
        // D1-1: writes to mdata.customers (canonical) — already fixed in the prior customer path.
        // Same deliverability stamp as NewCustomerDrawerForm: email → billing_email (API) + ar/ap.
        const invoiceEmail = parsed.data.email?.trim() || undefined;
        const titleCasedName = properPersonOrPlaceName(parsed.data.name);
        const res = await createCustomer({
          name: titleCasedName,
          operating_company_id: operatingCompanyId,
          email: invoiceEmail,
          ar_email: invoiceEmail,
          ap_email: invoiceEmail,
          phone: parsed.data.phone || undefined,
          main_contact_name: parsed.data.company?.trim() ? properPersonOrPlaceName(parsed.data.company) : undefined,
          main_contact_email: invoiceEmail,
        });
        onCreated({ id: String(res.id), label: titleCasedName });
      } else if (kind === "part") {
        const titleCasedName = properPersonOrPlaceName(parsed.data.name);
        const res = await createPartsInventoryPurchase(operatingCompanyId, {
          part_description: titleCasedName,
          qty_received: parsed.data.qtyReceived ?? 1,
          location: parsed.data.location?.trim() ? properPersonOrPlaceName(parsed.data.location) : undefined,
        });
        onCreated({ id: String(res.id ?? ""), label: titleCasedName });
      } else {
        // vendor / item / class / category early-return below — residual submit must not handle them.
        pushToast("Use the Lists create chrome for this entity.", "error");
        return;
      }
      pushToast("Created successfully", "success");
      form.reset();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  });

  // CHROME-11: nest create in a right ParityDrawer — never a centered Modal stacked on money drawers.
  // LST-F3368 / LST-F3370 — vendor / item / class / category share ONE chrome with Lists
  // (VendorCreateModal / ItemEditorModal / AccountingCatalogModal / AccountDrawer via NewAccountDrawerForm).
  if (kind === "vendor") {
    return (
      <ParityDrawer open={open} onClose={onClose} onBack={onClose} title="Create Vendor" stackAboveModal>
        <VendorCreateModal
          open={open}
          operatingCompanyId={operatingCompanyId}
          embedded
          onClose={onClose}
          onSaved={(created) => {
            onCreated({ id: created.id, label: created.label });
          }}
        />
      </ParityDrawer>
    );
  }
  if (kind === "item") {
    return (
      <ParityDrawer open={open} onClose={onClose} onBack={onClose} title="New product/service" stackAboveModal>
        <ItemEditorModal
          open={open}
          mode="create"
          row={null}
          operatingCompanyId={operatingCompanyId}
          client={itemsCatalogClient}
          embedded
          onClose={onClose}
          onSaved={(created) => {
            if (created?.id) onCreated({ id: created.id, label: created.label });
          }}
        />
      </ParityDrawer>
    );
  }
  if (kind === "class") {
    return (
      <ParityDrawer open={open} onClose={onClose} onBack={onClose} title="Create Class" stackAboveModal>
        <AccountingCatalogModal
          open={open}
          operatingCompanyId={operatingCompanyId}
          displayName="Class"
          client={classesCatalogClient}
          mode="create"
          row={null}
          embedded
          onClose={onClose}
          onSaved={(created) => {
            if (created?.id) onCreated({ id: created.id, label: created.label ?? "" });
          }}
        />
      </ParityDrawer>
    );
  }
  if (kind === "category") {
    // LST-F3370 — category = catalogs.accounts CoA create. Same chrome as Lists → CoA → + Create
    // and InlineCreateDrawer createKind="account" (NewAccountDrawerForm → AccountDrawer embedded).
    return (
      <ParityDrawer open={open} onClose={onClose} onBack={onClose} title="New Account" stackAboveModal>
        <NewAccountDrawerForm
          operatingCompanyId={operatingCompanyId}
          onClose={onClose}
          onCreated={(created) => {
            onCreated({ id: created.id, label: created.label });
          }}
        />
      </ParityDrawer>
    );
  }

  return (
    <ParityDrawer open={open} onClose={onClose} onBack={onClose} title={titleFor(kind)} stackAboveModal>
      <form
        className="space-y-3 text-sm"
        onSubmit={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void submit(event);
        }}
        data-testid="quick-create-entity-drawer"
      >
        {/*
          PICKER-QUICK-CREATE / LST-F3368 / LST-F3370:
          vendor / item / class / category early-return above to Lists creators.
          Residual form is customer | part only — do not reintroduce kind === "vendor" | "item" |
          "category" branches here (TS2367 after narrowing).
        */}
        <label className="block">
          <span className="text-xs font-medium text-gray-600">{kind === "customer" ? "Display name *" : "Name *"}</span>
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("name")} aria-label="Quick create name" />
        </label>

        {kind === "customer" ? (
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Company / Customer name</span>
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1" {...form.register("company")} aria-label="Quick create company name" placeholder="Defaults to display name" />
          </label>
        ) : null}

        {kind === "customer" ? (
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
    </ParityDrawer>
  );
}
