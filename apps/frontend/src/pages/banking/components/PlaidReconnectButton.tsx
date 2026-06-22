import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createPlaidUpdateLinkToken, exchangePlaidPublicToken } from "../../../api/banking";
import { useAuth } from "../../../auth/useAuth";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";

export { plaidItemBadgeClasses, plaidItemBadgeLabel } from "./plaid-item-display";

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
      className="focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
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
