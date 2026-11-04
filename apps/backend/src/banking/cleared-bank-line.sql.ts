/**
 * ACCT-F11100 — THE ONE DEFINITION OF A "CLEARED" BANK LINE (QuickBooks bank-feed parity).
 *
 * Owner (11-04 08:44 CT): "nothing should be showing twice, follow quickbooks format."
 *
 * In QuickBooks Online a PENDING bank-feed item is never counted in money in / money out, account
 * balances, the register or For Review. When the bank posts it, the posted item REPLACES the pending
 * one — it never becomes a second line.
 *
 * Measured on prod USMCA 11-04 (USMCA FREIGHT, BofA): the Banking money-map counted live pending lines
 * beside their posted twins — Oct out $285,153.62 vs $284,129.85 cleared (+$1,023.77 = pending
 * 10/28 FUEL AMERICA $45.47 + pending 10/30 PMNT SENT $978.30, both with posted twins), and Nov 1-3 out
 * $41,194.89 vs $19,199.76 cleared (+$21,995.13 pending: WEX ACH HOLD $15,203.46, wire hold $4,767.61, …).
 * The Accounting cash pulse already excluded pending and tied to cleared; the Banking screens did not,
 * because every reader spelled its own filter.
 *
 * Every Banking total, balance, register and review list reads clearedBankLine(); the separate Pending
 * list reads pendingBankLine(). The two are disjoint and together cover every live, real line.
 */

function sqlAlias(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error(`invalid SQL alias: ${alias}`);
  return alias;
}

/** A live, real bank line that is not a feed-superseded copy (shared by cleared and pending). */
function liveRealBankLine(a: string): string {
  return `${a}.voided_at IS NULL
    AND ${a}.merged_into_bank_transaction_id IS NULL
    AND COALESCE(${a}.is_sample_data, false) = false`;
}

/** Cleared (posted) bank line: counts in money in/out, balances, registers and For Review. */
export function clearedBankLine(alias = "bt"): string {
  const a = sqlAlias(alias);
  return `(${liveRealBankLine(a)}
    AND COALESCE(${a}.pending, false) = false)`;
}

/** Pending bank-feed line: shown ONLY in the separate Pending list, never added into any total. */
export function pendingBankLine(alias = "bt"): string {
  const a = sqlAlias(alias);
  return `(${liveRealBankLine(a)}
    AND COALESCE(${a}.pending, false) = true)`;
}
