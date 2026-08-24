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
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
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
    ? "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700"
    : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600";
}

// Column order preserved 1:1 from the former hand-rolled table: Code · Display Name · Desc · Order · Status.
const COLUMNS: Array<ParityColumn<DispatchCatalogRow>> = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (row) => <span className="font-semibold text-slate-800">{row.code}</span>,
  },
  {
    key: "display_name",
    label: "Display Name",
    sortable: true,
    render: (row) => <span className="text-slate-800">{row.display_name}</span>,
  },
  {
    key: "description",
    label: "Desc",
    sortable: true,
    cellClass: "max-w-[320px] truncate text-slate-600",
    render: (row) => row.description ?? "—",
  },
  {
    key: "sort_order",
    label: "Order",
    sortable: true,
    render: (row) => <span className="text-slate-700">{row.sort_order}</span>,
  },
  {
    key: "is_active",
    label: "Status",
    sortable: true,
    sortValue: (row) => (row.is_active ? 1 : 0),
    render: (row) => <span className={statusPill(row.is_active)}>{row.is_active ? "Active" : "Inactive"}</span>,
  },
];

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

  // LST-F5214 — Lists hub ?create=1 must open Create Entry (accounting catalog parity).
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setCodeError(null);
      setActiveRow(null);
      setModalMode("create");
    },
  });

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

  // LISTS-F6334: unlike createMutation/updateMutation above (both wire onError to setCodeError),
  // deactivateMutation had no onError at all — a rejected deactivate silently did nothing.
  const deactivateMutation = useMutation({
    mutationFn: (id: string) => client.deactivate(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["dispatch-catalog", catalogKey] });
      setModalMode(null);
      setActiveRow(null);
    },
    onError: (error) => setCodeError(parseCodeError(error) ?? "Could not deactivate this entry."),
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

      <div className="rounded-sm border border-slate-200 bg-white p-3 text-sm text-slate-600">{description}</div>

      <div className="grid gap-2 rounded-sm border border-slate-200 bg-white p-3 md:grid-cols-[1fr_180px]">
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Search
          {/* LST-F3510: server-bound catalog search — keep; ParityTable toolbar Search suppressed */}
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search code or display name" className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]" />
        </label>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Show
          <SelectCombobox value={status} onChange={(event) => setStatus(event.target.value as StatusFilter)} className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]">
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </SelectCombobox>
        </label>
      </div>

      {listQuery.isError ? (
        <ListErrorState
          title="Couldn't load catalog entries"
          status={listQuery.error instanceof ApiError ? listQuery.error.status : 0}
          message={(listQuery.error as Error | null)?.message}
          onRetry={() => void listQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={COLUMNS}
          rowKey={(row) => row.id}
          loading={listQuery.isLoading}
          emptyText="No entries match these filters"
          storageKey={`dispatch-catalog-${catalogKey}`}
          tableTestId="dispatch-catalog-list-table"
          // LST-F3510: keep API search above; hide ParityTable toolbar Search
          suppressToolbarSearch
          onRowClick={(row) => {
            navigate(`/lists/dispatch/${catalogKey}`);
            setCodeError(null);
            setActiveRow(row);
            setModalMode("edit");
          }}
        />
      )}

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
