import { useState } from "react";
import { addAccidentPhoto, setSafetyAccidentStatus, spawnSafetyLiability, spawnSafetyWo } from "../../api/safety";
import { Button } from "../Button";
import { TwoSectionLineEditor, type TwoSectionLine } from "../forms/TwoSectionLineEditor";
import { TotalsStack } from "../forms/shared/TotalsStack";
import { Combobox } from "../shared/Combobox";
import { useToast } from "../Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  accident: Record<string, unknown> | null;
  createMode?: boolean;
  onClose: () => void;
  onUpdated: () => void;
};

export function AccidentReportDrawer({ open, operatingCompanyId, accident, createMode = false, onClose, onUpdated }: Props) {
  const { pushToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [spawnedWoDisplayId, setSpawnedWoDisplayId] = useState<string | null>(null);
  const [costLines, setCostLines] = useState<TwoSectionLine[]>([]);
  const [taxRate, setTaxRate] = useState(8.25);
  if (!open || !accident) return null;
  const id = String(accident.id ?? "");
  const canMutate = Boolean(id) && !createMode;
  const subtotal = costLines.reduce((sum, line) => {
    if (line.section === "A") return sum + Number(line.amount || 0);
    const subRowsTotal = (line.sub_rows ?? []).reduce((rowSum, row) => rowSum + Number(row.amount || 0), 0);
    return sum + Math.max(Number(line.amount || 0), subRowsTotal);
  }, 0);

  const setStatus = (status: string) => {
    if (!canMutate) {
      pushToast("Save the accident report from Driver PWA intake before updating status.", "info");
      return;
    }
    void setSafetyAccidentStatus(id, operatingCompanyId, status)
      .then(() => {
        pushToast("Accident status updated", "success");
        onUpdated();
      })
      .catch((error) => pushToast(String((error as Error).message || "Failed"), "error"));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} data-testid="accident-drawer-backdrop" />
      <aside className="fixed right-0 top-0 z-50 h-full w-[480px] overflow-y-auto border-l border-gray-200 bg-white p-4 text-xs" data-testid="accident-report-drawer">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">{createMode ? "Create Accident Report" : "Accident Damage Details"}</h3>
          <button type="button" className="text-gray-500 underline" onClick={onClose}>
            Close
          </button>
        </div>
        {createMode ? (
          <div className="mb-2 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900">
            Office intake uses this form layout. Persisted reports arrive from Driver PWA Report Accident (WF-005) or maintenance accident WO conversion.
          </div>
        ) : null}
        <div className="space-y-2 rounded border border-gray-200 bg-white p-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">Accident Damage Details</div>
          <div className="grid grid-cols-6 gap-2">
            <Field label="Record Type *" className="col-span-1">
              <Combobox
                options={[
                  { value: "accident", label: "Accident" },
                  { value: "damage", label: "Damage" },
                  { value: "vandalism", label: "Vandalism" },
                ]}
                value={"accident"}
                onChange={() => {}}
              />
            </Field>
            <Field label="Service Type" className="col-span-1">
              <Combobox
                options={[
                  { value: "repair", label: "Repair" },
                  { value: "replacement", label: "Replacement" },
                  { value: "tow", label: "Tow only" },
                ]}
                value={"repair"}
                onChange={() => {}}
              />
            </Field>
            <div className="col-span-1" />
            <Field label="Incident Date *" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" defaultValue={String(accident.accident_at ?? "").slice(0, 10)} />
            </Field>
            <Field label="Report Date" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" defaultValue={new Date().toISOString().slice(0, 10)} />
            </Field>
            <Field label="Bill or Expense Number (if applicable)" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>

            <div className="col-span-6 h-2" />
            <Field label="Repair Vendor" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <div className="col-span-4" />
            <Field label="Load" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>

            <div className="col-span-6 h-2" />
            <Field label="Driver" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" defaultValue={String(accident.driver_id ?? "")} />
            </Field>
            <Field label="Unit" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" defaultValue={String(accident.unit_id ?? "")} />
            </Field>
            <div className="col-span-3" />
            <Field label="Class" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 bg-gray-100 px-2" readOnly value="Auto class" />
            </Field>

            <div className="col-span-6 h-2" />
            <Field label="At Fault" className="col-span-1">
              <Combobox
                options={[
                  { value: "no", label: "No" },
                  { value: "yes", label: "Yes" },
                  { value: "disputed", label: "Disputed" },
                ]}
                value={"no"}
                onChange={() => {}}
              />
            </Field>
            <Field label="Police Report Number" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <Field label="Insurance Claim Number" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <div className="col-span-3" />

            <Field label="Location" className="col-span-6">
              <input className="h-8 w-full rounded border border-gray-300 px-2" defaultValue={String(accident.location ?? "")} />
            </Field>
            <Field label="3rd Party Name" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <Field label="3rd Party Plate" className="col-span-1">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <div className="col-span-4" />
            <div className="col-span-6 h-2" />
            <Field label="Vendor Invoice" className="col-span-6">
              <input className="h-8 w-full rounded border border-gray-300 px-2" />
            </Field>
            <Field label="Memo" className="col-span-6">
              <textarea className="w-full rounded border border-gray-300 px-2 py-1" rows={2} defaultValue={String(accident.notes ?? accident.description ?? "")} />
            </Field>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" disabled={!canMutate} onClick={() => setStatus("under-investigation")}>
            Set Investigating
          </Button>
          <Button size="sm" variant="secondary" disabled={!canMutate} onClick={() => setStatus("closed-no-fault")}>
            Close No Fault
          </Button>
          <Button size="sm" variant="secondary" disabled={!canMutate} onClick={() => setStatus("closed-driver-at-fault")}>
            Close Driver Fault
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={!canMutate}
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
            disabled={!canMutate}
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
          <label className={`rounded border border-gray-300 px-2 py-1 text-center ${canMutate ? "" : "opacity-50"}`}>
            <input
              type="file"
              className="hidden"
              disabled={!canMutate}
              data-testid="accident-photo-input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file || !canMutate) return;
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

function Field({ label, children, className }: { label: string; children: JSX.Element; className?: string }) {
  return (
    <div className={`space-y-1 ${className ?? ""}`}>
      <label className="text-[10px] font-semibold uppercase text-gray-600">{label}</label>
      {children}
    </div>
  );
}
