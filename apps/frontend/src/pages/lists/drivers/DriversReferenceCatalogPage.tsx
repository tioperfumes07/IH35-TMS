import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { DriversReferenceCatalogRow } from "../../../api/lists-drivers-catalogs";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
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
    ? "rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600"
    : "rounded bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700";
}

export function DriversReferenceCatalogPage({ client, displayName, catalogKey }: Props) {
  const [search, setSearch] = useState("");
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>("active");
  const [modalOpen, setModalOpen] = useState(false);

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

  const emptyText = useMemo(() => {
    if (query.isLoading) return `Loading ${displayName.toLowerCase()}...`;
    if (rows.length > 0) return "";
    return `No ${displayName.toLowerCase()} found.`;
  }, [displayName, query.isLoading, rows.length]);

  async function toggleArchive(row: DriversReferenceCatalogRow) {
    if (row.archived_at) {
      await client.restore(row.id);
    } else {
      await client.archive(row.id);
    }
    void query.refetch();
  }

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
      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}

      <div className="grid gap-2 rounded border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by code or label"
          className="h-9 rounded border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={archiveFilter}
          onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)}
          className="h-9 rounded border border-gray-300 px-2 text-sm"
        >
          <option value="active">Active</option>
          <option value="archived">Archived</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
            <tr>
              <th className="px-3 py-2 text-left">Code</th>
              <th className="px-3 py-2 text-left">Label</th>
              <th className="px-3 py-2 text-left">Sort Order</th>
              <th className="px-3 py-2 text-left">Archived</th>
              <th className="px-3 py-2 text-left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-xs font-medium tracking-normal [font-variant-ligatures:none]">{row.code}</td>
                <td className="px-3 py-2">{row.label}</td>
                <td className="px-3 py-2">{row.sort_order}</td>
                <td className="px-3 py-2">
                  <span className={archivedPillClass(Boolean(row.archived_at))}>{row.archived_at ? "Archived" : "Active"}</span>
                </td>
                <td className="px-3 py-2">
                  <Button variant="secondary" onClick={() => void toggleArchive(row)}>
                    {row.archived_at ? "Unarchive" : "Archive"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {emptyText ? <div className="px-3 py-6 text-sm text-gray-500">{emptyText}</div> : null}
      </div>

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
