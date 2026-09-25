/**
 * R-186.1 (owner 2026-09-25): pre-settlement numbers are EDITABLE.
 * P-NNNN stays on display_id; bare AlwaysTrack digits are written to source_document_ref.
 */
import { useState } from "react";
import { Button } from "../../../components/Button";

export function SettlementNumberBox({
  displayId,
  sourceDocumentRef,
  editable,
  onSave,
}: {
  displayId: string | null;
  sourceDocumentRef?: string | null;
  editable?: boolean;
  onSave?: (value: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayId ?? "");
  const [busy, setBusy] = useState(false);

  if (!editable || !onSave) {
    return (
      <div data-testid="settlement-number-box">
        <div className="text-section-header font-bold uppercase text-[#4B5563]">Settlement/Tour</div>
        <div className="text-xs font-semibold" data-testid="settlement-number-box-frozen">
          {displayId ?? "—"}
          {sourceDocumentRef ? (
            <span className="ml-2 font-normal text-[#6B7280]">AT {sourceDocumentRef}</span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div data-testid="settlement-number-box">
      <div className="text-section-header font-bold uppercase text-[#4B5563]">Settlement/Tour (editable)</div>
      {editing ? (
        <div className="mt-1 flex items-center justify-center gap-2">
          <input
            className="h-7 w-28 rounded-sm border border-[#E5E7EB] px-2 text-center text-xs text-[#0F1219]"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="P-0004 or AT #"
            data-testid="settlement-number-box-input"
          />
          <Button
            type="button"
            size="sm"
            disabled={busy || !draft.trim()}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(draft.trim());
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
            data-testid="settlement-number-box-save"
          >
            Save
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => { setDraft(displayId ?? ""); setEditing(false); }}>
            Cancel
          </Button>
        </div>
      ) : (
        <button
          type="button"
          className="text-xs font-semibold underline-offset-2 hover:underline"
          data-testid="settlement-number-box-edit"
          onClick={() => {
            setDraft(displayId ?? "");
            setEditing(true);
          }}
        >
          {displayId ?? "—"}
          {sourceDocumentRef ? (
            <span className="ml-2 font-normal text-[#6B7280]">AT {sourceDocumentRef}</span>
          ) : null}
        </button>
      )}
    </div>
  );
}
