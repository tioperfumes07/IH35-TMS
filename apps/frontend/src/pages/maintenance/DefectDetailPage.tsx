import { Link, useParams } from "react-router-dom";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMaintenanceDvirDefect, triageMaintenanceDvirDefect } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";

export function DefectDetailPage() {
  const { defectId = "" } = useParams();
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [woModalOpen, setWoModalOpen] = useState(false);
  const [mechanicNotes, setMechanicNotes] = useState("");

  const q = useQuery({
    queryKey: ["maintenance", "dvir-defect", operatingCompanyId, defectId],
    queryFn: () => getMaintenanceDvirDefect(defectId, operatingCompanyId),
    enabled: Boolean(operatingCompanyId && defectId),
  });

  const defect = q.data?.defect;
  const history = useMemo(() => q.data?.triage_history ?? [], [q.data?.triage_history]);

  const triageMut = useMutation({
    mutationFn: (action: "assign" | "escalate" | "close_no_action" | "convert_to_wo") =>
      triageMaintenanceDvirDefect(defectId, {
        operating_company_id: operatingCompanyId,
        action,
        mechanic_notes: mechanicNotes || undefined,
      }),
    onSuccess: async (result) => {
      pushToast(result.work_order_id ? "Work order created from defect" : "Triage saved", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defect", operatingCompanyId, defectId] });
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defects", operatingCompanyId] });
    },
    onError: () => pushToast("Triage failed", "error"),
  });

  const woPrefill = defect
    ? {
        unit_id: defect.unit_id,
        driver_id: defect.driver_id ?? "",
        description: `DVIR defect: ${defect.item_key}\n${defect.notes ?? ""}\n${mechanicNotes}`.trim(),
        wo_type: "repair" as const,
        source_type: "RS" as const,
      }
    : undefined;

  if (!defectId) {
    return <div className="p-4 text-sm text-gray-500">Missing defect id.</div>;
  }

  return (
    <div className="space-y-4" data-testid="maint-dvir-defect-detail">
      <div className="flex items-center gap-2 text-sm">
        <Link to="/maintenance/defects" className="text-blue-700 hover:underline">
          ← Defects inbox
        </Link>
      </div>

      {q.isLoading ? <p className="text-sm text-gray-500">Loading defect…</p> : null}
      {q.isError || (!q.isLoading && !defect) ? (
        <p className="text-sm text-red-600">Defect not found.</p>
      ) : null}

      {defect ? (
        <>
          <header className="rounded border border-gray-200 bg-white p-4">
            <h1 className="text-lg font-semibold text-gray-900">
              {defect.item_key} · {defect.severity}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Unit {defect.unit_number ?? defect.unit_id} · Driver {defect.driver_name ?? "—"} ·{" "}
              {defect.submitted_at ? new Date(defect.submitted_at).toLocaleString() : "—"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{defect.notes || "No driver notes."}</p>
            <p className="mt-2 text-xs text-gray-500">
              Photos: {defect.photo_keys?.length ?? 0} · Status: {defect.triage_status}
              {defect.follow_up_wo_id ? ` · WO ${defect.follow_up_wo_id}` : ""}
            </p>
          </header>

          <section className="rounded border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Mechanic notes</h2>
            <textarea
              rows={3}
              className="mt-2 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              value={mechanicNotes}
              onChange={(event) => setMechanicNotes(event.target.value)}
              placeholder="Shop triage notes…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => triageMut.mutate("assign")}>
                Assign
              </Button>
              <Button size="sm" variant="secondary" onClick={() => triageMut.mutate("escalate")}>
                Escalate
              </Button>
              <Button size="sm" variant="secondary" onClick={() => triageMut.mutate("close_no_action")}>
                Close (no action)
              </Button>
              <Button size="sm" onClick={() => triageMut.mutate("convert_to_wo")}>
                Convert to WO (API)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setWoModalOpen(true)}>
                + Create Work Order
              </Button>
            </div>
          </section>

          <section className="rounded border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Triage history</h2>
            <ul className="mt-2 space-y-1 text-xs text-gray-700">
              {history.map((entry, index) => (
                <li key={`${entry.event_class}-${index}`}>
                  {entry.event_class} · {new Date(entry.created_at).toLocaleString()}
                </li>
              ))}
              {history.length === 0 ? <li className="text-gray-500">No triage events yet.</li> : null}
            </ul>
          </section>

          <CreateWorkOrderModal
            open={woModalOpen}
            operatingCompanyId={operatingCompanyId}
            initialType="repair"
            initialValues={woPrefill}
            onClose={() => setWoModalOpen(false)}
            onCreated={() => {
              setWoModalOpen(false);
              pushToast("Work order created from modal", "success");
            }}
          />
        </>
      ) : null}
    </div>
  );
}
