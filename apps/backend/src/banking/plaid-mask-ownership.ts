/**
 * Owner ruling 2026-07-23 — Wells Fargo shared login for TRK + TRANSP.
 * Last-4 ownership must not be overwritten by Plaid re-sync into the wrong entity.
 */
export const WF_MASK_OWNERSHIP: Readonly<Record<string, "TRK" | "TRANSP">> = {
  "3500": "TRK",
  "6103": "TRANSP",
  "6129": "TRANSP",
  "6137": "TRANSP",
};

export function normalizeAccountMask(mask: string | null | undefined): string | null {
  const digits = String(mask ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return digits.slice(-4);
}

/**
 * Returns null when the mask may bind to this company.
 * Returns an error code when the mask is reserved for a different entity.
 */
export function plaidMaskOwnershipViolation(
  companyCode: string,
  accountMask: string | null | undefined
): { code: "plaid_mask_wrong_entity"; mask: string; owner: string; attempted: string } | null {
  const mask = normalizeAccountMask(accountMask);
  if (!mask) return null;
  const owner = WF_MASK_OWNERSHIP[mask];
  if (!owner) return null;
  const attempted = String(companyCode ?? "").trim().toUpperCase();
  if (!attempted) return null;
  if (attempted === owner) return null;
  return { code: "plaid_mask_wrong_entity", mask, owner, attempted };
}
