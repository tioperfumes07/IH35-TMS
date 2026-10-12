/**
 * ROUND 443.54-7 / 443.59 — card last4 → related party for Banking suggested pairs.
 *
 * Owner map (Lead design 2026-10-11 10:00 CT):
 *   0210, 6248 = Jorge → 2410-00-001
 *   9855       = Tio Perfumes 2 → 2410-00-003
 *   0275       = suggested Scentsx → 2410-00-002 (NOT confirmed — suggestion only)
 *   1354/4823/9708 = Transportation → 8000
 *   0680       = USMCA own card — EXCLUDE from related-party pairing
 *
 * Confirm never auto-pairs. Card 0275 stays card_confirmed=false until the owner names it.
 */

export type RelatedPartyCardParty = {
  party_key: string;
  counterparty_name: string;
  relationship: "owner" | "spouse" | "related_company" | "other";
  /** CoA account_number for Due to/from <party> (or 8000 Transportation). */
  liability_account_number: string;
  /** False when the card→party link is a suggestion only (0275). */
  card_confirmed: boolean;
  label: string;
};

/** USMCA's own Relay funding card — never a related-party pair deposit. */
export const USMCA_OWN_RELAY_CARD_LAST4 = "0680";

/** Bank-feed text that marks a USMCA-own Relay Atlanta top-up (not a related-party send). */
export const RELAY_ATLANTA_OWN_CARD_PATTERN = /RELAY\s+ATLANTA.*260680/i;

export const RELATED_PARTY_CARD_MAP: Readonly<Record<string, RelatedPartyCardParty>> = Object.freeze({
  "0210": {
    party_key: "jorge",
    counterparty_name: "Jorge Pablo Guadalupe Muñoz Gonzalez",
    relationship: "owner",
    liability_account_number: "2410-00-001",
    card_confirmed: true,
    label: "Jorge personal card",
  },
  "6248": {
    party_key: "jorge",
    counterparty_name: "Jorge Pablo Guadalupe Muñoz Gonzalez",
    relationship: "owner",
    liability_account_number: "2410-00-001",
    card_confirmed: true,
    label: "Jorge personal Bank of America debit",
  },
  "9855": {
    party_key: "tio_perfumes_2",
    counterparty_name: "Tio Perfumes 2 LLC",
    relationship: "related_company",
    liability_account_number: "2410-00-003",
    card_confirmed: true,
    label: "Tio Perfumes 2",
  },
  // Suggestion only — Zelle Scentsx 2,065 equals 0275 deposit; owner has not confirmed the card.
  "0275": {
    party_key: "scentsx",
    counterparty_name: "Scentsx LLC",
    relationship: "related_company",
    liability_account_number: "2410-00-002",
    card_confirmed: false,
    label: "Suggested Scentsx (card not confirmed)",
  },
  "1354": {
    party_key: "transportation",
    counterparty_name: "IH35 Transportation",
    relationship: "related_company",
    liability_account_number: "8000",
    card_confirmed: true,
    label: "Transportation Wells Fargo",
  },
  "4823": {
    party_key: "transportation",
    counterparty_name: "IH35 Transportation",
    relationship: "related_company",
    liability_account_number: "8000",
    card_confirmed: true,
    label: "Transportation Wells Fargo",
  },
  "9708": {
    party_key: "transportation",
    counterparty_name: "IH35 Transportation",
    relationship: "related_company",
    liability_account_number: "8000",
    card_confirmed: true,
    label: "Transportation Wells Fargo",
  },
});

export function partyForCard(last4: string | null | undefined): RelatedPartyCardParty | null {
  if (!last4) return null;
  if (last4 === USMCA_OWN_RELAY_CARD_LAST4) return null;
  return RELATED_PARTY_CARD_MAP[last4] ?? null;
}

/** Bank-line description heuristics for related-party money-out (unpaired rows). */
export function describeBankLinePartyHint(description: string | null): {
  party_key: string | null;
  counterparty_name: string | null;
  kind: "zelle" | "idcgr" | "other" | null;
} {
  const d = description ?? "";
  if (RELAY_ATLANTA_OWN_CARD_PATTERN.test(d)) {
    return { party_key: null, counterparty_name: null, kind: null };
  }
  if (/IDCGR/i.test(d)) {
    return { party_key: "jorge", counterparty_name: "Jorge Pablo Guadalupe Muñoz Gonzalez", kind: "idcgr" };
  }
  if (/scentsx/i.test(d)) {
    return { party_key: "scentsx", counterparty_name: "Scentsx LLC", kind: "zelle" };
  }
  if (/zelle/i.test(d) && /tio\s*perfumes/i.test(d)) {
    return { party_key: "tio_perfumes_2", counterparty_name: "Tio Perfumes 2 LLC", kind: "zelle" };
  }
  if (/zelle/i.test(d) && /laura/i.test(d)) {
    return { party_key: "laura", counterparty_name: "Laura Muñoz", kind: "zelle" };
  }
  if (/zelle/i.test(d)) {
    return { party_key: null, counterparty_name: null, kind: "zelle" };
  }
  return { party_key: null, counterparty_name: null, kind: null };
}

export function isRelatedPartyOutboundCandidate(description: string | null): boolean {
  const d = description ?? "";
  if (RELAY_ATLANTA_OWN_CARD_PATTERN.test(d)) return false;
  return /zelle/i.test(d) || /IDCGR/i.test(d);
}
