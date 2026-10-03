// ROUND 363-CC2-D (CC-2) — the item and the account a document line posts to, chosen by the user at creation.
//
// One resolver for every wizard line (fuel, company expense, driver reimbursement) and for both the preview and the
// post, so the preview can never show one account and the post use another. The rules:
//   - an account the user picked wins; it must be the company's own and active
//   - else the picked item's default expense account (the item must be the company's or global, and active)
//   - neither picked: null — the caller keeps its own documented default (fuel: the fuel-type item map)
// Never a guessed account: a pick that does not resolve is refused by name.

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }> };

export type ResolvedLineAccount = {
  item_id: string | null;
  item_name: string | null;
  account_id: string;
  account_number: string | null;
  account_name: string | null;
};

export async function resolveLineItemAndAccount(
  client: Queryable,
  operatingCompanyId: string,
  pick: { item_id?: string | null; account_id?: string | null }
): Promise<ResolvedLineAccount | { refused: string } | null> {
  const itemId = pick.item_id || null;
  const accountId = pick.account_id || null;
  if (!itemId && !accountId) return null;

  type Item = { id: string; item_name: string; default_expense_account_id: string | null };
  let item: Item | null = null;
  if (itemId) {
    const r = await client.query(
      `SELECT id::text, item_name, default_expense_account_id::text
         FROM catalogs.items
        WHERE id = $2::uuid AND (operating_company_id = $1::uuid OR operating_company_id IS NULL) AND deactivated_at IS NULL`,
      [operatingCompanyId, itemId]
    );
    item = (r.rows[0] as Item | undefined) ?? null;
    if (!item) return { refused: `item ${itemId} is not an active item of this company` };
  }

  const target = accountId ?? item?.default_expense_account_id ?? null;
  if (!target) return { refused: `item "${item?.item_name}" has no default expense account — pick the account on the line` };
  const a = await client.query(
    `SELECT id::text, account_number, account_name
       FROM catalogs.accounts
      WHERE id = $2::uuid AND operating_company_id = $1::uuid AND deactivated_at IS NULL`,
    [operatingCompanyId, target]
  );
  const acct = a.rows[0] as { id: string; account_number: string | null; account_name: string | null } | undefined;
  if (!acct) return { refused: `account ${target} is not an active account of this company` };
  return { item_id: item?.id ?? null, item_name: item?.item_name ?? null, account_id: acct.id, account_number: acct.account_number, account_name: acct.account_name };
}
