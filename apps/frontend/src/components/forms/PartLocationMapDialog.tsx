import { LocationMapModal } from "../maintenance/LocationMapModal";
import type { PositionMeta } from "../../lib/positions";

type Props = {
  open: boolean;
  unitUuid?: string;
  selectedCodes: string[];
  allowedCodes?: string[];
  positionMetaByCode?: Record<string, PositionMeta>;
  multiSelect?: boolean;
  onClose: () => void;
  onApply: (codes: string[]) => void;
};

export function PartLocationMapDialog({
  open,
  selectedCodes,
  allowedCodes,
  positionMetaByCode,
  multiSelect = true,
  onClose,
  onApply,
}: Props) {
  return (
    <LocationMapModal
      open={open}
      selectedCodes={selectedCodes}
      allowedCodes={allowedCodes}
      positionMetaByCode={positionMetaByCode}
      onClose={onClose}
      onApply={onApply}
      multiSelect={multiSelect}
    />
  );
}
