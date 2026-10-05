import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { PageHeader } from "../../components/layout/PageHeader";
import { EntityLink } from "../../components/shared/EntityLink";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import {
  listMappingTargets,
  listSamsaraProfiles,
  mapSamsaraDrivers,
  unmapSamsaraDrivers,
  type MappingTarget,
  type SamsaraProfile,
} from "../../api/samsara-driver-mapping";
import { userFacingApiError } from "../../lib/api-error-message";
import { formatDateUS } from "../../lib/formatDate";
import "../../components/boards/party-board.css";
import "./samsara-driver-mapping.css";

/**
 * PR2 — split Samsara Driver Mapping (owner preview screen 4 · 2026-10-05).
 *
 * LEFT: drivers & vendors. RIGHT: Samsara usernames for the selected person.
 * Save is ADDITIVE — already-mapped-to-this rows stay ticked+locked; new ticks ADD;
 * save never clears prior mappings. Nothing writes to Samsara.
 */

const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "past", label: "Past" },
];
const MAPPING_OPTS = [
  { value: "unmapped", label: "No Samsara user" },
  { value: "mapped", label: "Has Samsara user(s)" },
];
const KIND_OPTS = [
  { value: "driver", label: "Drivers" },
  { value: "vendor", label: "Vendors" },
];
const SHOW_OPTS = [
  { value: "unmapped", label: "Unmapped only" },
  { value: "all", label: "All" },
  { value: "mine", label: "Mapped to this person" },
];
const SAM_STATUS_OPTS = [
  { value: "active", label: "Active in Samsara" },
  { value: "inactive", label: "Inactive in Samsara" },
];

function mappedToThis(p: SamsaraProfile, person: MappingTarget): boolean {
  if (person.kind === "driver") return p.local_driver_id === person.id;
  return p.local_vendor_id === person.id;
}

function mappedElsewhere(p: SamsaraProfile, person: MappingTarget): boolean {
  if (!p.mapped) return false;
  return !mappedToThis(p, person);
}

function mappedLabel(p: SamsaraProfile): string {
  if (p.local_driver_id) {
    const base = p.driver_name ?? "Driver — not visible";
    return p.mapped_target_deactivated ? `${base} (inactive)` : base;
  }
  if (p.local_vendor_id) {
    const base = p.vendor_name ?? "Vendor — not visible";
    return p.mapped_target_deactivated ? `${base} (deactivated)` : base;
  }
  return "—";
}

export function SamsaraDriverMappingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [leftSearch, setLeftSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>(["active"]);
  const [mappingFilter, setMappingFilter] = useState<string[]>([]);
  const [kindFilter, setKindFilter] = useState<string[]>(["driver"]);
  const [selectedPerson, setSelectedPerson] = useState<MappingTarget | null>(null);

  const [rightSearch, setRightSearch] = useState("");
  // Default: unmapped candidates + already-mapped-to-this (locked ticks must stay visible).
  const [showFilter, setShowFilter] = useState<string[]>(["unmapped", "mine"]);
  const [samStatusFilter, setSamStatusFilter] = useState<string[]>([]);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [retireEmptied, setRetireEmptied] = useState(false);

  const leftFilter: "active" | "past" | "all" =
    statusFilter.length === 0 || statusFilter.length === 2
      ? "all"
      : statusFilter.includes("active")
        ? "active"
        : "past";

  const kinds = kindFilter.length === 0 ? (["driver", "vendor"] as const) : (kindFilter as Array<"driver" | "vendor">);

  const driversQuery = useQuery({
    queryKey: ["samsara", "mapping-targets", companyId, "driver", leftFilter, leftSearch],
    queryFn: () => listMappingTargets(companyId, { kind: "driver", filter: leftFilter, q: leftSearch || undefined, limit: 500 }),
    enabled: Boolean(companyId) && kinds.includes("driver"),
    staleTime: 15_000,
  });
  const vendorsQuery = useQuery({
    queryKey: ["samsara", "mapping-targets", companyId, "vendor", leftFilter, leftSearch],
    queryFn: () => listMappingTargets(companyId, { kind: "vendor", filter: leftFilter, q: leftSearch || undefined, limit: 500 }),
    enabled: Boolean(companyId) && kinds.includes("vendor"),
    staleTime: 15_000,
  });

  const leftRows = useMemo(() => {
    const rows: MappingTarget[] = [];
    if (kinds.includes("driver")) rows.push(...(driversQuery.data?.targets ?? []));
    if (kinds.includes("vendor")) rows.push(...(vendorsQuery.data?.targets ?? []));
    return rows.filter((r) => {
      if (mappingFilter.length === 0) return true;
      const n = r.mapped_samsara_count ?? 0;
      const wantsUnmapped = mappingFilter.includes("unmapped");
      const wantsMapped = mappingFilter.includes("mapped");
      if (wantsUnmapped && wantsMapped) return true;
      if (wantsUnmapped) return n === 0;
      if (wantsMapped) return n > 0;
      return true;
    });
  }, [driversQuery.data, vendorsQuery.data, kinds, mappingFilter]);

  const profilesQuery = useQuery({
    queryKey: ["samsara", "driver-mapping", "profiles", companyId, "all", rightSearch],
    queryFn: () => listSamsaraProfiles(companyId, { status: "all", q: rightSearch || undefined, limit: 500 }),
    enabled: Boolean(companyId) && Boolean(selectedPerson),
    staleTime: 15_000,
  });

  const rightRows = useMemo(() => {
    if (!selectedPerson) return [] as SamsaraProfile[];
    const show = showFilter.length === 0 ? ["all"] : showFilter;
    return (profilesQuery.data?.profiles ?? []).filter((p) => {
      const mine = mappedToThis(p, selectedPerson);
      const unmapped = !p.mapped;
      let showOk = false;
      if (show.includes("all")) showOk = true;
      if (show.includes("unmapped") && unmapped) showOk = true;
      if (show.includes("mine") && mine) showOk = true;
      if (!showOk) return false;
      if (samStatusFilter.length === 0) return true;
      const active = String(p.samsara_status ?? "").toLowerCase() === "active";
      if (samStatusFilter.includes("active") && samStatusFilter.includes("inactive")) return true;
      if (samStatusFilter.includes("active")) return active;
      if (samStatusFilter.includes("inactive")) return !active;
      return true;
    });
  }, [profilesQuery.data, selectedPerson, showFilter, samStatusFilter]);

  // Lock + pre-tick rows already mapped to THIS person. Additive save never clears them.
  useEffect(() => {
    if (!selectedPerson) {
      setTicked(new Set());
      setRetireEmptied(false);
      return;
    }
    const locked = new Set(
      (profilesQuery.data?.profiles ?? []).filter((p) => mappedToThis(p, selectedPerson)).map((p) => p.samsara_driver_id)
    );
    setTicked(locked);
    setRetireEmptied(false);
  }, [selectedPerson, profilesQuery.data]);

  const mapMutation = useMutation({
    mutationFn: (body: {
      samsara_driver_ids: string[];
      target_kind: "driver" | "vendor";
      target_id: string;
      retire_emptied_drivers?: boolean;
    }) => mapSamsaraDrivers(companyId, body),
    onSuccess: (res) => {
      const retired = res.retired_driver_ids?.length ?? 0;
      const kept = res.kept_live?.length ?? 0;
      pushToast(
        res.mapped_count === 0
          ? "Already mapped — nothing changed (additive save is a no-op)"
          : `Mapped ${res.mapped_count} Samsara user(s)` +
              (retired > 0 ? ` — ${retired} duplicate driver record(s) merged` : "") +
              (kept > 0 ? ` — ${kept} kept: ${res.kept_live!.map((k) => k.reason).join("; ")}` : ""),
        "success"
      );
      setRetireEmptied(false);
      void queryClient.invalidateQueries({ queryKey: ["samsara", "driver-mapping", "profiles", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["samsara", "mapping-targets", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to map"), "error"),
  });

  const unmapMutation = useMutation({
    mutationFn: (ids: string[]) => unmapSamsaraDrivers(companyId, { samsara_driver_ids: ids }),
    onSuccess: (res) => {
      pushToast(`Unmapped ${res.unmapped_count} profile(s)`, "success");
      void queryClient.invalidateQueries({ queryKey: ["samsara", "driver-mapping", "profiles", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["samsara", "mapping-targets", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to unmap"), "error"),
  });

  const toggleTick = (p: SamsaraProfile) => {
    if (!selectedPerson) return;
    if (mappedToThis(p, selectedPerson)) return; // locked
    if (mappedElsewhere(p, selectedPerson)) {
      pushToast(`Mapped to ${mappedLabel(p)} — unmap there first`, "error");
      return;
    }
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(p.samsara_driver_id)) next.delete(p.samsara_driver_id);
      else next.add(p.samsara_driver_id);
      return next;
    });
  };

  const saveAdditive = () => {
    if (!selectedPerson) return;
    // ADDITIVE: only POST ids not already mapped to this person. Never unmap as part of save.
    const already = new Set(
      (profilesQuery.data?.profiles ?? []).filter((p) => mappedToThis(p, selectedPerson)).map((p) => p.samsara_driver_id)
    );
    const toAdd = [...ticked].filter((id) => !already.has(id));
    if (toAdd.length === 0 && !retireEmptied) {
      pushToast("Already mapped — nothing changed (additive save is a no-op)", "success");
      return;
    }
    if (toAdd.length === 0 && retireEmptied) {
      // Same-person retire needs at least one id in the body — use a locked id as the no-op map carrier.
      const carrier = [...already][0];
      if (!carrier) {
        pushToast("Map at least one Samsara user before retiring a duplicate", "error");
        return;
      }
      mapMutation.mutate({
        samsara_driver_ids: [carrier],
        target_kind: selectedPerson.kind,
        target_id: selectedPerson.id,
        retire_emptied_drivers: selectedPerson.kind === "driver" ? true : false,
      });
      return;
    }
    mapMutation.mutate({
      samsara_driver_ids: toAdd,
      target_kind: selectedPerson.kind,
      target_id: selectedPerson.id,
      retire_emptied_drivers: selectedPerson.kind === "driver" ? retireEmptied : false,
    });
  };

  const newTickCount = selectedPerson
    ? [...ticked].filter(
        (id) => !(profilesQuery.data?.profiles ?? []).some((p) => p.samsara_driver_id === id && mappedToThis(p, selectedPerson))
      ).length
    : 0;

  return (
    <div className="sdm" data-testid="samsara-driver-mapping-page">
      <PageHeader
        title="Samsara driver mapping"
        subtitle="Many Samsara usernames → one driver profile. Nothing is written to Samsara. Saving adds — it never replaces."
      />

      <div className="sdm-split">
        {/* LEFT — drivers & vendors */}
        <section className="sdm-pane" data-testid="sdm-left-pane">
          <h2 className="sdm-pane-title" data-testid="sdm-left-title">
            Driver / Vendor profile
          </h2>
          <div className="sdm-filters">
            <input
              className="de-ctrl wsearch sdm-input"
              placeholder="Search name…"
              value={leftSearch}
              onChange={(e) => setLeftSearch(e.target.value)}
              data-testid="sdm-left-search"
            />
            <MultiSelectDropdown
              label="Status"
              options={STATUS_OPTS}
              selected={statusFilter}
              onChange={setStatusFilter}
              allLabel="All statuses"
              searchable
              className="wmd"
              data-testid="sdm-filter-status"
            />
            <MultiSelectDropdown
              label="Mapping"
              options={MAPPING_OPTS}
              selected={mappingFilter}
              onChange={setMappingFilter}
              allLabel="Any mapping"
              searchable
              className="wmd"
              data-testid="sdm-filter-mapping"
            />
            <MultiSelectDropdown
              label="Kind"
              options={KIND_OPTS}
              selected={kindFilter}
              onChange={setKindFilter}
              allLabel="Drivers + vendors"
              searchable
              className="ws"
              data-testid="sdm-filter-kind"
            />
          </div>

          <table className="ih-table sdm-table">
            <thead>
              <tr>
                <th>Driver / vendor (our app)</th>
                <th>CDL</th>
                <th>Samsara users</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {leftRows.length === 0 ? (
                <tr>
                  <td colSpan={4} className="sdm-empty">
                    No people match these filters.
                  </td>
                </tr>
              ) : (
                leftRows.map((row) => {
                  const selected = selectedPerson?.id === row.id && selectedPerson.kind === row.kind;
                  return (
                    <tr
                      key={`${row.kind}-${row.id}`}
                      className={selected ? "sdm-row-selected" : undefined}
                      data-testid={`sdm-person-${row.kind}-${row.id}`}
                      onClick={() => setSelectedPerson(row)}
                    >
                      <td>
                        <EntityLink kind={row.kind} id={row.id} label={row.active ? row.name : `${row.name} (inactive)`} />
                      </td>
                      <td>{row.kind === "driver" ? row.cdl_number || "—" : "—"}</td>
                      <td className="tabular-nums text-center">{row.mapped_samsara_count ?? 0}</td>
                      <td>
                        <button
                          type="button"
                          className="sdm-map-btn de-ctrl"
                          data-testid={`sdm-map-btn-${row.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedPerson(row);
                          }}
                        >
                          Map
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </section>

        {/* RIGHT — Samsara usernames for the selected person */}
        <section className="sdm-pane" data-testid="sdm-right-pane">
          <h2 className="sdm-pane-title" data-testid="sdm-right-title">
            Samsara
          </h2>
          {!selectedPerson ? (
            <div className="sdm-empty-pane">Select a driver or vendor on the left to map Samsara usernames.</div>
          ) : (
            <>
              <div className="sdm-right-hdr">
                <div>
                  <div className="sdm-person-name">{selectedPerson.name}</div>
                  <div className="sdm-person-sub">
                    {selectedPerson.kind === "driver" ? "Driver" : "Vendor"} · several active Samsara usernames on one
                    profile is ordinary
                  </div>
                </div>
                <button
                  type="button"
                  className="sdm-save de-ctrl"
                  data-testid="sdm-save"
                  disabled={mapMutation.isPending || (newTickCount === 0 && !retireEmptied)}
                  onClick={saveAdditive}
                >
                  Save mapping{newTickCount > 0 ? ` (+${newTickCount})` : ""}
                </button>
              </div>

              <div className="sdm-filters">
                <input
                  className="de-ctrl wsearch sdm-input"
                  placeholder="Filter Samsara username…"
                  value={rightSearch}
                  onChange={(e) => setRightSearch(e.target.value)}
                  data-testid="sdm-right-search"
                />
                <MultiSelectDropdown
                  label="Show"
                  options={SHOW_OPTS}
                  selected={showFilter}
                  onChange={setShowFilter}
                  allLabel="All rows"
                  searchable
                  className="wmd"
                  data-testid="sdm-filter-show"
                />
                <MultiSelectDropdown
                  label="Samsara status"
                  options={SAM_STATUS_OPTS}
                  selected={samStatusFilter}
                  onChange={setSamStatusFilter}
                  allLabel="Any Samsara status"
                  searchable
                  className="wmd"
                  data-testid="sdm-filter-sam-status"
                />
              </div>

              <table className="ih-table sdm-table">
                <thead>
                  <tr>
                    <th className="sdm-tick-col" />
                    <th>Samsara username</th>
                    <th>Samsara ID</th>
                    <th className="wd text-left">Account created</th>
                    <th>Samsara status</th>
                    <th>Mapped to</th>
                  </tr>
                </thead>
                <tbody>
                  {rightRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="sdm-empty">
                        No Samsara users match these filters.
                      </td>
                    </tr>
                  ) : (
                    rightRows.map((p) => {
                      const mine = mappedToThis(p, selectedPerson);
                      const elsewhere = mappedElsewhere(p, selectedPerson);
                      const checked = ticked.has(p.samsara_driver_id);
                      return (
                        <tr key={p.samsara_driver_id} data-testid={`sdm-sam-${p.samsara_driver_id}`}>
                          <td className="sdm-tick-col">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={mine || elsewhere}
                              title={
                                mine
                                  ? "Already mapped here — locked (additive save)"
                                  : elsewhere
                                    ? `Mapped to ${mappedLabel(p)} — unmap there first`
                                    : undefined
                              }
                              onChange={() => toggleTick(p)}
                              data-testid={`profile-select-${p.samsara_driver_id}`}
                            />
                          </td>
                          <td>{p.samsara_name || "—"}</td>
                          <td className="font-mono text-xs">{p.samsara_driver_id}</td>
                          <td className="wd tabular-nums text-left" data-testid={`sdm-created-${p.samsara_driver_id}`}>
                            {formatDateUS(p.samsara_created_at) || "—"}
                          </td>
                          <td>{p.samsara_status || "—"}</td>
                          <td>
                            {mine ? (
                              <span data-testid={`sdm-mapped-here-${p.samsara_driver_id}`}>This person</span>
                            ) : elsewhere ? (
                              <span className="sdm-elsewhere">
                                {p.local_driver_id ? (
                                  <EntityLink kind="driver" id={p.local_driver_id} label={mappedLabel(p)} />
                                ) : p.local_vendor_id ? (
                                  <EntityLink kind="vendor" id={p.local_vendor_id} label={mappedLabel(p)} />
                                ) : (
                                  mappedLabel(p)
                                )}
                                <button
                                  type="button"
                                  className="sdm-unmap-link"
                                  data-testid={`sdm-unmap-${p.samsara_driver_id}`}
                                  disabled={unmapMutation.isPending}
                                  onClick={() => unmapMutation.mutate([p.samsara_driver_id])}
                                >
                                  Unmap
                                </button>
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>

              {selectedPerson.kind === "driver" ? (
                <label className="sdm-same-person" data-testid="sdm-same-person">
                  <input
                    type="checkbox"
                    checked={retireEmptied}
                    onChange={(e) => setRetireEmptied(e.target.checked)}
                    data-testid="sdm-retire-emptied"
                  />
                  Same person — retire the emptied duplicate driver record into this one (only when it holds no
                  Samsara user and has no open settlement)
                </label>
              ) : null}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
