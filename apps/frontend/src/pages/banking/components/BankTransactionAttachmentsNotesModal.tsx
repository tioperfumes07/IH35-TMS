import { useEffect, useState } from "react";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Button } from "../../../components/Button";
import { UploadZone } from "../../../components/UploadZone";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { addBankTransactionNote, type PlaidBankTransaction } from "../../../api/banking";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  tx: PlaidBankTransaction | null;
  onClose: () => void;
  onNoteSaved: (transactionId: string, notes: string | null) => void;
};

// ACCT-F5621 — replaces the two permanently-disabled paperclip/note icons (BANK-F5429) now that
// documents.attachments accepts entity_type='bank_transaction' and a real notes PATCH route exists.
// Attachments reuse the same UploadZone every other module (bills, expenses, loads) already uses;
// notes are append-only (server concatenates, never overwrites — see banking.ts's addBankTransactionNote).
export function BankTransactionAttachmentsNotesModal({ open, operatingCompanyId, tx, onClose, onNoteSaved }: Props) {
  const toast = useToast();
  const [draftNote, setDraftNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraftNote("");
  }, [tx?.id]);

  if (!tx) return null;

  async function saveNote() {
    if (!tx || !draftNote.trim()) return;
    setSaving(true);
    try {
      const result = await addBankTransactionNote(tx.id, operatingCompanyId, draftNote.trim());
      onNoteSaved(tx.id, result.notes);
      setDraftNote("");
      toast.pushToast("Note saved.", "success");
    } catch (error) {
      toast.pushToast(userFacingApiError(error, "Failed to save note"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ParityDrawer
      open={open}
      title="Attachments & notes"
      subtitle={tx.description || tx.merchant_name || "Bank transaction"}
      onClose={onClose}
    >
      <div className="space-y-4 p-4">
        <UploadZone
          operatingCompanyId={operatingCompanyId}
          entityType="bank_transaction"
          entityId={tx.id}
          title="Attachments"
        />
        <div className="rounded-sm border border-slate-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">Notes</h3>
          {tx.notes ? (
            <pre className="mb-2 whitespace-pre-wrap rounded-sm border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
              {tx.notes}
            </pre>
          ) : (
            <p className="mb-2 text-xs text-slate-500">No notes yet.</p>
          )}
          <textarea
            className="w-full rounded-sm border border-slate-300 p-2 text-xs"
            rows={3}
            placeholder="Add a note…"
            value={draftNote}
            onChange={(event) => setDraftNote(event.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" onClick={() => void saveNote()} disabled={saving || !draftNote.trim()}>
              {saving ? "Saving…" : "Add note"}
            </Button>
          </div>
        </div>
      </div>
    </ParityDrawer>
  );
}
