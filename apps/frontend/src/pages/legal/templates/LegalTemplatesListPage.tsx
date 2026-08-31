import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalTemplatesApi, type LegalTemplateDraft, type LegalTemplateSummary } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { LegalTemplateNewModal } from "./LegalTemplateNewModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CollapsedListFilters, TableSearch, useStagedListFilters } from "../../../components/table";

const STATUS_OPTIONS = ["draft", "pending_review", "approved", "active", "retired"] as const;

function statusPillClass(status: string) {
  if (status === "active") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "approved") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "pending_review") return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  if (status === "retired") return "rounded-sm bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function LegalTemplatesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number] | "all">("all");
  const [category, setCategory] = useState("");
  const staged = useStagedListFilters({ applied: { status, category }, empty: { status: "all" as const, category: "" }, onApply: (next) => { setStatus(next.status); setCategory(next.category); } });
  const [newOpen, setNewOpen] = useState(false);

  const query = useQuery({
    queryKey: ["legal", "templates", operatingCompanyId, search, status, category],
    enabled: Boolean(operatingCompanyId),
    queryFn: async () => {
      const res = await legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
        search: search || undefined,
        status: status === "all" ? undefined : status,
        category: category || undefined,
      });
      return res.templates;
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
      { key: "updated_at", label: "Updated", sortable: true, render: (row) => new Date(row.updated_at).toLocaleString() },
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
            activeFilterCount={(status !== "all" ? 1 : 0) + (category ? 1 : 0)}
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
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              />
              <SelectCombobox
                value={staged.draft.status}
                onChange={(event) => staged.setDraft({ ...staged.draft, status: event.target.value as (typeof STATUS_OPTIONS)[number] | "all" })}
                className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
              >
                <option value="all">All statuses</option>
                {STATUS_OPTIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </SelectCombobox>
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
