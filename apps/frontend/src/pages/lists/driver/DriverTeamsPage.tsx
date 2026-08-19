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
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { driverTeamMemberName, listMdataDriverTeams, type MdataDriverTeam } from "../../../api/driver-teams";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { formatDateUS } from "../../../lib/formatDate";
import { isUnresolvedEntityTombstone } from "../../../lib/entity-label";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCreateQueryParam } from "../../../hooks/useCreateQueryParam";
import { DriverTeamModal } from "./DriverTeamModal";
import { EntityLink } from "../../../components/shared/EntityLink";

type StatusFilter = "true" | "false" | "all";


function DriverTeamMemberCell({ row, slot }: { row: MdataDriverTeam; slot: "primary" | "secondary" }) {
  const driverId = slot === "primary" ? row.primary_driver_id : row.secondary_driver_id;
  const rawName =
    slot === "primary"
      ? [row.primary_driver_first_name, row.primary_driver_last_name].filter(Boolean).join(" ").trim()
      : [row.secondary_driver_first_name, row.secondary_driver_last_name].filter(Boolean).join(" ").trim();
  // Reuse the shared helper (also used for sortValue above) instead of re-deriving the same
  // entityLabel(name, id, "Driver") call inline — one source of truth for the human label.
  const label = driverTeamMemberName(row, slot);
  // LV-LISTS-DRIVER-TEAMS-DEAD-TOMBSTONE-LINK: unresolved / UUID-shaped names must not drill.
  if (!driverId || isUnresolvedEntityTombstone(rawName || null, driverId, "Driver")) {
    return (
      <span className="text-xs text-slate-600" data-testid={`driver-teams-${slot}-tombstone`}>
        {label}
      </span>
    );
  }
  return (
    <EntityLink
      kind="driver"
      id={driverId}
      label={label}
      data-testid={`driver-teams-${slot}-link`}
    />
  );
}


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
    render: (row) => <DriverTeamMemberCell row={row} slot="primary" />,
  },
  {
    key: "secondary_driver_id",
    label: "Secondary Driver",
    sortable: true,
    sortValue: (row) => driverTeamMemberName(row, "secondary"),
    render: (row) => <DriverTeamMemberCell row={row} slot="secondary" />,
  },
  {
    key: "relationship",
    label: "Relationship",
    sortable: true,
    render: (row) => <>{row.relationship || "—"}</>,
  },
  // Dates are MM/DD/YYYY in the UI — a raw ISO YYYY-MM-DD must never reach the operator
  // (verify-no-iso-date-display). Sorting still uses the ISO value so order stays correct.
  {
    key: "effective_from",
    label: "Effective From",
    sortable: true,
    sortValue: (row) => row.effective_from ?? "",
    render: (row) => <>{formatDateUS(row.effective_from) || "—"}</>,
  },
  {
    key: "effective_to",
    label: "Effective To",
    sortable: true,
    sortValue: (row) => row.effective_to ?? "",
    render: (row) => <>{formatDateUS(row.effective_to) || "—"}</>,
  },
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
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [status, setStatus] = useState<StatusFilter>("true");
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [selectedTeam, setSelectedTeam] = useState<MdataDriverTeam | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  // LST-F5215 — Lists hub ?create=1 must open DriverTeamModal (shared catalog create parity).
  useCreateQueryParam({
    companyId,
    onOpenCreate: () => {
      setModalMode("create");
      setSelectedTeam(null);
      setModalOpen(true);
    },
  });

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
  // Free-text search: ParityTable toolbar owns it (LST-F3490) — status filter stays page-local.
  const rows = teams;

  useEffect(() => {
    const teamId = searchParams.get("team_id");
    if (!teamId || modalOpen || teams.length === 0) return;
    const team = teams.find((candidate) => candidate.id === teamId);
    if (!team) return;
    setModalMode("edit");
    setSelectedTeam(team);
    setModalOpen(true);
  }, [modalOpen, searchParams, teams]);

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
        <SelectCombobox
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
          className="h-9 rounded-sm border border-gray-300 px-2 text-sm md:col-span-1"
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
        onClose={() => {
          setModalOpen(false);
          if (searchParams.has("team_id")) {
            const next = new URLSearchParams(searchParams);
            next.delete("team_id");
            setSearchParams(next, { replace: true });
          }
        }}
        onSaved={() => {
          void query.refetch();
        }}
      />
    </div>
  );
}
