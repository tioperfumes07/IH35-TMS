import type { PlaidBankAccount } from "../../../api/banking";
import { ActionButton } from "../../../components/shared/ActionButton";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";

export type ConnectionErrorRow = {
  accountId: string;
  label: string;
  syncStatus: PlaidBankAccount["sync_status"];
  lastSyncedAt: string | null;
  plaidItemId: string | null;
};

type Props = {
  accounts: PlaidBankAccount[];
  onFixNow: (account: ConnectionErrorRow) => void;
  onDisconnect: (account: ConnectionErrorRow) => void;
  onRequest: (account: ConnectionErrorRow) => void;
};

function accountLabel(a: PlaidBankAccount): string {
  const name = a.account_name?.trim() || a.institution_name?.trim() || "Bank account";
  return a.account_mask ? `${name}-${a.account_mask}` : name;
}

function errorCopy(status: PlaidBankAccount["sync_status"]): { code: string; message: string } {
  if (status === "needs_reauth") {
    return {
      code: "Login required",
      message: "Username/password not working. Fix now, disconnect, or send a request. All options keep your existing transactions.",
    };
  }
  if (status === "error") {
    return {
      code: "Connection error",
      message: "Feed sync failed. Fix now, disconnect, or send a request. All options keep your existing transactions.",
    };
  }
  if (status === "disconnected") {
    return {
      code: "Account disconnected",
      message: "This account is disconnected from the feed. Reconnect (Fix now) or disconnect permanently. Existing transactions stay.",
    };
  }
  return {
    code: "Feed stale",
    message: "Sync is not healthy. Fix now, disconnect, or send a request. Existing transactions stay.",
  };
}

/** B-3 §16 — per-account connection-error strip. Never silently stale. */
export function BankingHomeConnectionErrorStrip({
  accounts,
  onFixNow,
  onDisconnect,
  onRequest,
}: Props) {
  const broken = accounts.filter(
    (a) =>
      a.is_active &&
      (a.sync_status === "needs_reauth" || a.sync_status === "error" || a.sync_status === "disconnected"),
  );
  if (broken.length === 0) return null;

  return (
    <div
      className="space-y-1.5"
      data-b3-connection-error-strip="1"
      data-testid="banking-home-connection-error-strip"
      role="region"
      aria-label="Bank feed connection errors"
    >
      {broken.map((a) => {
        const row: ConnectionErrorRow = {
          accountId: a.id,
          label: accountLabel(a),
          syncStatus: a.sync_status,
          lastSyncedAt: a.last_synced_at,
          plaidItemId: a.plaid_item_id ?? null,
        };
        const copy = errorCopy(a.sync_status);
        return (
          <div
            key={a.id}
            className="rounded-sm border border-[#E5E7EB] px-2.5 py-2 text-xs"
            style={{ borderLeft: "3px solid #B42318", background: "#FDECEA" }}
            data-testid="banking-connection-error-row"
            data-account-id={a.id}
            data-sync-status={a.sync_status}
          >
            <p className="font-semibold text-[#0F1219]">
              <EntityLink
                kind="bank_account"
                id={a.id}
                label={entityLabel(row.label, a.id, "Account")}
                className="font-semibold text-[#0F1219] underline"
              />{" "}
              — {copy.code}
            </p>
            <p className="mt-0.5 leading-snug text-[#6B7280]">{copy.message}</p>
            {a.last_synced_at ? (
              <p className="mt-0.5 text-[#6B7280]">
                Last synced {new Date(a.last_synced_at).toLocaleString()}
              </p>
            ) : (
              <p className="mt-0.5 text-[#6B7280]">Never synced</p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-2">
              <ActionButton
                type="button"
                data-testid="banking-connection-fix-now"
                onClick={() => onFixNow(row)}
              >
                Fix now
              </ActionButton>
              <ActionButton
                type="button"
                data-testid="banking-connection-disconnect"
                onClick={() => onDisconnect(row)}
              >
                Disconnect
              </ActionButton>
              <ActionButton
                type="button"
                data-testid="banking-connection-request"
                onClick={() => onRequest(row)}
              >
                Send request
              </ActionButton>
            </div>
          </div>
        );
      })}
    </div>
  );
}
