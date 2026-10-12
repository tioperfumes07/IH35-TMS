/**
 * Leaf module (LEAD 443.116 #1): the fuel fill poster (bank-recon/bank-match-fuel-post.service.ts) and the receipt-time
 * caller (maybe-post-from-fuel-transaction.service.ts) both use these; keeping them here breaks the import cycle between
 * the two (verify-no-circular-dependencies). Moved verbatim, re-exported from maybe-post for existing importers.
 */
import type { FuelCategoryCode } from "./poster.service.js";

/** Map fuel.fuel_transactions.fuel_type → Block-27 poster category codes. */
export function mapFuelTypeToPostingKind(fuelType: string): FuelCategoryCode {
  const t = fuelType.trim().toLowerCase();
  if (t === "diesel") return "diesel";
  if (t === "def") return "def";
  if (t === "reefer_diesel" || t === "reefer") return "reefer";
  if (t === "oil") return "oil";
  return "misc";
}

/** E14.2 — JE memo with at least one human id (load / unit / vendor / driver). Never bare fuel UUID. */
export function buildFuelTxnJeMemo(args: {
  fuel_type: string;
  load_number?: string | null;
  unit_number?: string | null;
  vendor_name?: string | null;
  driver_name?: string | null;
  fuel_card_code?: string | null;
}): string {
  const kind = (args.fuel_type || "diesel").trim().toLowerCase() || "diesel";
  const parts: string[] = ["Fuel"];
  if (args.load_number?.trim()) parts.push(`load ${args.load_number.trim()}`);
  if (args.unit_number?.trim()) parts.push(`unit ${args.unit_number.trim()}`);
  if (args.vendor_name?.trim()) parts.push(args.vendor_name.trim());
  if (args.driver_name?.trim()) parts.push(args.driver_name.trim());
  if (args.fuel_card_code?.trim()) parts.push(args.fuel_card_code.trim());
  parts.push(`(${kind})`);
  // If we have nothing human beyond "Fuel (diesel)", still avoid UUID — card/rail word is enough.
  if (parts.length <= 2) parts.splice(1, 0, "purchase");
  return parts.join(" ").slice(0, 200);
}
