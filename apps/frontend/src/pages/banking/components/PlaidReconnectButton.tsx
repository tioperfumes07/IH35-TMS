import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createPlaidUpdateLinkToken, exchangePlaidPublicToken, type PlaidBankAccount } from "../../../api/banking";
import { useAuth } from "../../../auth/useAuth";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";

type Props = {
  operatingCompanyId: string;
  plaidItemId: string;
  onComplete: () => void;
};

export function PlaidReconnectButton({ operatingCompanyId, plaidItemId, onComplete }: Props) {
  const auth = useAuth();
  const { pushToast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const allowed = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  useEffect(() => {
    if (!allowed || !operatingCompanyId || !plaidItemId) {
      setLinkToken(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void createPlaidUpdateLinkToken(operatingCompanyId, plaidItemId)
      .then((res: { link_token: string }) => {
        if (!cancelled) setLinkToken(res.link_token);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLinkToken(null);
          pushToast(String((err as Error).message || "Could not start Plaid update"), "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allowed, operatingCompanyId, plaidItemId, pushToast]);

  const plaidConfig = useMemo(
    () => ({
      token: linkToken,
      onSuccess: (publicToken: string) => {
        setBusy(true);
        void exchangePlaidPublicToken(publicToken, operatingCompanyId)
          .then(() => {
            pushToast("Bank connection updated", "success");
            onComplete();
          })
          .catch((err: unknown) => pushToast(String((err as Error).message || "Update failed"), "error"))
          .finally(() => setBusy(false));
      },
    }),
    [linkToken, onComplete, operatingCompanyId, pushToast]
  );

  const { open, ready } = usePlaidLink(plaidConfig);

  if (!allowed) return null;

  const disabled = loading || busy || !linkToken || !ready;
  return (
    <ActionButton
      type="button"
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        open();
      }}
    >
      {loading || busy ? "Working…" : "Reconnect"}
    </ActionButton>
  );
}

export function plaidItemBadgeLabel(accounts: PlaidBankAccount[]): string {
  let worst: PlaidBankAccount["sync_status"] | null = null;
  let rank = -1;
  for (const a of accounts) {
    const r = syncRank(a.sync_status);
    if (r > rank) {
      rank = r;
      worst = a.sync_status;
    }
  }
  if (worst === "active") return "Healthy";
  if (worst === "needs_reauth") return "Login Required";
  if (worst === "error") return "Error";
  if (worst === "pending") return "Pending";
  if (worst === "disconnected") return "Disconnected";
  return "Unknown";
}

export function plaidItemBadgeClasses(accounts: PlaidBankAccount[]): string {
  const label = plaidItemBadgeLabel(accounts);
  if (label === "Healthy") return "bg-green-100 text-green-800";
  if (label === "Login Required") return "bg-amber-100 text-amber-800";
  if (label === "Error") return "bg-red-100 text-red-800";
  if (label === "Pending") return "bg-gray-100 text-gray-700";
  if (label === "Disconnected") return "bg-gray-200 text-gray-600";
  return "bg-gray-100 text-gray-700";
}

function syncRank(s: PlaidBankAccount["sync_status"]): number {
  switch (s) {
    case "error":
      return 4;
    case "needs_reauth":
      return 3;
    case "pending":
      return 2;
    case "active":
      return 1;
    case "disconnected":
      return 0;
    default:
      return 0;
  }
}
