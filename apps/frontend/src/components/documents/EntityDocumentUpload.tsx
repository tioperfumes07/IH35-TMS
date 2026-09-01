import { useState } from "react";
import type { FileEntityType } from "../../api/docs";
import { Button } from "../Button";
import { UploadModal } from "./UploadModal";

export type EntityDocumentUploadProps = {
  entityType: FileEntityType;
  entityId: string;
  entityName: string;
  operatingCompanyId?: string;
  onUploadSuccess?: () => void;
  buttonLabel?: string;
  buttonTestId?: string;
  disabled?: boolean;
};

/**
 * UPL-01 (Cursor slice) — canonical docs.files upload affordance for entity-bound surfaces.
 * One component so profiles/lists stop re-implementing UploadModal wiring (and skipping upload).
 */
export function EntityDocumentUpload({
  entityType,
  entityId,
  entityName,
  operatingCompanyId,
  onUploadSuccess,
  buttonLabel = "+ Upload",
  buttonTestId,
  disabled = false,
}: EntityDocumentUploadProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        data-testid={buttonTestId}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {buttonLabel}
      </Button>
      {open ? (
        <UploadModal
          entityType={entityType}
          entityId={entityId}
          entityName={entityName}
          operatingCompanyId={operatingCompanyId}
          onClose={() => setOpen(false)}
          onUploadSuccess={() => {
            setOpen(false);
            onUploadSuccess?.();
          }}
        />
      ) : null}
    </>
  );
}
