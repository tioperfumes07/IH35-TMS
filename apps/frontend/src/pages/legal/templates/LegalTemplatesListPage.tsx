import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalTemplatesApi, type LegalTemplateDraft, type LegalTemplateStatus, type LegalTemplateSummary } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { LegalTemplateNewModal } from "./LegalTemplateNewModal";
import { MultiSelectDropdown } from "../../../components/forms/MultiSelectDropdown";
import { CollapsedListFilters, TableSearch, useStagedListFilters } from "../../../components/table";
import { statusOptions } from "../../../lib/statusListParams";
import { formatDateTimeUS } from "../../../lib/formatDate";

const STATUS_LABELS: Record<LegalTemplateStatus, string> = {
  draft: "Draft",
  pending_review: "Pending review",
  approved: "Approved",
  active: "Active",
  retired: "Retired",
};
const STATUS_FILTER_OPTIONS = statusOptions(STATUS_LABELS);
function isLegalTemplateStatus(value: string | undefined): value is LegalTemplateStatus {
  return value !== undefined && Object.prototype.hasOwnProperty.call(STATUS_LABELS, value);
}

function statusPillClass(status: string) {
  if (status === "active") return "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]";
  if (status === "approved") return "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]";
  if (status === "pending_review") return "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]";
  if (status === "retired") return "rounded-sm bg-[#E5E7EB] px-2 py-0.5 text-xs font-semibold text-[#1F2A44]";
  return "rounded-sm bg-[#F7F8FA] px-2 py-0.5 text-xs font-semibold text-[#4B5563]";
}

export function LegalTemplatesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const staged = useStagedListFilters({
    applied: { status, category },
    empty: { status: [] as string[], category: "" },
    onApply: (next) => {
      setStatus(next.status);
      setCategory(next.category);
    },
  });
  const [newOpen, setNewOpen] = useState(false);

  const query = useQuery({
    queryKey: ["legal", "templates", operatingCompanyId, search, status.join(","), category],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      // U12: multi-select — API takes one status; 0/1 pass through; 2+ fetch unscoped then filter.
      const statusParam = status.length === 1 && isLegalTemplateStatus(status[0]) ? status[0] : undefined;
      const res = await legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
        search: search || undefined,
        status: statusParam,
        category: category || undefined,
      });
      if (status.length <= 1) return res.templates;
      return res.templates.filter((row) => status.includes(row.status));
    },
  });

  const createMutation = useMutation({
    mutationFn: async (draft: LegalTemplateDraft) => legalTemplatesApi.create(operatingCompanyId, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
    },
  });

  const rows = query.data ?? [];
  const total = rows.length;

  const columns = useMemo<ParityColumn<LegalTemplateSummary>[]>(
    () => [
      { key: "template_code", label: "Code", sortable: true, render: (row) => <span className="font-mono text-xs">{row.template_code}</span> },
      { key: "version", label: "Version", sortable: true, render: (row) => String(row.version) },
      { key: "display_name_en", label: "Display Name (EN)", sortable: true, render: (row) => row.display_name_en },
      { key: "category", label: "Category", sortable: true, render: (row) => row.category },
      { key: "status", label: "Status", sortable: true, render: (row) => <span className={statusPillClass(row.status)}>{row.status}</span> },
      { key: "updated_at", label: "Updated", sortable: true, render: (row) => formatDateTimeUS(row.updated_at) },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <BackArrowHeader
        // LEGAL-TEMPLATES-BACK-TO-HOME: this page renders LegalModuleTabs (a sibling tab of
        // Contracts/Policies/Attorney Review/Matters/Reports) — it is not the Legal module root
        // (/legal is), so on a direct load/refresh (no in-app history for the smart-back to use)
        // "← Back" dropped the user all the way out to /home instead of back to the Legal hub.
        backTo="/legal"
        breadcrumb={["Legal", "Templates"]}
        title="Legal Template Library"
        countBadge={total}
        actions={
          <Button onClick={() => setNewOpen(true)}>
            + Create
          </Button>
        }
      />

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
      <LegalModuleTabs />

      <ParityTable
        title="Legal templates"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        onRowClick={(row) => navigate(`/legal/templates/${row.id}`)}
        // Settled-only empty (LIST-EMPTY-1 invariant): see LegalPoliciesPage for the same pattern.
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        storageKey="legal-templates"
        emptyText="No legal templates found for current filters."
        suppressToolbarSearch
        filterBar={
          <CollapsedListFilters
            activeFilterCount={(status.length ? 1 : 0) + (category ? 1 : 0)}
            onApply={staged.apply} onReset={staged.reset} onCancel={staged.cancel} applyDisabled={!staged.dirty}
            testIdPrefix="legal-templates"
            dataAttributes={{ "data-legal-templates-filter-toolbar": "collapsed" }}
            searchSlot={
              <TableSearch
                value={search}
                onChange={setSearch}
                placeholder="Search code or display name"
                aria-label="Search code or display name"
                className="w-64"
              />
            }
          >
            <div className="grid gap-2 md:grid-cols-2">
              <input
                value={staged.draft.category}
                onChange={(event) => staged.setDraft({ ...staged.draft, category: event.target.value })}
                placeholder="Category"
                aria-label="Filter by category"
                className="h-9 rounded-sm border border-gray-300 px-2 text-xs"
              />
              <MultiSelectDropdown
                label="Status"
                options={STATUS_FILTER_OPTIONS}
                selected={staged.draft.status}
                onChange={(next) => staged.setDraft({ ...staged.draft, status: next })}
                allLabel="All statuses"
                data-testid="legal-templates-status-filter"
              />
            </div>
          </CollapsedListFilters>
        }
      />

      <LegalTemplateNewModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreate={async (draft) => {
          await createMutation.mutateAsync(draft);
        }}
      />
    </div>
  );
}
