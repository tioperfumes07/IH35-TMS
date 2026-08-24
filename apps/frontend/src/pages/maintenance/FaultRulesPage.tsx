import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { FaultRuleModal, type FaultRuleFormValues } from "../../components/maintenance/FaultRuleModal";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";

type FaultRule = FaultRuleFormValues & { id: string; active?: boolean };

function fetchRules(companyId: string) {
  return apiRequest<{ rules: FaultRule[] }>(
    `/api/v1/maintenance/fault-rules?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

export function FaultRulesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editRule, setEditRule] = useState<FaultRule | null>(null);

  const rulesQuery = useQuery({
    queryKey: ["maintenance", "fault-rules", companyId],
    queryFn: () => fetchRules(companyId),
    enabled: Boolean(companyId),
  });

  const saveMutation = useMutation({
    mutationFn: (values: FaultRuleFormValues & { id?: string }) => {
      if (values.id) {
        return apiRequest(`/api/v1/maintenance/fault-rules/${values.id}`, {
          method: "PATCH",
          body: { ...values, operating_company_id: companyId },
        });
      }
      return apiRequest("/api/v1/maintenance/fault-rules", {
        method: "POST",
        body: { ...values, operating_company_id: companyId },
      });
    },
    onSuccess: () => {
      pushToast("Fault rule saved.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-rules", companyId] });
      setModalOpen(false);
      setEditRule(null);
    },
    onError: () => pushToast("Could not save fault rule.", "error"),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/v1/maintenance/fault-rules/${id}/archive`, {
        method: "POST",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Fault rule archived.", "success");
      queryClient.invalidateQueries({ queryKey: ["maintenance", "fault-rules", companyId] });
    },
    onError: () => pushToast("Could not archive fault rule.", "error"),
  });

  const rules = rulesQuery.data?.rules ?? [];

  const columns = useMemo<ParityColumn<FaultRule>[]>(
    () => [
      { key: "fault_code", label: "Code", sortable: true, render: (row) => <span className="font-mono text-xs">{row.fault_code}</span> },
      { key: "source", label: "Source", sortable: true, render: (row) => row.source },
      { key: "severity", label: "Severity", sortable: true, render: (row) => <span className="capitalize">{row.severity}</span> },
      { key: "auto_create_wo", label: "Auto WO", render: (row) => (row.auto_create_wo ? "Yes" : "No") },
      { key: "suggested_priority", label: "Priority", render: (row) => row.suggested_priority ?? "—" },
      { key: "estimated_repair_hours", label: "Est. hours", render: (row) => row.estimated_repair_hours ?? "—" },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setEditRule(row);
                setModalOpen(true);
              }}
            >
              Edit
            </Button>
            <Button size="sm" variant="tertiary" onClick={() => archiveMutation.mutate(row.id)}>
              Archive
            </Button>
          </div>
        ),
      },
    ],
    [archiveMutation],
  );

  return (
    <div className="space-y-4 p-4">
      <PageHeader
        title="Fault Rules"
        subtitle="Map Samsara / J1939 fault codes to severity and auto-WO behavior. Initial rule set is empty — build from operational experience."
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2 text-sm">
          <Link to="/maintenance" className="text-slate-700 underline">
            Maintenance home
          </Link>
          <span className="text-gray-400">·</span>
          <Link to="/maintenance/fault-drafts" className="text-slate-700 underline">
            Fault-driven drafts
          </Link>
        </div>
        {/* ARCHIVE-not-DELETE (B25): prior CTA "+ Add rule" — Sunset: 2026-09. Canonical: + Create Rule. */}
        <Button
          size="sm"
          onClick={() => {
            setEditRule(null);
            setModalOpen(true);
          }}
        >
          + Create Rule
        </Button>
      </div>

      {rulesQuery.isError ? (
        <ListErrorState
          title="Couldn't load fault rules"
          status={0}
          message={(rulesQuery.error as Error)?.message}
          onRetry={() => void rulesQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={rules}
          columns={columns}
          rowKey={(row) => row.id}
          loading={rulesQuery.isLoading}
          storageKey="maintenance-fault-rules"
          emptyText="No fault rules configured yet."
          exportFilename="fault-rules"
        />
      )}

      {modalOpen ? (
        <FaultRuleModal
          initial={editRule}
          onClose={() => {
            setModalOpen(false);
            setEditRule(null);
          }}
          onSave={(values) => saveMutation.mutate(values)}
          saving={saveMutation.isPending}
        />
      ) : null}
    </div>
  );
}
