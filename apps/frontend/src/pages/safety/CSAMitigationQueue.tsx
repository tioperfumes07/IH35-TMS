import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";

type BasicCategory =
  | "unsafe_driving"
  | "hos_compliance"
  | "driver_fitness"
  | "controlled_substances_alcohol"
  | "vehicle_maintenance"
  | "hazmat_compliance"
  | "crash_indicator";

type QueueItem = {
  id: string;
  basic_category: BasicCategory;
  action_type: string;
  title: string;
  description: string | null;
  due_date: string;
  status: string;
  urgency_score: number;
  category_risk_band: "ok" | "watch" | "alert" | "unknown";
  days_until_due: number;
};

type QueueResponse = {
  queue: QueueItem[];
  generated_at: string;
};

const BASIC_LABELS: Record<BasicCategory, string> = {
  unsafe_driving: "Unsafe Driving",
  hos_compliance: "HOS Compliance",
  driver_fitness: "Driver Fitness",
  controlled_substances_alcohol: "Controlled Substances / Alcohol",
  vehicle_maintenance: "Vehicle Maintenance",
  hazmat_compliance: "HazMat Compliance",
  crash_indicator: "Crash Indicator",
};

function plusDaysIso(days: number) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function riskClass(riskBand: QueueItem["category_risk_band"]) {
  if (riskBand === "alert") return "text-red-700";
  if (riskBand === "watch") return "text-amber-700";
  if (riskBand === "ok") return "text-emerald-700";
  return "text-slate-500";
}

async function fetchQueue(companyId: string) {
  return apiRequest<QueueResponse>(`/api/v1/compliance/csa/mitigation-queue?operating_company_id=${encodeURIComponent(companyId)}`);
}

async function createAction(companyId: string, basicCategory: BasicCategory, dueDate: string) {
  return apiRequest<{ mitigation_action: QueueItem }>("/api/v1/compliance/csa/mitigation-actions", {
    method: "POST",
    body: {
      operating_company_id: companyId,
      basic_category: basicCategory,
      due_date: dueDate,
    },
  });
}

async function markCompleted(companyId: string, actionId: string) {
  return apiRequest<{ mitigation_action: QueueItem }>(`/api/v1/compliance/csa/mitigation-actions/${encodeURIComponent(actionId)}`, {
    method: "PATCH",
    body: {
      operating_company_id: companyId,
      status: "completed",
    },
  });
}

export function CSAMitigationQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const canMutate = ["Owner", "Administrator", "Manager", "Safety"].includes(String(auth.user?.role ?? ""));

  const [basicCategory, setBasicCategory] = useState<BasicCategory>("hos_compliance");
  const [dueDate, setDueDate] = useState<string>(plusDaysIso(14));

  const queueQuery = useQuery({
    queryKey: ["compliance-csa", "mitigation-queue", companyId],
    queryFn: () => fetchQueue(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: () => createAction(companyId, basicCategory, dueDate),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "mitigation-queue", companyId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (actionId: string) => markCompleted(companyId, actionId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "mitigation-queue", companyId] });
    },
  });

  const queue = useMemo(() => queueQuery.data?.queue ?? [], [queueQuery.data?.queue]);

  return (
    <div className="space-y-3">
      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="text-sm font-semibold text-slate-800">CSA Mitigation Queue</div>
        <div className="mt-1 text-xs text-slate-600">
          Open actions sorted by urgency. Generated{" "}
          {queueQuery.data?.generated_at ? new Date(queueQuery.data.generated_at).toLocaleString() : "not available"}.
        </div>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-slate-700">Add mitigation action</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <label className="flex flex-col gap-1">
            <span>Category</span>
            <select
              className="rounded border border-gray-300 px-2 py-1"
              value={basicCategory}
              onChange={(event) => setBasicCategory(event.target.value as BasicCategory)}
            >
              {Object.entries(BASIC_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span>Due date</span>
            <input
              type="date"
              value={dueDate}
              className="rounded border border-gray-300 px-2 py-1"
              onChange={(event) => setDueDate(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="rounded border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-60"
            disabled={!companyId || !canMutate || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Create suggested action
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-left">Action</th>
              <th className="px-2 py-1 text-left">Risk</th>
              <th className="px-2 py-1 text-left">Due</th>
              <th className="px-2 py-1 text-left">Urgency</th>
              <th className="px-2 py-1 text-left">Status</th>
              <th className="px-2 py-1 text-left">Ops</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-2 py-1">{BASIC_LABELS[row.basic_category]}</td>
                <td className="px-2 py-1">
                  <div className="font-semibold text-slate-800">{row.title}</div>
                  {row.description ? <div className="text-[11px] text-slate-500">{row.description}</div> : null}
                </td>
                <td className={`px-2 py-1 font-semibold ${riskClass(row.category_risk_band)}`}>{row.category_risk_band}</td>
                <td className="px-2 py-1">
                  {row.due_date}
                  <div className="text-[10px] text-slate-500">{row.days_until_due} days</div>
                </td>
                <td className="px-2 py-1 font-semibold text-slate-700">{row.urgency_score}</td>
                <td className="px-2 py-1">{row.status}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="rounded border border-gray-300 px-2 py-0.5 disabled:opacity-50"
                    disabled={!canMutate || completeMutation.isPending}
                    onClick={() => completeMutation.mutate(row.id)}
                  >
                    Mark complete
                  </button>
                </td>
              </tr>
            ))}
            {queue.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-3 text-center text-slate-500">
                  No open mitigation actions.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CSAMitigationQueuePage;
