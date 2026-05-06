import { useState } from "react";
import { addAccidentPhoto, setSafetyAccidentStatus, spawnSafetyLiability, spawnSafetyWo } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  accident: Record<string, unknown> | null;
  onClose: () => void;
  onUpdated: () => void;
};

export function AccidentReportDrawer({ open, operatingCompanyId, accident, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  const [uploading, setUploading] = useState(false);
  if (!open || !accident) return null;
  const id = String(accident.id ?? "");

  const setStatus = (status: string) => {
    void setSafetyAccidentStatus(id, operatingCompanyId, status)
      .then(() => {
        pushToast("Accident status updated", "success");
        onUpdated();
      })
      .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Accident Report</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>Close</button>
        </div>
        <div className="space-y-1 rounded border border-gray-200 bg-gray-50 p-2">
          <div>Date: {String(accident.accident_at ?? "").slice(0, 16)}</div>
          <div>Location: {String(accident.location ?? "—")}</div>
          <div>Driver: {String(accident.driver_id ?? "—")}</div>
          <div>Unit: {String(accident.unit_id ?? "—")}</div>
          <div>Severity: {String(accident.severity ?? "—")}</div>
          <div>Status: {String(accident.status ?? "open")}</div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={() => setStatus("under-investigation")}>Set Investigating</Button>
          <Button size="sm" variant="secondary" onClick={() => setStatus("closed-no-fault")}>Close No Fault</Button>
          <Button size="sm" variant="secondary" onClick={() => setStatus("closed-driver-at-fault")}>Close Driver Fault</Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void spawnSafetyLiability(id, operatingCompanyId)
                .then(() => {
                  pushToast("Spawn liability requested", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Spawn Liability
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              void spawnSafetyWo(id, operatingCompanyId)
                .then(() => {
                  pushToast("Spawn WO requested", "success");
                  onUpdated();
                })
                .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
            }
          >
            Spawn WO
          </Button>
          <label className="rounded border border-gray-300 px-2 py-1 text-center">
            <input
              type="file"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setUploading(true);
                void addAccidentPhoto(id, operatingCompanyId, file)
                  .then(() => {
                    pushToast("Photo added", "success");
                    onUpdated();
                  })
                  .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"))
                  .finally(() => setUploading(false));
              }}
            />
            {uploading ? "Uploading..." : "Add Photo"}
          </label>
        </div>
      </aside>
    </>
  );
}
