// CUST-2 / VEND-5 — single source of truth for the payment/quality badge. Before this, four customer
// copies and three vendor copies each re-implemented the rating AND defaulted MISSING data to a
// worst/arbitrary rating: `Number(quality_payment_score ?? "")` is `Number("")` = 0 (finite!), so a
// customer with no score rendered red "Late-pay"; a vendor with no profile block defaulted to amber
// "Medium". This util rates ONLY from real data — absent data returns the neutral `none` kind
// ("No history"), matching the in-house "Unknown" precedent. Each call site maps the kind to its own
// existing label vocabulary (so no user-facing wording changes) via the class helpers below.

import { parseVendorNotes, VENDOR_PROFILE_META_PREFIX } from "./vendorProfileMeta.js";

const CLASS = {
  good: "bg-emerald-100 text-emerald-800",
  neutral: "bg-amber-100 text-amber-800", // "watch"/"medium"
  bad: "bg-red-100 text-red-800", // "late"/"bad"
  none: "bg-gray-100 text-gray-700", // no real data
} as const;

// ── Customers (score 0-100 + overall flag) ──────────────────────────────────
export type CustomerQualityKind = "good" | "watch" | "late" | "none";

export function customerQualityKind(
  paymentScore: string | number | null | undefined,
  overallFlag: string | null | undefined
): CustomerQualityKind {
  // Treat null/undefined/"" as NO DATA (NOT 0). Only a genuinely numeric score is a real rating.
  const numeric = paymentScore === null || paymentScore === undefined || paymentScore === "" ? NaN : Number(paymentScore);
  if (Number.isFinite(numeric)) {
    if (numeric >= 90) return "good";
    if (numeric >= 70) return "watch";
    return "late";
  }
  // No score → fall back only to an EXPLICIT flag; 'standard'/absent carries no signal.
  if (overallFlag === "preferred") return "good";
  if (overallFlag === "caution") return "watch";
  if (overallFlag === "avoid") return "late";
  return "none";
}

export function customerQualityClass(kind: CustomerQualityKind): string {
  return kind === "good" ? CLASS.good : kind === "watch" ? CLASS.neutral : kind === "late" ? CLASS.bad : CLASS.none;
}

// ── Vendors (rating derived from the notes profile block) ────────────────────
export type VendorQualityKind = "good" | "medium" | "bad" | "none";

export function vendorQualityKind(notes: string | null | undefined): VendorQualityKind {
  // No vendor-profile meta block at all → the quality rating was never set → no real data. (parseVendorNotes
  // otherwise DEFAULTS qualityRating to 'medium', which is exactly the amber-on-everyone bug.)
  if (!notes || !notes.includes(VENDOR_PROFILE_META_PREFIX)) return "none";
  const rating = parseVendorNotes(notes).meta.qualityRating;
  if (rating === "good") return "good";
  if (rating === "bad") return "bad";
  return "medium";
}

export function vendorQualityClass(kind: VendorQualityKind): string {
  return kind === "good" ? CLASS.good : kind === "medium" ? CLASS.neutral : kind === "bad" ? CLASS.bad : CLASS.none;
}
