export const WO_SERVICE_CLASSES = [
  "pm",
  "corrective",
  "accident",
  "inspection_dot",
  "inspection_state",
  "warranty",
  "other",
] as const;

export type WoServiceClass = (typeof WO_SERVICE_CLASSES)[number];

export const WO_BILLING_TYPES = ["internal", "external"] as const;

export type WoBillingType = (typeof WO_BILLING_TYPES)[number];

export interface WorkOrderValidationInput {
  wo_billing_type: WoBillingType;
  wo_service_class: WoServiceClass;
  unit_id?: string | null;
  driver_id?: string | null;
  vendor_id?: string | null;
  shop_name?: string | null;
  vendor_invoice_number?: string | null;
  vendor_work_order_number?: string | null;
  /** Legacy maintenance fields — satisfy Rule 1 when unified fields are blank */
  external_vendor_invoice_number?: string | null;
  external_vendor_wo_number?: string | null;
}

function trimmed(value: string | null | undefined) {
  return String(value ?? "").trim();
}

export function resolveVendorReferences(input: WorkOrderValidationInput) {
  const vendor_invoice_number =
    trimmed(input.vendor_invoice_number) || trimmed(input.external_vendor_invoice_number);
  const vendor_work_order_number =
    trimmed(input.vendor_work_order_number) || trimmed(input.external_vendor_wo_number);
  return { vendor_invoice_number, vendor_work_order_number };
}

export function validateCreateWorkOrder(
  input: WorkOrderValidationInput
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const { vendor_invoice_number, vendor_work_order_number } = resolveVendorReferences(input);

  const hasInvoice = Boolean(vendor_invoice_number);
  const hasVendorWo = Boolean(vendor_work_order_number);
  if (!hasInvoice && !hasVendorWo) {
    errors.vendor_invoice_number = "Vendor invoice # or vendor work order # is required";
    errors.vendor_work_order_number = "Vendor invoice # or vendor work order # is required";
  }

  if (input.wo_service_class !== "pm") {
    if (!trimmed(input.unit_id)) {
      errors.unit_id = "Unit is required for non-PM service";
    }
    if (!trimmed(input.driver_id)) {
      errors.driver_id = "Driver is required for non-PM service";
    }
  }

  if (input.wo_billing_type === "external" && !trimmed(input.vendor_id) && !trimmed(input.shop_name)) {
    errors.shop_name = "Shop name or vendor selection required for external work order";
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true };
}

export function validateUpdateWorkOrder(
  prior: Partial<WorkOrderValidationInput> | null | undefined,
  patch: Partial<WorkOrderValidationInput>
): { ok: true } | { ok: false; errors: Record<string, string> } {
  const merged: WorkOrderValidationInput = {
    wo_billing_type: (patch.wo_billing_type ?? prior?.wo_billing_type ?? "external") as WoBillingType,
    wo_service_class: (patch.wo_service_class ?? prior?.wo_service_class ?? "corrective") as WoServiceClass,
    unit_id: patch.unit_id ?? prior?.unit_id ?? null,
    driver_id: patch.driver_id ?? prior?.driver_id ?? null,
    vendor_id: patch.vendor_id ?? prior?.vendor_id ?? null,
    shop_name: patch.shop_name ?? prior?.shop_name ?? null,
    vendor_invoice_number: patch.vendor_invoice_number ?? prior?.vendor_invoice_number ?? null,
    vendor_work_order_number: patch.vendor_work_order_number ?? prior?.vendor_work_order_number ?? null,
    external_vendor_invoice_number:
      patch.external_vendor_invoice_number ?? prior?.external_vendor_invoice_number ?? null,
    external_vendor_wo_number: patch.external_vendor_wo_number ?? prior?.external_vendor_wo_number ?? null,
  };
  return validateCreateWorkOrder(merged);
}

/** Operational maintenance.work_orders.wo_type — distinct from wo_service_class */
export function mapServiceClassToOperationalWoType(serviceClass: WoServiceClass): "pm" | "repair" | "tire" | "accident" {
  if (serviceClass === "pm") return "pm";
  if (serviceClass === "accident") return "accident";
  return "repair";
}
