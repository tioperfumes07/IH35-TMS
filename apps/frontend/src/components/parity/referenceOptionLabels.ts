import type { ReferenceOption } from "./ReferenceSelect";
import { properEnumOrFilterLabel } from "../../lib/properDisplayText";
import { formatAccountDisplayLabel } from "../../lib/show-account-numbers";

/** QBO-style secondary label shown after the primary name in ReferenceSelect dropdowns. */
export function formatReferenceTypeLabel(raw: string | null | undefined): string | undefined {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return undefined;
  return properEnumOrFilterLabel(trimmed);
}

/** Humanize enum-ish customer types for the Type column (e.g. direct_shipper → Direct shipper). */
export function formatCustomerTypeLabel(customerType: string | null | undefined): string | undefined {
  const raw = String(customerType ?? "").trim();
  if (!raw) return undefined;
  if (raw === "direct_shipper") return "Direct shipper";
  if (raw === "broker") return "Broker";
  return properEnumOrFilterLabel(raw);
}

export function vendorReferenceOption(vendor: {
  id: string;
  name: string;
  vendor_type?: string | null;
}): ReferenceOption {
  const type = formatReferenceTypeLabel(vendor.vendor_type);
  return { value: vendor.id, label: vendor.name, ...(type ? { type } : {}) };
}

export function customerReferenceOption(customer: {
  id: string;
  name: string;
  customer_type?: string | null;
}): ReferenceOption {
  const type = formatCustomerTypeLabel(customer.customer_type);
  return { value: customer.id, label: customer.name, ...(type ? { type } : {}) };
}

/**
 * Chart-of-accounts row for pickers.
 * Primary label = account name only by default (owner 2026-07-23: QBO numbers are junk).
 * Respects ih35.showAccountNumbers when the user toggles numbers ON in CoA / reports.
 * Type column stays the GL account type (Bank, Expense, …) — never the account number.
 */
export function coaAccountReferenceOption(account: {
  id: string;
  account_name: string;
  account_type?: string | null;
  account_number?: string | null;
}): ReferenceOption {
  const label = formatAccountDisplayLabel(account);
  const type = formatReferenceTypeLabel(account.account_type);
  return { value: account.id, label, ...(type ? { type } : {}) };
}

export function catalogClassReferenceOption(row: { id: string; display_name: string }): ReferenceOption {
  return { value: row.id, label: row.display_name, type: "Class" };
}

export function catalogItemReferenceOption(row: {
  id: string;
  display_name: string;
  metadata?: Record<string, unknown>;
}): ReferenceOption {
  const metaType =
    typeof row.metadata?.item_type === "string"
      ? row.metadata.item_type
      : typeof row.metadata?.type === "string"
        ? row.metadata.type
        : undefined;
  const type = formatReferenceTypeLabel(metaType) ?? "Product/Service";
  return { value: row.id, label: row.display_name, type };
}

export function vendorFilterReferenceOptions(
  vendors: Array<{ id: string; name: string; vendor_type?: string | null }>,
  allLabel = "All vendors"
): ReferenceOption[] {
  return [{ value: "", label: allLabel }, ...vendors.map(vendorReferenceOption)];
}

export function customerFilterReferenceOptions(
  customers: Array<{ id: string; name: string; customer_type?: string | null }>,
  allLabel = "All customers"
): ReferenceOption[] {
  return [{ value: "", label: allLabel }, ...customers.map(customerReferenceOption)];
}
