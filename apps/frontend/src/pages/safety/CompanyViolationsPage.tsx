import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getCompanyViolations } from "../../api/safety";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { CompanyViolationCreateModal } from "./components/CompanyViolationCreateModal";
import { CompanyViolationDetailDrawer } from "./components/CompanyViolationDetailDrawer";

type Props = {
  operatingCompanyId: string;
};

type CompanyViolationRow = Record<string, unknown>;

export function CompanyViolationsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  const query = useQuery({
    queryKey: ["safety", "company-violations", operatingCompanyId],
    queryFn: () => getCompanyViolations(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Open" detail action
  // are preserved verbatim (§7 additive-only).
  const columns: Array<ParityColumn<CompanyViolationRow>> = [
    { key: "reported_date", label: "Reported", sortable: true, render: (row) => String(row.reported_date ?? "").slice(0, 10) },
    { key: "violation_type", label: "Type", sortable: true, render: (row) => String(row.violation_type ?? "—") },
    { key: "violation_severity", label: "Severity", sortable: true, render: (row) => String(row.violation_severity ?? "—") },
    { key: "description", label: "Description", render: (row) => String(row.description ?? "—") },
    { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "open") },
    {
      key: "action",
      label: "Action",
      render: (row) => (
        <button type="button" className="text-slate-700 underline" onClick={() => setSelected(row)}>
          Open
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="company-violations-page">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="rounded bg-[#1F2A44] px-3 py-1 text-xs font-semibold text-white"
          data-testid="company-violation-create-btn"
        >
          + Create Company Violation
        </button>
      </div>
      <ParityTable<CompanyViolationRow>
        columns={columns}
        rows={query.data?.company_violations ?? []}
        rowKey={(row) => String(row.id)}
        loading={query.isLoading}
        emptyText="No company violations found."
        storageKey="safety-company-violations"
        exportFilename="company-violations"
        tableTestId="company-violations-table"
      />

      <CompanyViolationCreateModal
        open={createOpen}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setCreateOpen(false)}
        onCreated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
      <CompanyViolationDetailDrawer
        open={Boolean(selected)}
        violation={selected}
        operatingCompanyId={operatingCompanyId}
        onClose={() => setSelected(null)}
        onUpdated={() => void queryClient.invalidateQueries({ queryKey: ["safety", "company-violations", operatingCompanyId] })}
      />
    </div>
  );
}
