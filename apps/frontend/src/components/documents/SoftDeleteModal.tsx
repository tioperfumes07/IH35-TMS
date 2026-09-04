import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../../api/client";
import { softDeleteFile, type DocsFile } from "../../api/docs";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../Toast";

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
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: () => softDeleteFile(file.id, reason.trim()),
    onSuccess: () => {
      pushToast("Document archived (recoverable for 90 days by Owner)", "info");
      onDeleteSuccess();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 403) {
        setErrorMessage("You do not have permission to archive this document.");
        return;
      }
      setErrorMessage("Failed to archive document.");
    },
  });

  return (
    <Modal open onClose={onClose} title="Archive Document">
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (reason.trim().length < 10) {
            setErrorMessage("Archive reason must be at least 10 characters.");
            return;
          }
          setErrorMessage(null);
          deleteMutation.mutate();
        }}
      >
        <p className="text-xs text-gray-700">
          Archive <strong>{file.original_filename}</strong>? This soft-archives the file (recoverable) — the
          record is retained for audit for 90 days. It is not permanently deleted.
        </p>
        <div className="space-y-1">
          <label className="text-xs font-semibold text-gray-600">Archive reason (required)</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            minLength={10}
            className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-xs"
          />
        </div>
        {errorMessage ? <div className="rounded-sm border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-700">{errorMessage}</div> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="danger" loading={deleteMutation.isPending}>
            Archive
          </Button>
        </div>
      </form>
    </Modal>
  );
}
