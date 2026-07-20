import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { legalMattersApi, type LegalMatterListRow } from "../../../api/legal-matters";
import { Button } from "../../../components/Button";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { formatDateUS } from "../../../lib/formatDate";

function daysUntil(dateStr: unknown) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const ms = d.setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
  return Math.ceil(ms / (24 * 3600 * 1000));
}

export function LegalMattersListPage() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState("");
  const [severity, setSeverity] = useState("");
  const [type, setType] = useState("");

  const listQuery = useQuery({
    queryKey: ["legal", "matters", companyId, status, severity, type],
    queryFn: () =>
      legalMattersApi.list(companyId, {
        status: status || undefined,
        severity: severity || undefined,
        type: type || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const rows = listQuery.data?.matters ?? [];

  const columns = useMemo<ParityColumn<LegalMatterListRow>[]>(
    () => [
      {
        key: "matter_number",
        label: "Number",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="matter"
            id={String(row.id ?? "")}
            label={String(row.matter_number ?? "")}
            className="font-mono text-xs"
          />
        ),
      },
      { key: "type", label: "Type", sortable: true, render: (row) => String(row.type ?? "") },
      { key: "status", label: "Status", sortable: true, render: (row) => String(row.status ?? "") },
      { key: "severity", label: "Severity", sortable: true, render: (row) => String(row.severity ?? "") },
      {
        key: "statute_of_limitations_at",
        label: "SOL / hearing",
        sortable: true,
        render: (row) => {
          const sol = daysUntil(row.statute_of_limitations_at);
          const urgent = sol !== null && sol >= 0 && sol < 14;
          return urgent ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-700">SOL {sol}d</span>
          ) : (
            <span className="text-xs text-gray-600">
              {row.statute_of_limitations_at ? formatDateUS(row.statute_of_limitations_at) : "—"}
            </span>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <PageHeader
        breadcrumb={["Legal", "Matters"]}
        title="Legal matters"
        subtitle="Lawsuits, claims, and regulatory matters"
        actions={
          <Link to="/legal/matters/new">
            <Button>+ Create Matter</Button>
          </Link>
        }
      />
      <LegalModuleTabs activeTabId="matters" />
      {!companyId ? (
        <p className="text-sm text-gray-600">Select an operating company.</p>
      ) : listQuery.isError ? (
        <p className="text-sm text-red-600">Could not load matters.</p>
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => String(row.id ?? "")}
          onRowClick={(row) => navigate(`/legal/matters/${String(row.id ?? "")}`)}
          // Settled-only empty (LIST-EMPTY-1 invariant): see LegalPoliciesPage for the same pattern.
          loading={listQuery.isPending || (listQuery.isFetching && rows.length === 0)}
          storageKey="legal-matters"
          emptyText="No matters match filters."
          filterBar={
            <div className="flex flex-wrap gap-2">
              <SelectCombobox
                className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="">All statuses</option>
                {["open", "investigating", "litigation", "settled", "dismissed", "judgment", "closed"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectCombobox>
              <SelectCombobox
                className="rounded-sm border border-gray-200 px-2 py-1 text-sm"
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
              >
                <option value="">All severity</option>
                {["critical", "high", "medium", "low"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectCombobox>
              <SelectCombobox className="rounded-sm border border-gray-200 px-2 py-1 text-sm" value={type} onChange={(e) => setType(e.target.value)}>
                <option value="">All types</option>
                {["lawsuit", "claim", "demand_letter", "settlement", "regulatory", "other"].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </SelectCombobox>
            </div>
          }
        />
      )}
    </div>
  );
}
