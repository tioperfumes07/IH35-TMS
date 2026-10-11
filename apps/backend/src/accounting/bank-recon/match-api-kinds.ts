import { z } from "zod";

/** Kinds POST /bank-recon/accept-match may persist (subset of LedgerEntryKind). */
export const BANK_MATCH_ACCEPT_KINDS = [
  "payment",
  "bill_payment",
  "transfer",
  "je",
  "expense",
  "deposit",
  "relay_fuel",
  "relay_deposit",
] as const;

export const bankMatchAcceptKindSchema = z.enum(BANK_MATCH_ACCEPT_KINDS);

/** Kinds GET .../match-candidates `kinds` filter may request (includes view-only bill). */
export const BANK_MATCH_FILTER_KINDS = [
  "payment",
  "bill_payment",
  "transfer",
  "je",
  "bill",
  "expense",
  "deposit",
  "relay_fuel",
  "relay_deposit",
] as const;

export const bankMatchFilterKindSchema = z.enum(BANK_MATCH_FILTER_KINDS);
