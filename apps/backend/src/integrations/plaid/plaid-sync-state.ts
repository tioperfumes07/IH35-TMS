import { withLuciaBypass } from "../../auth/db.js";

export async function markPlaidItemSyncSucceeded(itemId: string): Promise<number> {
  return withLuciaBypass(async (client) => {
    const res = await client.query(
      `
        UPDATE banking.bank_accounts
        SET
          last_synced_at = now(),
          sync_status = 'active',
          updated_at = now()
        WHERE plaid_item_id = $1
          AND is_active = true
      `,
      [itemId]
    );
    return res.rowCount ?? 0;
  });
}

export function plaidManualSyncErrorResponse(errorCode: string | undefined): {
  statusCode: number;
  body: Record<string, unknown>;
} | null {
  if (errorCode === "ITEM_LOGIN_REQUIRED") {
    return {
      statusCode: 409,
      body: { error: "item_login_required", reconnect_required: true, code: "ITEM_LOGIN_REQUIRED" },
    };
  }
  return null;
}
