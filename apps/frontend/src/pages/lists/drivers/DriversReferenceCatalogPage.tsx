import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import type { DriversReferenceCatalogRow } from "../../../api/lists-drivers-catalogs";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListsSubNav } from "../ListsSubNav";
import { DriversReferenceCatalogModal, type DriversReferenceCatalogClient } from "./DriversReferenceCatalogModal";

type Props = {
  client: DriversReferenceCatalogClient;
  displayName: string;
  catalogKey: string;
};

type ArchiveFilter = "active" | "archived" | "all";

function archivedPillClass(archived: boolean) {
  return archived
    ? "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
    : "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
}

export function DriversReferenceCatalogPage({ client, displayName, catalogKey }: Props) {
  const { pushToast } = useToast();
  const [search, setSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);

  // LST-F5215 — Lists hub ?create=1 must open reference create modal (org-wide catalog).
  useCreateQueryParam({
    companyId: "_",
    onOpenCreate: () => setModalOpen(true),
  });

  const includeArchived = archiveFilter !== "active";

  const query = useQuery({
    queryKey: ["lists", "drivers", catalogKey, search, archiveFilter],
    queryFn: () =>
      client.list({
        search: search || undefined,
        include_archived: includeArchived,
      }),
  });

  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    if (archiveFilter === "archived") return all.filter((row) => row.archived_at);
    if (archiveFilter === "active") return all.filter((row) => !row.archived_at);
    return all;
  }, [archiveFilter, query.data?.rows]);

  const total = query.data?.total_count ?? 0;

  async function toggleArchive(row: DriversReferenceCatalogRow) {
    // LISTS-F6334-class: no try/catch, called via `void toggleArchive(row)` — a rejected
    // archive/restore (409 double-archive, RLS, expired session) was completely silent, the
    // button just appearing to do nothing.
    try {
      if (row.archived_at) {
        await client.restore(row.id);
      } else {
        await client.archive(row.id);
      }
      void query.refetch();
    } catch (error) {
      pushToast(
        userFacingApiError(error, row.archived_at ? "Could not unarchive this row" : "Could not archive this row"),
        "error"
      );
    }
  }

  const columns: Array<ParityColumn<DriversReferenceCatalogRow>> = [
    {
      key: "code",
      label: "Code",
      sortable: true,
      render: (row) => (
        <span className="text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</span>
      ),
    },
    { key: "label", label: "Label", sortable: true },
    { key: "sort_order", label: "Sort Order", sortable: true },
    {
      key: "archived_at",
      label: "Archived",
      sortable: true,
      sortValue: (row) => (row.archived_at ? "Archived" : "Active"),
      render: (row) => (
        <span className={archivedPillClass(Boolean(row.archived_at))}>{row.archived_at ? "Archived" : "Active"}</span>
      ),
    },
    {
      key: "actions",
      label: "Actions",
      render: (row) => (
        <Button variant="secondary" onClick={() => void toggleArchive(row)}>
          {row.archived_at ? "Unarchive" : "Archive"}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <ListsSubNav />
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Drivers", displayName]}
        title={displayName}
        countBadge={total}
        actions={
          <Button onClick={() => setModalOpen(true)}>+ Create</Button>
        }
      />

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        {/* LST-F3514: server-bound catalog search — keep; ParityTable toolbar Search suppressed */}
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          // A placeholder is NOT an accessible name — it is not announced as a label by screen readers and
          // it disappears once the user types. This input had no name at all (verified by dumping the render:
          // every control here came back label=NONE), so it was unreachable by name for assistive tech.
          aria-label="Search by code or label"
          placeholder="Search by code or label"
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={archiveFilter}
          onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      {query.isError ? (
        <ListErrorState
          title={`Couldn't load ${displayName.toLowerCase()}`}
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={(query.error as Error)?.message}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable<DriversReferenceCatalogRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          emptyText={`No ${displayName.toLowerCase()} found.`}
          storageKey={`drivers-ref-catalog-${catalogKey}`}
          tableTestId="drivers-reference-catalog-table"
          // LST-F3514: keep API search above; hide ParityTable toolbar Search
          suppressToolbarSearch
        />
      )}

      <DriversReferenceCatalogModal
        open={modalOpen}
        displayName={displayName}
        client={client}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
