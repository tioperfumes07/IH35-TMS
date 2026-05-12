import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { legalTemplatesApi, type LegalTemplateDraft } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalTemplateNewModal } from "./LegalTemplateNewModal";

const STATUS_OPTIONS = ["draft", "pending_review", "approved", "active", "retired"] as const;

function statusPillClass(status: string) {
  if (status === "active") return "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700";
  if (status === "approved") return "rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700";
  if (status === "pending_review") return "rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800";
  if (status === "retired") return "rounded bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
  return "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
}

export function LegalTemplatesListPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number] | "all">("all");
  const [category, setCategory] = useState("");
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

  const emptyText = useMemo(() => {
    if (query.isLoading) return "Loading legal templates...";
    if (rows.length > 0) return "";
    return "No legal templates found for current filters.";
  }, [query.isLoading, rows.length]);

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/home"
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

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search code or display name"
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <input
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          placeholder="Category"
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value as (typeof STATUS_OPTIONS)[number] | "all")}
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        >
          <option value="all">All statuses</option>
          {STATUS_OPTIONS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Version</th>
              <th className="px-3 py-2 text-left">Display Name (EN)</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left">Updated</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                onClick={() => navigate(`/legal/templates/${row.id}`)}
              >
                <td className="px-3 py-2 font-mono text-xs">{row.template_code}</td>
                <td className="px-3 py-2">{row.version}</td>
                <td className="px-3 py-2">{row.display_name_en}</td>
                <td className="px-3 py-2">{row.category}</td>
                <td className="px-3 py-2">
                  <span className={statusPillClass(row.status)}>{row.status}</span>
                </td>
                <td className="px-3 py-2">{new Date(row.updated_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

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
