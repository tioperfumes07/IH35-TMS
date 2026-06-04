import { PlaidLinkButton } from "./PlaidLinkButton";
import type { PlaidBankAccount, PlaidLinkAccountType } from "../../api/banking";

type Props = {
  operatingCompanyId: string;
  onSuccess: (accounts: PlaidBankAccount[]) => void;
  accountType?: PlaidLinkAccountType;
  label?: string;
};

/** P5-T1.3 canonical Plaid Link entry (wraps legacy PlaidLinkButton). */
export function PlaidLink({ operatingCompanyId, onSuccess, accountType = "bank", label = "Connect bank" }: Props) {
  return (
    <PlaidLinkButton
      operatingCompanyId={operatingCompanyId}
      onSuccess={onSuccess}
      accountType={accountType}
      label={label}
    />
  );
}
