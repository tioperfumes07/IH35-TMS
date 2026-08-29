import { apiRequest } from "./client";

// Relay deposit-funding review (Part B). DISPLAY + card-map config only — no posting.
// See docs/trackers/RELAY-DEPOSIT-FUNDING-RECON-2026-07-12.md.

export type RelayDepositClassification = "company" | "unclassified" | "canceled";

export type RelayDepositRow = {
  id: string;
  deposit_id: string;
  relay_created_at: string;
  status: string;
  total_amount_cents: number;
  funding_card_last4: string | null;
  note_raw: string | null;
  classification: RelayDepositClassification;
  matched_bank_transaction_id: string | null;
};

export type RelayDepositSummaryRow = { classification: RelayDepositClassification; n: number; settled_cents: number };
export type RelayDepositByCardRow = { funding_card_last4: string | null; classification: RelayDepositClassification; n: number; settled_cents: number };

export type RelayDepositsResponse = {
  operating_company_id: string;
  count: number;
  deposits: RelayDepositRow[];
  summary: RelayDepositSummaryRow[];
  by_card: RelayDepositByCardRow[];
};

export type RelayCompanyCard = { id: string; card_last4: string; label: string | null; source_hint: string | null; is_active: boolean };
export type RelayCompanyCardsResponse = { operating_company_id: string; cards: RelayCompanyCard[] };

export function getRelayDeposits(operatingCompanyId: string, classification?: RelayDepositClassification): Promise<RelayDepositsResponse> {
  const q = new URLSearchParams({ operating_company_id: operatingCompanyId });
  if (classification) q.set("classification", classification);
  return apiRequest<RelayDepositsResponse>(`/api/integrations/relay/deposits?${q.toString()}`);
}

export function getRelayCompanyCards(operatingCompanyId: string): Promise<RelayCompanyCardsResponse> {
  return apiRequest<RelayCompanyCardsResponse>(`/api/integrations/relay/company-cards?operating_company_id=${encodeURIComponent(operatingCompanyId)}`);
}

export function putRelayCompanyCard(
  operatingCompanyId: string,
  body: { card_last4: string; label?: string; source_hint?: string; is_active?: boolean }
): Promise<{
  operating_company_id: string;
  id: string;
  card_last4: string;
  label: string | null;
  source_hint: string | null;
  is_active: boolean;
  reclassified_deposits: number;
}> {
  return apiRequest(`/api/integrations/relay/company-cards?operating_company_id=${encodeURIComponent(operatingCompanyId)}`, {
    method: "PUT",
    body,
  });
}

// B3a — owner-triggered historical Relay fuel backfill (3-day windows, idempotent). Returns 202 immediately;
// the pull runs in the background and rows land in integrations.relay_fuel_transactions as windows complete.
export function runRelayFuelBackfill(
  operatingCompanyId: string,
  months: number
): Promise<{ status: string; months: number; operating_company_id: string }> {
  return apiRequest(`/api/integrations/relay/fuel/backfill`, {
    method: "POST",
    body: { operating_company_id: operatingCompanyId, months },
  });
}
