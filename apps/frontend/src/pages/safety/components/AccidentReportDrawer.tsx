import { useState } from "react";
import { addAccidentPhoto, setSafetyAccidentStatus, spawnSafetyLiability, spawnSafetyWo } from "../../../api/safety";
import { Button } from "../../../components/Button";
import { TwoSectionLineEditor, type TwoSectionLine } from "../../../components/forms/TwoSectionLineEditor";
import { TotalsStack } from "../../../components/forms/shared/TotalsStack";
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
  const [spawnedWoDisplayId, setSpawnedWoDisplayId] = useState<string | null>(null);
  const [costLines, setCostLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  if (!open || !accident) return null;
  const id = String(accident.id ?? "");
  const subtotal = costLines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

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
          <h3 className="text-sm font-semibold">Accident Damage Details</h3>
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
                .then((payload) => {
                  const displayId = String(payload.spawned_wo_display_id ?? "");
                  setSpawnedWoDisplayId(displayId || null);
                  pushToast(displayId ? `Spawn WO created (${displayId})` : "Spawn WO requested", "success");
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
        {spawnedWoDisplayId ? (
          <div className="mt-2 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] text-blue-900">
            New WO (source type AC): {spawnedWoDisplayId}
          </div>
        ) : null}
        <div className="mt-3">
          <TwoSectionLineEditor mode="expense" onChange={setCostLines} partsLaborMode="parts-and-labor" />
        </div>
        <div className="mt-2">
          <TotalsStack subtotal={subtotal} taxRate={taxRate} onTaxRateChange={setTaxRate} grandLabel="Accident Total = A + B" />
        </div>
      </aside>
    </>
  );
}
