/**
 * LST-F3364 — nested +Add new vendor uses the SAME chrome as Lists → Vendors Create.
 *
 * Previously this file owned a thinner contact form (including a boxed Billing address
 * fieldset) while VendorCreateModal owned the full QBO create. Operators got two designs
 * for one action.
 *
 * Canonical: VendorCreateModal (embedded under ParityDrawer / or full Modal from Lists).
 * This module remains the import path for InlineCreateDrawer + surface-bar inventory.
 */
import { VendorCreateModal } from "../../vendors/VendorCreateModal";
import type { InlineCreateResult } from "../InlineCreateDrawer";

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewVendorDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  return (
    <VendorCreateModal
      open
      operatingCompanyId={operatingCompanyId}
      embedded
      onClose={onClose}
      onSaved={(result) => {
        onCreated({ id: result.id, label: result.label });
      }}
    />
  );
}
