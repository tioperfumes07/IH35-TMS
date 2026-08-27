import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getMaintenanceDvirDefect, triageMaintenanceDvirDefect } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { CreateWorkOrderModal } from "./components/CreateWorkOrderModal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { hasInAppHistory } from "../../lib/smart-back";

export function DefectDetailPage() {
  const { defectId = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId, companies } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? companies[0]?.id ?? "";
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const [woModalOpen, setWoModalOpen] = useState(false);
  const [mechanicNotes, setMechanicNotes] = useState("");
  const [historyPage, setHistoryPage] = useState(0);
  const historyPageSize = 25;
  const actionGenerationRef = useRef(0);

  const q = useQuery({
    queryKey: ["maintenance", "dvir-defect", operatingCompanyId, defectId, historyPage],
    queryFn: () => getMaintenanceDvirDefect(defectId, operatingCompanyId, { limit: historyPageSize, offset: historyPage * historyPageSize }),
    enabled: Boolean(operatingCompanyId && defectId),
  });

  const defect = q.data?.defect;
  const history = useMemo(() => q.data?.triage_history ?? [], [q.data?.triage_history]);
  const historyTotal = q.data?.triage_history_total ?? 0;

  const triageMut = useMutation({
    mutationFn: (input: {
      defectId: string;
      companyId: string;
      generation: number;
      action: "assign" | "escalate" | "close_no_action" | "convert_to_wo";
      mechanicNotes?: string;
    }) =>
      triageMaintenanceDvirDefect(input.defectId, {
        operating_company_id: input.companyId,
        action: input.action,
        mechanic_notes: input.mechanicNotes,
      }),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast(result.work_order_id ? "Work order created from defect" : "Triage saved", "success");
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defect", input.companyId, input.defectId] });
      await qc.invalidateQueries({ queryKey: ["maintenance", "dvir-defects", input.companyId] });
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Triage failed", "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    triageMut.reset();
    setMechanicNotes("");
    setWoModalOpen(false);
    setHistoryPage(0);
  }, [operatingCompanyId, defectId]);

  const runTriage = (action: "assign" | "escalate" | "close_no_action" | "convert_to_wo") => {
    triageMut.mutate({
      defectId,
      companyId: operatingCompanyId,
      generation: actionGenerationRef.current,
      action,
      mechanicNotes: mechanicNotes.trim() || undefined,
    });
  };

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
      {/*
        UI-BACK-BUTTON-IGNORES-REAL-NAVIGATION-HISTORY: this was a plain <Link to="/maintenance/defects">
        -- always the same hardcoded target regardless of where the user actually came from (e.g. a
        unit profile's defect list, not just the defects inbox). Upgraded to the same smart-back
        pattern as the rest of the app: prefer real in-app history, fall back to the defects inbox
        only on a direct load/refresh.
      */}
      <div className="flex items-center gap-2 text-sm">
        <button
          type="button"
          aria-label="Back"
          onClick={() => {
            if (hasInAppHistory(window.history.state)) {
              navigate(-1);
              return;
            }
            navigate("/maintenance/defects");
          }}
          className="border-0 bg-transparent p-0 text-slate-700 hover:underline"
        >
          ← Defects inbox
        </button>
      </div>

      {q.isLoading ? <p className="text-sm text-gray-500">Loading defect…</p> : null}
      {q.isError || (!q.isLoading && !defect) ? (
        <p className="text-sm text-slate-700" data-testid="maint-dvir-defect-empty">
          Defect not found for this entity — it may be missing, voided, or outside the active operating company.
        </p>
      ) : null}

      {defect ? (
        <>
          <header className="rounded-sm border border-gray-200 bg-white p-4">
            <h1 className="text-lg font-semibold text-gray-900">
              {defect.item_key} · {defect.severity}
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Unit <EntityLinkOrTombstone kind="unit" id={defect.unit_id} name={defect.unit_number} noun="Unit" /> · Driver{" "}
              <EntityLinkOrTombstone kind="driver" id={defect.driver_id} name={defect.driver_name} noun="Driver" /> ·{" "}
              {defect.submitted_at ? new Date(defect.submitted_at).toLocaleString() : "—"}
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-gray-800">{defect.notes || "No driver notes."}</p>
            <p className="mt-2 text-xs text-gray-500">
              Photos: {defect.photo_keys?.length ?? 0} · Status: {defect.triage_status}
              {defect.follow_up_wo_id ? (
                <> · WO <EntityLinkOrTombstone kind="work_order" id={defect.follow_up_wo_id} name={defect.follow_up_wo_display_id} noun="Work order" /></>
              ) : null}
            </p>
          </header>

          <section className="rounded-sm border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Mechanic notes</h2>
            <textarea
              rows={3}
              className="mt-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={mechanicNotes}
              onChange={(event) => setMechanicNotes(event.target.value)}
              placeholder="Shop triage notes…"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => runTriage("assign")}>
                Assign
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runTriage("escalate")}>
                Escalate
              </Button>
              <Button size="sm" variant="secondary" onClick={() => runTriage("close_no_action")}>
                Close (no action)
              </Button>
              <Button size="sm" onClick={() => runTriage("convert_to_wo")}>
                Convert to WO (API)
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setWoModalOpen(true)}>
                + Create Work Order
              </Button>
            </div>
          </section>

          <section className="rounded-sm border border-gray-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-gray-900">Triage history</h2>
            <ul className="mt-2 space-y-1 text-xs text-gray-700">
              {history.map((entry, index) => (
                <li key={`${entry.event_class}-${index}`}>
                  {entry.event_class} · {new Date(entry.created_at).toLocaleString()}
                </li>
              ))}
              {history.length === 0 ? <li className="text-gray-500">No triage events yet.</li> : null}
            </ul>
            {historyTotal > historyPageSize ? (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600" data-testid="maint-dvir-defect-history-server-pager">
                <Button size="sm" variant="secondary" disabled={historyPage === 0 || q.isFetching} onClick={() => setHistoryPage((page) => Math.max(0, page - 1))}>Previous</Button>
                <span>{historyPage * historyPageSize + 1}–{Math.min((historyPage + 1) * historyPageSize, historyTotal)} of {historyTotal}</span>
                <Button size="sm" variant="secondary" disabled={(historyPage + 1) * historyPageSize >= historyTotal || q.isFetching} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button>
              </div>
            ) : null}
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
