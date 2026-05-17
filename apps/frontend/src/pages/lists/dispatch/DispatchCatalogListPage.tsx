import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../../../api/client";
import type {
  DispatchCatalogCreateBody,
  DispatchCatalogRow,
  DispatchCatalogUpdateBody,
} from "../../../api/catalogs-dispatch";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { CatalogEntryModal } from "./CatalogEntryModal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type StatusFilter = "active" | "inactive" | "all";

type Client = {
  list: (filters: { operating_company_id: string; search?: string; is_active?: "true" | "false" | "all"; limit?: number; offset?: number }) => Promise<{
    rows: DispatchCatalogRow[];
    total: number;
  }>;
  create: (operatingCompanyId: string, body: DispatchCatalogCreateBody) => Promise<DispatchCatalogRow>;
  update: (operatingCompanyId: string, id: string, body: DispatchCatalogUpdateBody) => Promise<DispatchCatalogRow>;
  deactivate: (operatingCompanyId: string, id: string) => Promise<DispatchCatalogRow>;
};

type Props = {
  catalogKey: string;
  title: string;
  description: string;
  client: Client;
};

function parseCodeError(error: unknown) {
  if (!(error instanceof ApiError)) return null;
  const data = error.data as { details?: { fieldErrors?: Record<string, string[]> } } | undefined;
  return data?.details?.fieldErrors?.code?.[0] ?? null;
}

function statusPill(isActive: boolean) {
  return isActive
    ? "inline-flex rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"
    : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
}

export function DispatchCatalogListPage({ catalogKey, title, description, client }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const [modalMode, setModalMode] = useState<"create" | "edit" | null>(null);
  const [activeRow, setActiveRow] = useState<DispatchCatalogRow | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);

  const companyId = selectedCompanyId ?? "";

  const listQuery = useQuery({
    queryKey: ["dispatch-catalog", catalogKey, companyId, search, status],
    queryFn: () =>
      client.list({
        operating_company_id: companyId,
        search: search || undefined,
        is_active: status === "all" ? "all" : status === "active" ? "true" : "false",
        limit: 250,
        offset: 0,
      }),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (body: DispatchCatalogCreateBody) => client.create(companyId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-catalog", catalogKey] });
      setModalMode(null);
    },
    onError: (error) => setCodeError(parseCodeError(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: DispatchCatalogUpdateBody }) => client.update(companyId, id, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-catalog", catalogKey] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setCodeError(parseCodeError(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => client.deactivate(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-catalog", catalogKey] });
      setModalMode(null);
      setActiveRow(null);
    },
  });

  const rows = listQuery.data?.rows ?? [];
  const total = listQuery.data?.total ?? 0;
  const isSaving = createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending;

  const breadcrumb = useMemo(
    () => ["Lists & Catalogs", "Dispatch", title],
    [title]
  );

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={breadcrumb}
        title={title}
        countBadge={total}
        actions={
          <Button
            onClick={() => {
              setCodeError(null);
              setActiveRow(null);
              setModalMode("create");
            }}
          >
            + Create Entry
          </Button>
        }
      />

      <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">{description}</div>

      <div className="grid gap-2 rounded border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or display name" className="h-9 rounded border border-gray-300 px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Show
          <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded border border-gray-300 px-2 text-[13px]">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      <div className="overflow-x-auto rounded border border-slate-200 bg-white">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-slate-50">
            <tr className="text-slate-600">
              <th className="px-3 py-2 font-semibold">Code</th>
              <th className="px-3 py-2 font-semibold">Display Name</th>
              <th className="px-3 py-2 font-semibold">Desc</th>
              <th className="px-3 py-2 font-semibold">Order</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {listQuery.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  Loading entries...
                </td>
              </tr>
            ) : null}
            {!listQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-slate-500" colSpan={5}>
                  No entries match these filters
                </td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                onClick={() => {
                  navigate(`/lists/dispatch/${catalogKey}`);
                  setCodeError(null);
                  setActiveRow(row);
                  setModalMode("edit");
                }}
              >
                <td className="px-3 py-2 font-semibold text-slate-800">{row.code}</td>
                <td className="px-3 py-2 text-slate-800">{row.display_name}</td>
                <td className="max-w-[320px] truncate px-3 py-2 text-slate-600">{row.description ?? "—"}</td>
                <td className="px-3 py-2 text-slate-700">{row.sort_order}</td>
                <td className="px-3 py-2">
                  <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-xs text-slate-500">Total rows: {total}</div>

      <CatalogEntryModal
        open={modalMode !== null}
        mode={modalMode ?? "create"}
        title={modalMode === "create" ? `${title} · Create Entry` : `${title} · Edit Entry`}
        initialRow={activeRow}
        duplicateCodeError={codeError}
        saving={isSaving}
        onClose={() => {
          setModalMode(null);
          setActiveRow(null);
        }}
        onSave={async (body) => {
          setCodeError(null);
          if (modalMode === "create") {
            await createMutation.mutateAsync(body as DispatchCatalogCreateBody);
            return;
          }
          if (!activeRow) return;
          await updateMutation.mutateAsync({ id: activeRow.id, body: body as DispatchCatalogUpdateBody });
        }}
        onDeactivate={
          modalMode === "edit" && activeRow
            ? async () => {
                await deactivateMutation.mutateAsync(activeRow.id);
              }
            : undefined
        }
      />
    </div>
  );
}
