/**
 * LST-F3360 — New Service nested create uses the SAME chrome as Lists → Products & Services.
 *
 * Previously this file owned a second form while ItemEditorModal owned the QBO Lists create.
 * Operators got two designs for one action.
 *
 * Canonical: ItemEditorModal (embedded under ParityDrawer / or full Modal shell from Lists).
 * This module remains the import path for InlineCreateDrawer + surface-bar inventory.
 */
import { itemsCatalogClient } from "../../../api/catalogs-accounting";
import { ItemEditorModal } from "../../../pages/lists/accounting/ItemEditorModal";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewServiceDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  return (
    <ItemEditorModal
      open
      mode="create"
      row={null}
      operatingCompanyId={operatingCompanyId}
      client={itemsCatalogClient}
      embedded
      onClose={onClose}
      onSaved={(result) => {
        if (result?.id) onCreated({ id: result.id, label: result.label });
      }}
    />
  );
}
