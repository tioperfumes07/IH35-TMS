import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { softDeleteFile, type DocsFile } from "../../api/docs";
import { useToast } from "../Toast";
import { VoidReasonModal } from "../accounting/VoidReasonModal";

type SoftDeleteModalProps = {
  file: DocsFile;
  onClose: () => void;
  onDeleteSuccess: () => void;
};

/**
 * LIVE FAIL LV-DOCS-SOFT-DELETE-DESTRUCTIVE-COPY (Codex HANDOFF):
 * Modal said Soft Delete / Delete / "You are deleting" while the API is recoverable void.
 * Match Fleet archive chrome: Archive + recoverable retention copy.
 */
export function SoftDeleteModal({ file, onClose, onDeleteSuccess }: SoftDeleteModalProps) {
  const { pushToast } = useToast();

  const deleteMutation = useMutation({
    mutationFn: (reason: string) => softDeleteFile(file.id, reason),
    onSuccess: () => {
      pushToast("Document archived (recoverable for 90 days by Owner)", "info");
      onDeleteSuccess();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) {
        throw new Error("You do not have permission to archive this document.");
      }
      throw new Error("Failed to archive document.");
    },
  });

  return (
    <VoidReasonModal
      open
      title={`Archive ${file.original_filename}`}
      onClose={onClose}
      onSubmit={async (reason) => { await deleteMutation.mutateAsync(reason); }}
      submitLabel="Archive"
    />
  );
}
