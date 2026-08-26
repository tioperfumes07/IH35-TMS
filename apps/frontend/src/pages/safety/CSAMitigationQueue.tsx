import { useEffect, useMemo, useRef, useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { formatDateUS } from "../../lib/formatDate";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { Combobox } from "../../components/Combobox";

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
  if (riskBand === "watch") return "text-slate-700";
  if (riskBand === "ok") return "text-slate-700";
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
  const companyGenerationRef = useRef(0);

  const queueQuery = useQuery({
    queryKey: ["compliance-csa", "mitigation-queue", companyId],
    queryFn: () => fetchQueue(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; category: BasicCategory; dueDate: string }) =>
      createAction(input.companyId, input.category, input.dueDate),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "mitigation-queue", input.companyId] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; actionId: string }) =>
      markCompleted(input.companyId, input.actionId),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["compliance-csa", "mitigation-queue", input.companyId] });
    },
  });

  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    completeMutation.reset();
    setBasicCategory("hos_compliance");
    setDueDate(plusDaysIso(14));
  }, [companyId]);

  const queue = useMemo(() => queueQuery.data?.queue ?? [], [queueQuery.data?.queue]);

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Mark complete"
  // action are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<QueueItem>> = [
    { key: "basic_category", label: "Category", sortable: true, render: (row) => BASIC_LABELS[row.basic_category] },
    {
      key: "title",
      label: "Action",
      render: (row) => (
        <>
          <div className="font-semibold text-slate-800">{row.title}</div>
          {row.description ? <div className="text-[11px] text-slate-500">{row.description}</div> : null}
        </>
      ),
    },
    {
      key: "category_risk_band",
      label: "Risk",
      sortable: true,
      cellClass: "font-semibold",
      render: (row) => <span className={riskClass(row.category_risk_band)}>{row.category_risk_band}</span>,
    },
    {
      key: "due_date",
      label: "Due",
      sortable: true,
      render: (row) => (
        <>
          {formatDateUS(row.due_date)}
          <div className="text-[10px] text-slate-500">{row.days_until_due} days</div>
        </>
      ),
    },
    { key: "urgency_score", label: "Urgency", sortable: true, cellClass: "font-semibold text-slate-700", render: (row) => row.urgency_score },
    { key: "status", label: "Status", sortable: true, render: (row) => row.status },
    {
      key: "ops",
      label: "Ops",
      render: (row) => (
        <button
          type="button"
          className="rounded-sm border border-gray-300 px-2 py-0.5 disabled:opacity-50"
          disabled={!canMutate || completeMutation.isPending}
          onClick={() =>
            completeMutation.mutate({
              companyId,
              generation: companyGenerationRef.current,
              actionId: row.id,
            })
          }
        >
          Mark complete
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see TrainingProgramsPage.tsx sibling comment. */}
      <PageHeader
        title="CSA Mitigation Queue"
        subtitle={`Open actions sorted by urgency. Generated ${queueQuery.data?.generated_at ? new Date(queueQuery.data.generated_at).toLocaleString() : "not available"}.`}
        breadcrumb={[{ label: "Safety" }, { label: "CSA Mitigation" }]}
        backHref="/safety"
      />

      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold text-slate-700">Add mitigation action</div>
        <div className="flex flex-wrap items-end gap-2 text-xs">
          <div className="flex flex-col gap-1">
            <label htmlFor="csa-mitigation-category">Category</label>
            <Combobox
              id="csa-mitigation-category"
              dataTestId="csa-mitigation-category"
              className="min-w-56"
              value={basicCategory}
              options={Object.entries(BASIC_LABELS).map(([value, label]) => ({ value, label }))}
              onChange={(next) => next && setBasicCategory(next as BasicCategory)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="csa-mitigation-due-date">Due date</label>
            <DatePicker
              id="csa-mitigation-due-date"
              value={dueDate}
              className=""
              onChange={(next) => setDueDate(next)}
            />
          </div>
          <button
            type="button"
            className="rounded-sm border border-slate-300 px-3 py-1 font-semibold text-slate-700 disabled:opacity-60"
            disabled={!companyId || !canMutate || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                companyId,
                generation: companyGenerationRef.current,
                category: basicCategory,
                dueDate,
              })
            }
          >
            Create suggested action
          </button>
          {createMutation.isError ? (
            <p className="text-xs text-red-700 md:col-span-full" data-testid="csa-mitigation-create-error">
              {userFacingApiError(createMutation.error, "Could not create the mitigation action.")}
            </p>
          ) : null}
        </div>
      </div>

      {completeMutation.isError ? (
        <p className="text-xs text-red-700" data-testid="csa-mitigation-complete-error">
          {userFacingApiError(completeMutation.error, "Could not mark the mitigation action complete.")}
        </p>
      ) : null}

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No open mitigation actions." — an outage
          presenting as a CSA queue with nothing outstanding. */}
      {queueQuery.isError ? (
        <ListErrorState
          title="Couldn't load the mitigation queue"
          status={0}
          message={(queueQuery.error as Error)?.message}
          onRetry={() => void queueQuery.refetch()}
        />
      ) : (
      <ParityTable<QueueItem>
        columns={columns}
        rows={queue}
        rowKey={(row) => row.id}
        loading={queueQuery.isLoading}
        emptyText="No open mitigation actions."
        storageKey="safety-csa-mitigation-queue"
        exportFilename="csa-mitigation-queue"
      />
      )}
    </div>
  );
}

export default CSAMitigationQueuePage;
