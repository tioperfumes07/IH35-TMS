import { useEffect, useMemo, useState } from "react";
import { usePlaidLink } from "react-plaid-link";
import { createPlaidLinkToken, exchangePlaidPublicToken, type PlaidBankAccount, type PlaidLinkAccountType } from "../../api/banking";
import { useAuth } from "../../auth/useAuth";
import { ActionButton } from "../shared/ActionButton";
import { useToast } from "../Toast";

type Props = {
  operatingCompanyId: string;
  onSuccess: (accounts: PlaidBankAccount[]) => void;
  accountType?: PlaidLinkAccountType;
  label: string;
};

const ALLOWED_ROLES = new Set(["Owner", "Administrator"]);

export function PlaidLinkButton({ operatingCompanyId, onSuccess, accountType = "bank", label }: Props) {
  const auth = useAuth();
  const { pushToast } = useToast();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [exchanging, setExchanging] = useState(false);

  const isAllowed = ALLOWED_ROLES.has(auth.user?.role ?? "");
  const hasCompany = Boolean(operatingCompanyId);

  useEffect(() => {
    if (!isAllowed || !hasCompany) {
      setLinkToken(null);
      return;
    }
    let cancelled = false;
    setLoadingToken(true);
    void createPlaidLinkToken(operatingCompanyId, accountType)
      .then((res) => {
        if (!cancelled) {
          setLinkToken(res.link_token);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLinkToken(null);
          pushToast(String((error as Error).message || "Unable to initialize Plaid Link"), "error");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingToken(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAllowed, hasCompany, operatingCompanyId, accountType, pushToast]);

  const plaidConfig = useMemo(
    () => ({
      token: linkToken,
      // react-plaid-link v5 widened PlaidLinkOnSuccess from (public_token: string, ...) to
      // (public_token: string | null, ...). That is not a typing nuisance to cast away — it is Plaid
      // telling us Link can now finish WITHOUT a public token, and this handler used to feed whatever
      // it received straight into exchangePlaidPublicToken. Casting would have POSTed a null token to
      // the exchange endpoint and surfaced a generic "Bank connection failed" with no cause.
      onSuccess: (publicToken: string | null, metadata: { institution?: { name?: string | null } | null }) => {
        if (!publicToken) {
          pushToast("Plaid returned no public token — the bank connection was not completed. Please try again.", "error");
          setExchanging(false);
          return;
        }
        setExchanging(true);
        void exchangePlaidPublicToken(publicToken, operatingCompanyId)
          .then((res) => {
            const count = res.accounts.length;
            const institutionName = metadata?.institution?.name || res.accounts[0]?.institution_name || "Bank";
            pushToast(`Connected: ${institutionName} - ${count} account${count === 1 ? "" : "s"}`, "success");
            onSuccess(res.accounts);
          })
          .catch((error) => {
            pushToast(String((error as Error).message || "Bank connection failed"), "error");
          })
          .finally(() => {
            setExchanging(false);
          });
      },
    }),
    [linkToken, onSuccess, operatingCompanyId, pushToast]
  );

  const { open, ready } = usePlaidLink(plaidConfig);
  if (!isAllowed) return null;

  const disabled = !hasCompany || !linkToken || !ready || loadingToken || exchanging;
  return (
    <ActionButton
      onClick={() => {
        if (disabled) return;
        open();
      }}
      disabled={disabled}
    >
      {loadingToken || exchanging ? "Connecting..." : label}
    </ActionButton>
  );
}

