/**
 * Canonical Create Customer drawer — same CustomerProfileForm as Customers +Create / inline create.
 * Hosted on the approved PartyBoard when ?create=1 (no legacy master-detail mount).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useLocation} from "react-router-dom";
import { currentOriginHref, withReturnContext } from "../../lib/returnContext";
import { Modal } from "../Modal";
import { NewCustomerDrawerForm } from "../parity/drawers/NewCustomerDrawerForm";

type Props = {
  open: boolean;
  onClose: () => void;
  operatingCompanyId: string;
};

export function CustomerCreateModal({ open, onClose, operatingCompanyId }: Props) {
  const { pathname, search: locSearch } = useLocation();
  const originHref = currentOriginHref(pathname, locSearch);
  const moneyHref = (target: string) => withReturnContext(target, originHref);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  if (!operatingCompanyId) return null;
  return (
    <Modal
      variant="drawer"
      open={open}
      onClose={onClose}
      title="Create Customer"
      modalKind="customer-create"
      sizePreset="xl"
    >
      {open ? (
        <NewCustomerDrawerForm
          operatingCompanyId={operatingCompanyId}
          onClose={onClose}
          onCreated={async (result) => {
            await queryClient.invalidateQueries({ queryKey: ["party-board"] });
            await queryClient.invalidateQueries({ queryKey: ["customers"] });
            if (result?.id) navigate(moneyHref(`/customers/${result.id}`));
          }}
        />
      ) : null}
    </Modal>
  );
}
