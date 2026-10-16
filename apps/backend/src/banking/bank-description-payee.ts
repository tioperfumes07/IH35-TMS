/**
 * LEAD 443.168 J — read the payee out of the RAW bank description (journal 2026-09-06 BANK-MATCH-QBO + suggestion-engine
 * fix: "suggestion-engine.ts read only description_normalized … fixed engine fallback to raw description"; owner Law B
 * 2026-09-12: the system SUGGESTS with the reason, a human accepts / rejects / changes).
 *
 * parseBankDescription is pure: it names the counterparty the bank printed (Zelle to / from, wire originator / beneficiary,
 * card merchant, PMNT SENT payee, ACH company, check number, Relay fill merchant / Relay deposit). resolveDescribedPayee
 * turns that name into ONE vendor (money out) or customer (money in) by name-token match — the best match must clear
 * PAYEE_TOKEN_MATCH_MIN and be unique — and returns the category the party carries (vendor default expense account /
 * customer default income account) with the human reason. It writes nothing; the rules engine writes the suggestion.
 */

export type DescribedPayee = {
  pattern: "zelle_to" | "zelle_from" | "wire_in" | "wire_out" | "card" | "pmnt_sent" | "ach" | "check" | "relay_fuel" | "relay_deposit" | "merchant";
  /** The counterparty name as the bank printed it (empty for a bare check number). */
  name: string;
  /** Check number / transaction id when the bank printed one. */
  reference: string | null;
};

const clean = (s: string) => s.replace(/\s+/g, " ").replace(/[*#]+$/g, "").trim();

/** Pure. The counterparty the bank text names, or null when it names none. */
export function parseBankDescription(description: string | null | undefined, merchantName?: string | null): DescribedPayee | null {
  const d = String(description ?? "").trim();
  if (!d) return merchantName?.trim() ? { pattern: "merchant", name: merchantName.trim(), reference: null } : null;
  let m: RegExpMatchArray | null;
  if ((m = d.match(/^Relay fuel\s*·\s*[^·]*·\s*([^·]+?)\s*·.*?(txn_[A-Za-z0-9]+)?$/i))) return { pattern: "relay_fuel", name: clean(m[1]!), reference: m[2] ?? null };
  // A wallet deposit is USMCA moving its own money (a transfer, matched by the relay_deposit chip) — no payee.
  if (/^Relay deposit\b/i.test(d)) return { pattern: "relay_deposit", name: "", reference: null };
  if ((m = d.match(/zelle (?:payment )?to\s+(.+?)(?:\s+(?:Conf#|conf#|on \d|for ")|$)/i))) return { pattern: "zelle_to", name: clean(m[1]!), reference: null };
  if ((m = d.match(/zelle (?:payment )?from\s+(.+?)(?:\s+(?:Conf#|conf#|on \d|for ")|$)/i))) return { pattern: "zelle_from", name: clean(m[1]!), reference: null };
  if (/WIRE TYPE:\s*WIRE IN/i.test(d) && (m = d.match(/ORIG:\s*(.+?)\s+ID:/i))) return { pattern: "wire_in", name: clean(m[1]!), reference: null };
  if (/WIRE TYPE:\s*WIRE OUT/i.test(d) && (m = d.match(/BNF:\s*(.+?)\s+ID:/i))) return { pattern: "wire_out", name: clean(m[1]!), reference: null };
  if ((m = d.match(/^CHECKCARD\s+\d{4}\s+(.+?)\s+(?:X{3,}|\d{5,})/i))) return { pattern: "card", name: clean(m[1]!), reference: null };
  if ((m = d.match(/^PURCHASE\s+\d{2}\/\d{2}\s+(.+?)\s+(?:X{3,}|\+|\d{5,})/i)) && /[a-z]{3,}/i.test(m[1]!)) return { pattern: "card", name: clean(m[1]!), reference: null };
  if ((m = d.match(/^PMNT SENT\s+\d{4}\s+(.+?)\s+(?:X{3,}|\d{5,})/i))) return { pattern: "pmnt_sent", name: clean(m[1]!.replace(/^[A-Z ]+\*/i, "")), reference: null };
  if ((m = d.match(/^(?:Check Image|CHECK(?: #| NO\.?)?)\s*(\d{2,})/i))) return { pattern: "check", name: "", reference: m[1]! };
  if ((m = d.match(/^(.+?)\s+DES:\s*(.+?)\s+ID:/i))) return { pattern: "ach", name: clean(m[1]!), reference: null };
  if (merchantName?.trim()) return { pattern: "merchant", name: merchantName.trim(), reference: null };
  return null;
}

/** A party name token share at or above this, unique best, is a payee suggestion. */
export const PAYEE_TOKEN_MATCH_MIN = 0.5;

const STOP = new Set(["llc", "inc", "co", "corp", "the", "de", "sa", "cv", "ltd", "company", "services", "service", "and", "of"]);
const tokens = (s: string) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOP.has(t));

/** Pure: share of the PARTY's name tokens found in the bank's printed name (a party of one token must match it). */
export function partyTokenShare(printedName: string, partyName: string): number {
  const printed = new Set(tokens(printedName));
  const party = tokens(partyName);
  if (!party.length || !printed.size) return 0;
  return party.filter((t) => printed.has(t)).length / party.length;
}

/**
 * 443.170 (J+1) — symmetric name score: the mean of (party tokens found in the printed name) and (printed tokens found
 * in the party name). A short printed merchant ("Love's") still names a longer vendor ("Love's Travel Stops", 0.67), and
 * a bare first name shared by two people stays a tie (no suggestion).
 */
export function payeeNameScore(printedName: string, partyName: string): number {
  return (partyTokenShare(printedName, partyName) + partyTokenShare(partyName, printedName)) / 2;
}

type Queryable = { query: <T = Record<string, unknown>>(sql: string, values?: unknown[]) => Promise<{ rows: T[] }> };

export type ResolvedPayee = {
  vendor_id: string | null;
  customer_id: string | null;
  account_id: string | null;
  party_name: string;
  reason: string;
};

const PATTERN_LABEL: Record<DescribedPayee["pattern"], string> = {
  zelle_to: "Zelle payment to",
  zelle_from: "Zelle payment from",
  wire_in: "wire in from",
  wire_out: "wire out to",
  card: "card purchase at",
  pmnt_sent: "payment sent to",
  ach: "ACH from/to",
  check: "check",
  relay_fuel: "Relay fill at",
  relay_deposit: "Relay wallet deposit",
  merchant: "merchant",
};

/** Party lists, loaded once per run (USMCA scale: hundreds of rows). */
export async function loadPayeeParties(client: Queryable, companyId: string) {
  const vendors = (await client.query<{ id: string; name: string; account_id: string | null }>(
    `SELECT id::text, vendor_name AS name, default_expense_account_id::text AS account_id FROM mdata.vendors
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND vendor_name IS NOT NULL`,
    [companyId]
  )).rows;
  const customers = (await client.query<{ id: string; name: string; account_id: string | null }>(
    `SELECT id::text, customer_name AS name, default_income_account_id::text AS account_id FROM mdata.customers
      WHERE operating_company_id = $1::uuid AND deactivated_at IS NULL AND customer_name IS NOT NULL`,
    [companyId]
  )).rows;
  return { vendors, customers };
}

/** The ONE party the printed name names (vendor for money out, customer for money in), with the reason. Never a guess. */
export function resolveDescribedPayee(
  parsed: DescribedPayee,
  isCredit: boolean,
  parties: Awaited<ReturnType<typeof loadPayeeParties>>
): ResolvedPayee | null {
  if (!parsed.name) return null;
  const pool = isCredit ? parties.customers : parties.vendors;
  const scored = pool
    .map((p) => ({ p, score: payeeNameScore(parsed.name, p.name) }))
    .filter((x) => x.score >= PAYEE_TOKEN_MATCH_MIN)
    .sort((a, b) => b.score - a.score || a.p.name.length - b.p.name.length);
  if (!scored.length) return null;
  if (scored.length > 1 && scored[1]!.score === scored[0]!.score) return null; // ambiguous — say nothing rather than guess
  const best = scored[0]!;
  const kind = isCredit ? "customer" : "vendor";
  return {
    vendor_id: isCredit ? null : best.p.id,
    customer_id: isCredit ? best.p.id : null,
    account_id: best.p.account_id,
    party_name: best.p.name,
    reason: `bank description: ${PATTERN_LABEL[parsed.pattern]} "${parsed.name}" → ${kind} ${best.p.name} (name match ${best.score.toFixed(2)})` +
      (best.p.account_id ? `; category from the ${kind}'s default account` : ""),
  };
}
