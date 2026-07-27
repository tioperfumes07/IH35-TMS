// Faro Factoring ↔ IH 35 TRANSPORTATION LLC — executed-contract constants (eff 2024-12-02, TRANSP only).
// Single source of truth for the numeric terms the poster/accrual/recourse code builds to. Grounded in the
// executed agreement (auto-memory `faro-factoring-contract-terms`) + blueprint §6. Numbers here are the
// CONTRACT terms — NOT guesses. Where the contract leaves something to Faro's per-account discretion (tier
// assignment) or GAAP presentation (which account the compounding interest lands in), it is called out
// explicitly below as an OWNER-CONFIG default, never silently assumed.

// ── RESOLVED by the executed contract (was PENDING_OWNER_CONFIRMATION) ──────────────────────────────

// Factoring Ratio (the ONE funding fee), charged on the invoice Net at funding (Purchase Date),
// non-refundable. Faro assigns the tier per account. Fee = Net × Ratio.
export const FACTORING_TIER1_RATIO = 0.015; // Tier 1 = 1.5% of Net
export const FACTORING_TIER2_RATIO = 0.02; // Tier 2 = 2.0% of Net

// Security Reserve held back at funding, deducted from Purchase Price; released only after Faro is fully
// paid the Repurchase Price and Seller/Guarantor is not in default.
export const FACTORING_SECURITY_RESERVE_RATIO = 0.015; // 1.5% of Net

// Default Interest: 0.067% PER DAY, COMPOUNDED DAILY, on the unpaid balance — accrues ONLY after the
// 30-day Repurchase Term + 5-day Grace = after day 35. (Corrects the earlier verbal "flat 30/60-day fee"
// approximation — the contract charges no flat term fees, only this daily compounding interest.)
export const FACTORING_DEFAULT_INTEREST_DAILY_RATE = 0.00067; // 0.067%/day
export const FACTORING_REPURCHASE_TERM_DAYS = 30;
export const FACTORING_GRACE_DAYS = 5;
// Interest accrues for each day whose day-index (days since Purchase Date) is strictly greater than this.
// 30 term + 5 grace = 35 → first charged day is day 36.
export const FACTORING_INTEREST_ACCRUAL_AFTER_DAY = FACTORING_REPURCHASE_TERM_DAYS + FACTORING_GRACE_DAYS; // 35

// Repurchase Deadline: by day 95 from Purchase Date the account must be repurchased (customer paid Faro, or
// — with full recourse — Seller repurchases). The day-95 auto-recourse fires on/after this.
export const FACTORING_REPURCHASE_DEADLINE_DAYS = 95;

// ── GENUINELY-OPEN owner config (defaulted per the contract, flagged — NOT guessed) ─────────────────

// OPEN #1 — Tier assignment (T1 1.5% vs T2 2.0%) is Faro's per-account choice; the contract does not fix it
// system-wide. At funding the ACTUAL fee comes from Faro's funding report (faro-csv-import), so this default
// only drives fee ESTIMATES/validation before the report lands. Default = Tier 1 (the lower, most-common
// rate). Override per account when Faro confirms the tier.
export const FACTORING_DEFAULT_TIER: "T1" | "T2" = "T1";
export function factoringRatioForTier(tier: "T1" | "T2" = FACTORING_DEFAULT_TIER): number {
  return tier === "T2" ? FACTORING_TIER2_RATIO : FACTORING_TIER1_RATIO;
}

// OPEN #2 — Where the daily default interest lands. The contract's Repurchase Price = Net + fees + accrued
// interest, so interest is owed to Faro on TOP of principal → it COMPOUNDS INTO the factoring-advance
// LIABILITY (Cr factoring_advance_liability), not netted out of the Security Reserve asset. Default = true
// (add to liability) per the contract formula. Flip only on an explicit OWNER-LOCKED decision to draw interest
// from the reserve instead.
export const FACTORING_INTEREST_COMPOUNDS_INTO_LIABILITY = true;
