/**
 * LST-F3354 — New Account nested create uses the SAME chrome as Lists → CoA → + Create.
 *
 * Previously this file owned a second form (2-col layout, billable toggle, no opening balance)
 * while AccountDrawer owned the QBO Lists create. Operators got two designs for one action.
 *
 * Canonical: AccountDrawer (embedded under ParityDrawer / or full shell from Lists).
 * This module remains the import path for InlineCreateDrawer + surface-bar inventory.
 */
import { AccountDrawer } from "../../../pages/lists/accounting/AccountDrawer";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewAccountDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  return (
    <AccountDrawer
      open
      mode="create"
      account={null}
      operatingCompanyId={operatingCompanyId}
      onClose={onClose}
      embedded
      onSaved={(result) => {
        if (result?.id) onCreated({ id: result.id, label: result.label });
      }}
    />
  );
}
