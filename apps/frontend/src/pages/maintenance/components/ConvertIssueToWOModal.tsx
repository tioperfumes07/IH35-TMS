import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { convertIssueToWo, type ArrivingSoonCard } from "../../../api/maintenance";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  card: ArrivingSoonCard | null;
  onClose: () => void;
  onDone: () => void;
};

export function ConvertIssueToWOModal({ open, operatingCompanyId, card, onClose, onDone }: Props) {
  const { pushToast } = useToast();
  const suggested = card?.suggested_wo_source_type ?? "IS";
  const [sourceType, setSourceType] = useState<"IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS">("IS");
  const [notes, setNotes] = useState("");

  const selectedIssueId = useMemo(() => String(card?.issues?.[0]?.issue_id ?? ""), [card]);

  useEffect(() => {
    setSourceType(suggested);
  }, [suggested]);

  const mutation = useMutation({
    mutationFn: () => convertIssueToWo(String(card!.load_id), operatingCompanyId, { issue_id: selectedIssueId, wo_source_type: sourceType, additional_notes: notes || undefined }),
    onSuccess: (payload) => {
      pushToast(`WO created: ${String(payload.wo.display_id ?? payload.wo.id)}`, "success");
      if (payload.unit_blocked) pushToast("Unit auto-blocked for dispatch (severe issue)", "info");
      onDone();
    },
    onError: (error) => pushToast(String((error as Error).message || "Failed to convert issue"), "error"),
  });

  if (!open || !card) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed inset-x-0 top-20 z-50 mx-auto w-full max-w-xl rounded border border-gray-200 bg-white p-4 text-xs shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Convert Issue to WO</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="space-y-2">
          <div className="rounded border border-gray-200 bg-gray-50 p-2">
            {card.unit_number} · {card.driver_name ?? "Unassigned"} · {card.load_display_id}
          </div>
          <label className="space-y-1">
            <span>WO Source Type</span>
            <select
              className="h-8 w-full rounded border border-gray-300 px-2 text-sm"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as "IS" | "ES" | "AC" | "ET" | "RT" | "IT" | "RS")}
            >
              {["IS", "ES", "AC", "ET", "RT", "IT", "RS"].map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <div className="text-[11px] text-gray-600">Suggested type: {suggested}</div>
          <label className="space-y-1">
            <span>Additional notes</span>
            <textarea className="w-full rounded border border-gray-300 px-2 py-1 text-sm" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            loading={mutation.isPending}
            onClick={() => {
              if (!selectedIssueId) {
                pushToast("No open issue selected", "error");
                return;
              }
              mutation.mutate();
            }}
          >
            + Create WO
          </Button>
        </div>
      </div>
    </>
  );
}
