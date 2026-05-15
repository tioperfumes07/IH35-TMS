import type { BankingTile } from "../api/banking";

/** IH 35 Trucking LLC (asset holder) — Wave 1 Phase 5 visibility: WF 3500 only. */
export const BANKING_OC_TRUCKING = "b49a737b-6cf0-43bb-8758-a6c8ff8a2c4e";
/** IH 35 Transportation LLC (Ch.11 DIP) — AMEX 5007 + WF 6103 / 6129 / 6137 only. */
export const BANKING_OC_TRANSPORTATION = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function haystack(tile: BankingTile): string {
  return `${tile.display_name} ${tile.tag} ${tile.account_type}`.toLowerCase();
}

function truckingVisible(tile: BankingTile): boolean {
  return haystack(tile).includes("3500");
}

function transportationVisible(tile: BankingTile): boolean {
  const s = haystack(tile);
  return s.includes("5007") || s.includes("6103") || s.includes("6129") || s.includes("6137") || s.includes("amex");
}

/** Restrict QBO-mirrored banking tiles (account picker KPI row) per operating company. */
export function filterBankingTilesForCompany(tiles: BankingTile[], operatingCompanyId: string): BankingTile[] {
  if (operatingCompanyId === BANKING_OC_TRUCKING) return tiles.filter(truckingVisible);
  if (operatingCompanyId === BANKING_OC_TRANSPORTATION) return tiles.filter(transportationVisible);
  return tiles;
}

/** Restrict Plaid-linked bank account rows per operating company (production allowlists). */
export function filterPlaidBankAccountsForCompany<T extends { account_name?: string | null; account_mask?: string | null }>(
  accounts: T[],
  operatingCompanyId: string
): T[] {
  if (operatingCompanyId === BANKING_OC_TRUCKING) {
    return accounts.filter((a) => `${a.account_name ?? ""} ${a.account_mask ?? ""}`.toLowerCase().includes("3500"));
  }
  if (operatingCompanyId === BANKING_OC_TRANSPORTATION) {
    return accounts.filter((a) => {
      const t = `${a.account_name ?? ""} ${a.account_mask ?? ""}`.toLowerCase();
      return t.includes("5007") || t.includes("6103") || t.includes("6129") || t.includes("6137") || t.includes("amex");
    });
  }
  return accounts;
}
