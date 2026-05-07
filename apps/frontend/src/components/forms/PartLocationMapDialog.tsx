import { LocationMapModal } from "../maintenance/LocationMapModal";

type Props = {
  open: boolean;
  unitUuid?: string;
  selectedCodes: string[];
  multiSelect?: boolean;
  onClose: () => void;
  onApply: (codes: string[]) => void;
};

export function PartLocationMapDialog({ open, selectedCodes, multiSelect = true, onClose, onApply }: Props) {
  return <LocationMapModal open={open} selectedCodes={selectedCodes} onClose={onClose} onApply={onApply} multiSelect={multiSelect} />;
}
