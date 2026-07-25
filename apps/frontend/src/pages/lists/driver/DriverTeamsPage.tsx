/**
 * LST-F10 — Driver Teams list surface.
 *
 * Was a 20-line prose placeholder describing an API; the fully-built backend
 * (apps/backend/src/mdata/driver-teams.routes.ts) had zero callers. This is the real screen, wired
 * to those endpoints only — no invented fields, no invented endpoints, no split percentages (the
 * mdata roster API has none).
 *
 * Idiom copied from the neighbouring DriverCatalogListPage: BackArrowHeader + "+ Create" action,
 * ListErrorBanner, ParityTable (loading/empty states), shared Modal for create/edit.
 * Entity scope: operating_company_id from CompanyContext, exactly as sibling Lists pages do it.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { driverTeamMemberName, listMdataDriverTeams, type MdataDriverTeam } from "../../../api/driver-teams";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { DriverTeamModal } from "./DriverTeamModal";

type StatusFilter = "true" | "false" | "all";

function statusPillClass() {
  return "rounded-sm bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700";
}

const TEAM_COLUMNS: Array<ParityColumn<MdataDriverTeam>> = [
  {
    key: "team_name",
    label: "Team Name",
    sortable: true,
    render: (row) => <span className="text-xs font-medium">{row.team_name}</span>,
  },
  {
    key: "primary_driver_id",
    label: "Primary Driver",
    sortable: true,
    sortValue: (row) => driverTeamMemberName(row, "primary"),
    render: (row) => <>{driverTeamMemberName(row, "primary")}</>,
  },
  {
    key: "secondary_driver_id",
    label: "Secondary Driver",
    sortable: true,
    sortValue: (row) => driverTeamMemberName(row, "secondary"),
    render: (row) => <>{driverTeamMemberName(row, "secondary")}</>,
  },
  {
    key: "relationship",
    label: "Relationship",
    sortable: true,
    render: (row) => <>{row.relationship || "—"}</>,
  },
  { key: "effective_from", label: "Effective From", sortable: true, render: (row) => <>{row.effective_from || "—"}</> },
  { key: "effective_to", label: "Effective To", sortable: true, render: (row) => <>{row.effective_to || "—"}</> },
  {
    key: "is_active",
    label: "Status",
    sortable: true,
    sortValue: (row) => (row.is_active ? "Active" : "Inactive"),
    render: (row) => <span className={statusPillClass()}>{row.is_active ? "Active" : "Inactive"}</span>,
  },
  {
    key: "notes",
    label: "Notes",
    sortable: false,
    defaultHidden: true,
    render: (row) => <>{row.notes || "—"}</>,
  },
];

export function DriverTeamsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedTeam, setSelectedTeam] = useState<MdataDriverTeam | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const query = useQuery({
    queryKey: ["mdata", "driver-teams", companyId, status],
    queryFn: () =>
      listMdataDriverTeams({
        operating_company_id: companyId,
        is_active: status === "all" ? undefined : status,
      }),
    enabled: Boolean(companyId),
  });

  const teams = query.data?.teams ?? [];

  // Client-side filter only — the mdata roster endpoint exposes no `search` param and this page
  // must not invent one.
  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return teams;
    return teams.filter((team) =>
      [team.team_name, driverTeamMemberName(team, "primary"), driverTeamMemberName(team, "secondary"), team.relationship ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [teams, search]);

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/lists"
        breadcrumb={["Lists & Catalogs", "Driver", "Driver Teams"]}
        title="Driver Teams"
        countBadge={rows.length}
        actions={
          <Button
            data-testid="driver-teams-create"
            disabled={!companyId}
            onClick={() => {
              setModalMode("create");
              setSelectedTeam(null);
              setModalOpen(true);
            }}
          >
            + Create
          </Button>
        }
      />

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
      {!companyId ? (
        <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm text-slate-600">
          Select an operating company to view its driver teams.
        </div>
      ) : null}

      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-3">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by team or driver name"
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-2"
        />
        <SelectCombobox
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm"
        >
          <option value="true">Active</option>
          <option value="false">Inactive</option>
          <option value="all">All</option>
        </SelectCombobox>
      </div>

      <ParityTable
        columns={TEAM_COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        emptyText="No driver teams found."
        storageKey="driver-teams-list"
        tableTestId="driver-teams-table"
        onRowClick={(row) => {
          setModalMode("edit");
          setSelectedTeam(row);
          setModalOpen(true);
        }}
      />

      <DriverTeamModal
        open={modalOpen}
        operatingCompanyId={companyId}
        mode={modalMode}
        team={selectedTeam}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
