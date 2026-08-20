import { useMemo } from "react";
import { entityLabel } from "../../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { listSafetyIncidents } from "../../../api/safety";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

type Props = {
  operatingCompanyId: string;
};

// READ-ONLY formal damage register. Canonical source = safety.incidents WHERE incident_type='damage_report'
// (the formal register), re-pointed here from the driver-PWA queue. No create/edit — the PWA intake queue
// lives in its own "Driver Reports" tab. Columns match docs/approved-screens/damage-reports.html using ONLY
// real safety.incidents fields (+ unit_number from the additive LEFT JOIN mdata.units in the list endpoint).
type DamageIncidentRow = {
  id: string;
  incident_type: string;
  incident_at: string | null;
  description: string | null;
  status: string | null;
  unit_number: string | null;
  unit_id: string | null;
  photo_keys: string[] | null;
  work_order_id: string | null;
  work_order_display_id: string | null;
};

function asDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString();
}

function photoCount(keys: string[] | null | undefined) {
  return Array.isArray(keys) ? keys.length : 0;
}

export function MaintenanceDamageRegisterTab({ operatingCompanyId }: Props) {
  const incidentsQuery = useQuery({
    queryKey: ["safety", "incidents", "damage_report", operatingCompanyId],
    queryFn: () => listSafetyIncidents(operatingCompanyId, "damage_report"),
    enabled: Boolean(operatingCompanyId),
  });

  const rows = useMemo<DamageIncidentRow[]>(() => {
    const incidents = incidentsQuery.data?.incidents ?? [];
    return incidents.map((row) => ({
      id: String(row.id ?? ""),
      incident_type: String(row.incident_type ?? "damage_report"),
      incident_at: (row.incident_at as string | null) ?? null,
      description: (row.description as string | null) ?? null,
      status: (row.status as string | null) ?? null,
      unit_number: (row.unit_number as string | null) ?? null,
      unit_id: (row.unit_id as string | null) ?? null,
      photo_keys: (row.photo_keys as string[] | null) ?? null,
      work_order_id: (row.work_order_id as string | null) ?? null,
      work_order_display_id: (row.work_order_display_id as string | null) ?? null,
    }));
  }, [incidentsQuery.data]);

  // Columns from docs/approved-screens/damage-reports.html. "Linked WO" is intentionally DEFERRED — there is
  // NO work_order link column on safety.incidents (would require a gated additive migration). Same honest-
  // deferral pattern as Arriving Soon Prep / the verify:design-parity DEFERRED list — never a faked column.
  const columns: Array<ParityColumn<DamageIncidentRow>> = [
    {
      key: "id",
      label: "Report #",
      // safety.incidents has no display/sequence number → short id slice is the stable record reference.
      render: (row) => (row.id ? entityLabel(null, String(row.id), "Damage") : "—"),
    },
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />,
    },
    {
      key: "incident_at",
      label: "Date",
      sortable: true,
      render: (row) => asDate(row.incident_at),
    },
    {
      key: "incident_type",
      label: "Type",
      render: () => "Damage report",
    },
    {
      key: "description",
      label: "Description",
      render: (row) => row.description || "—",
    },
    {
      // MAINTENANCE-DAMAGE-REGISTER-CANONICAL-WO-FK: safety.incidents.work_order_id (additive migration
      // 202612580000) is stamped by the incident auto-workflow when it spawns a draft repair WO for
      // equipment/breakdown incidents. Only those rows carry a value — others honestly show "—".
      key: "work_order_id",
      label: "Linked WO",
      render: (row) => (
        <EntityLinkOrTombstone
          kind="work_order"
          id={row.work_order_id}
          name={row.work_order_display_id}
          noun="Work order"
        />
      ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      render: (row) => row.status || "—",
    },
    {
      key: "photo_keys",
      label: "Photos",
      render: (row) => {
        const count = photoCount(row.photo_keys);
        return count === 1 ? "1 photo" : `${count} photos`;
      },
    },
  ];

  // CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to the empty state — an outage
  // presenting as a unit with no damage history. The table is this component's only return value,
  // so the error state is a conditional RETURN rather than a JSX sibling (two sibling expressions
  // directly inside return(...) is not valid JSX — tsc caught that immediately).
  return incidentsQuery.isError ? (
      <ListErrorState
        title="Couldn't load damage incidents"
        status={0}
        message={(incidentsQuery.error as Error)?.message}
        onRetry={() => void incidentsQuery.refetch()}
      />
  ) : (
    <ParityTable<DamageIncidentRow>
      columns={columns}
      rows={rows}
      rowKey={(row) => row.id}
      loading={incidentsQuery.isLoading}
      emptyText="No damage reports on the formal register"
      storageKey="maint-damage-register"
      exportFilename="damage-register"
    />
  );
}
