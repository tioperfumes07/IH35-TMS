/**
 * LST-F3362 — New Class nested create uses the SAME chrome as Lists → Classes.
 *
 * Previously this file owned a name-only form while AccountingCatalogModal owned the
 * QBO Lists create (code/name/description/sort). Operators got two designs for one action.
 *
 * Canonical: AccountingCatalogModal (embedded under ParityDrawer / or full shell from Lists).
 * This module remains the import path for InlineCreateDrawer + surface-bar inventory.
 */
import { classesCatalogClient } from "../../../api/catalogs-accounting";
import { AccountingCatalogModal } from "../../../pages/lists/accounting/AccountingCatalogModal";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewClassDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  return (
    <AccountingCatalogModal
      open
      mode="create"
      row={null}
      operatingCompanyId={operatingCompanyId}
      displayName="Class"
      client={classesCatalogClient}
      embedded
      onClose={onClose}
      onSaved={(result) => {
        if (result?.id) onCreated({ id: result.id, label: result.label });
      }}
    />
  );
}
