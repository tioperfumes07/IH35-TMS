import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";

type ScheduledRow = {
  id: string;
  report_id?: string;
  name: string;
  cadence: string;
  cadence_label?: string;
  recipients: string;
  send_at_local_time?: string;
  enabled?: boolean;
  is_active?: boolean;
  last_sent_at?: string | null;
  next_due_at?: string | null;
};

function withCompany(path: string, companyId: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}operating_company_id=${encodeURIComponent(companyId)}`;
}

type Props = {
  rows?: ScheduledRow[];
};

export function ScheduledReportsPanel({ rows: initialRows }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const navigate = useNavigate();

  const listQuery = useQuery({
    queryKey: ["reports-scheduled-panel", companyId],
    queryFn: () =>
      apiRequest<{ rows: ScheduledRow[] }>(withCompany("/api/v1/reports/scheduled", companyId)),
    enabled: Boolean(companyId),
    initialData: initialRows ? { rows: initialRows } : undefined,
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      apiRequest(withCompany(`/api/v1/reports/scheduled/${id}`, companyId), {
        method: "PATCH",
        body: { operating_company_id: companyId, is_active, enabled: is_active },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports-scheduled-panel"] });
      void qc.invalidateQueries({ queryKey: ["reports", "scheduled"] });
    },
  });

  const testSendMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest(withCompany(`/api/v1/reports/scheduled/${id}/test-send`, companyId), {
        method: "POST",
        body: {},
      }),
    onSuccess: () => pushToast("Test send queued", "success"),
    onError: () => pushToast("Test send failed", "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest(withCompany(`/api/v1/reports/scheduled/${id}`, companyId), { method: "DELETE" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["reports-scheduled-panel"] });
      pushToast("Schedule deleted", "success");
    },
  });

  const rows = listQuery.data?.rows ?? [];

  return (
    <section className="rounded border-2 border-slate-300 bg-white">
      <div className="flex items-center justify-between border-b border-slate-300 px-3 py-2">
        <h3 className="text-sm font-semibold text-slate-900">Scheduled auto-emailed</h3>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-xs font-semibold text-[#1f2a44] hover:underline"
            onClick={() => navigate("/reports/scheduled")}
          >
            + Schedule new
          </button>
          <Link to="/reports/scheduled" className="text-xs font-semibold text-slate-600 hover:underline">
            Manage
          </Link>
        </div>
      </div>
      <div className="space-y-2 px-3 py-2">
        {rows.length === 0 ? (
          <p className="text-xs text-slate-500">No active schedules — add daily dispatch board or AR aging.</p>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="rounded border border-slate-100 bg-slate-50 p-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-500">
                  {row.cadence_label ?? row.cadence} · {row.send_at_local_time ?? "07:00"}
                </div>
                <div className="mt-0.5 text-xs font-semibold text-slate-800">{row.name}</div>
                <div className="text-xs text-slate-600">{row.recipients}</div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <label className="flex items-center gap-1 text-[10px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={row.is_active !== false && row.enabled !== false}
                    onChange={(e) => toggleMut.mutate({ id: row.id, is_active: e.target.checked })}
                  />
                  Active
                </label>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-[#1f2a44] hover:underline"
                  onClick={() => testSendMut.mutate(row.id)}
                >
                  Test send
                </button>
                <button
                  type="button"
                  className="text-[10px] font-semibold text-red-700 hover:underline"
                  onClick={() => deleteMut.mutate(row.id)}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default ScheduledReportsPanel;
