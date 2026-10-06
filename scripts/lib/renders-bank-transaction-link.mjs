/**
 * ONE rule for "this detail page links its document to the bank line" (Law §9 reverse hop).
 *
 * BANK-F31517 (#23917) moved the detail pages' bank link into the shared OnlineBankingMatchBanner
 * (components/accounting/OnlineBankingMatchBanner.tsx), which renders <EntityLink kind="bank_transaction">. Guards that
 * searched each page for the literal went red on every page that adopted the banner, though the link is on screen.
 *
 * A page renders the link when EITHER it contains kind="bank_transaction" itself, OR it mounts the banner WITH its
 * document's matched bank id (bankTransactionId={<doc>.matched_bank_transaction_id}) AND the banner renders the link.
 * Both halves are required for the banner path — a banner fed something else, or a banner that lost its link, fails.
 */
export const BANNER_REL = "apps/frontend/src/components/accounting/OnlineBankingMatchBanner.tsx";

export function rendersBankTransactionLink(pageSource, bannerSource) {
  const page = String(pageSource ?? "");
  if (/kind=["']bank_transaction["']/.test(page)) return true;
  return (
    /<OnlineBankingMatchBanner[\s\S]{0,300}bankTransactionId=\{\w+\.matched_bank_transaction_id\}/.test(page) &&
    /kind=["']bank_transaction["']/.test(String(bannerSource ?? ""))
  );
}
