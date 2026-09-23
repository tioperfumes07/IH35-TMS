import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Combobox, type ComboboxOption } from "../../components/Combobox";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataTable, type DataTableColumn } from "../../components/DataTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import {
  listSamsaraProfiles,
  listMappingTargets,
  mapSamsaraDrivers,
  unmapSamsaraDrivers,
  type SamsaraProfile,
  type ProfilesQuery,
} from "../../api/samsara-driver-mapping";
import { userFacingApiError } from "../../lib/api-error-message";
import { PageHeader } from "../../components/layout/PageHeader";

/**
 * E20 Part B (Lead spec, Round 92/94) -- the Samsara Driver Mapping page. Consumes the 4 real
 * endpoints E20 Part A shipped (#22357): GET /samsara/profiles, GET /samsara/mapping-targets,
 * POST /samsara/map, POST /samsara/unmap.
 *
 * "663 unmapped is the DEFAULT VIEW, not a footnote" -- status defaults to "unmapped".
 * "Mapped / unmapped / ambiguous are three distinct states" -- the status filter picks
 * mapped/unmapped/all; within unmapped, each row's own resolver_suggestion status (unmatched /
 * matched / ambiguous) renders as its own named state, never collapsed into one generic blank.
 * "Nothing on this page writes a pairing the backend did not resolve" -- a suggestion is always
 * a proposal the operator reviews and confirms through the same target picker every manual map
 * uses; ambiguous never auto-picks, matched never auto-applies.
 */

const STATUS_TABS: Array<{ value: NonNullable<ProfilesQuery["status"]>; text: string }> = [
  { value: "unmapped", text: "Unmapped" },
  { value: "mapped", text: "Mapped" },
  { value: "all", text: "All" },
];

const PAGE_SIZE = 100;

function suggestionLabel(profile: SamsaraProfile): { text: string; tone: "muted" | "ok" | "warn" } {
  if (profile.mapped) return { text: "—", tone: "muted" };
  const s = profile.resolver_suggestion;
  if (s.status === "matched") return { text: "Suggested match found", tone: "ok" };
  if (s.status === "ambiguous") return { text: `Ambiguous (${s.candidate_ids.length} candidates)`, tone: "warn" };
  return { text: "No suggestion", tone: "muted" };
}

function mappedToLabel(profile: SamsaraProfile): string {
  if (profile.local_driver_id) {
    const base = profile.driver_name ?? "Driver — not visible";
    return profile.mapped_target_deactivated ? `${base} (inactive)` : base;
  }
  if (profile.local_vendor_id) {
    const base = profile.vendor_name ?? "Vendor — not visible";
    return profile.mapped_target_deactivated ? `${base} (deactivated)` : base;
  }
  return "—";
}

type TargetPickerState = {
  kind: "driver" | "vendor";
  samsaraDriverIds: string[];
  /** Pre-filled when a single row's own "matched" suggestion opened the picker. */
  suggestedTargetId?: string;
};

export function SamsaraDriverMappingPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [status, setStatus] = useState<NonNullable<ProfilesQuery["status"]>>("unmapped");
  const [search, setSearch] = useState("");
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picker, setPicker] = useState<TargetPickerState | null>(null);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [pickerFilter, setPickerFilter] = useState<"active" | "past" | "all">("active");

  const profilesQuery = useQuery({
    queryKey: ["samsara", "driver-mapping", "profiles", companyId, status, search, cursor],
    queryFn: () => listSamsaraProfiles(companyId, { status, q: search || undefined, limit: PAGE_SIZE, cursor }),
    enabled: Boolean(companyId),
    staleTime: 15_000,
  });

  const targetsQuery = useQuery({
    queryKey: ["samsara", "driver-mapping", "targets", companyId, picker?.kind, pickerFilter],
    queryFn: () => listMappingTargets(companyId, { kind: picker!.kind, filter: pickerFilter }),
    enabled: Boolean(companyId) && Boolean(picker),
    staleTime: 15_000,
  });

  const targetOptions: ComboboxOption[] = useMemo(
    () =>
      (targetsQuery.data?.targets ?? []).map((t) => ({
        value: t.id,
        label: t.active ? t.name : `${t.name} (inactive)`,
      })),
    [targetsQuery.data?.targets]
  );

  const mapMutation = useMutation({
    mutationFn: (body: { samsara_driver_ids: string[]; target_kind: "driver" | "vendor"; target_id: string }) =>
      mapSamsaraDrivers(companyId, body),
    onSuccess: (res, vars) => {
      pushToast(
        `Mapped ${res.mapped_count} profile(s)${res.missing_samsara_driver_ids.length > 0 ? ` — ${res.missing_samsara_driver_ids.length} no longer exist` : ""}`,
        "success"
      );
      setSelected(new Set());
      setPicker(null);
      setPickerTargetId(null);
      void queryClient.invalidateQueries({ queryKey: ["samsara", "driver-mapping", "profiles", companyId] });
      void vars;
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to map"), "error"),
  });

  const unmapMutation = useMutation({
    mutationFn: (samsaraDriverIds: string[]) => unmapSamsaraDrivers(companyId, { samsara_driver_ids: samsaraDriverIds }),
    onSuccess: (res) => {
      pushToast(`Unmapped ${res.unmapped_count} profile(s)`, "success");
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["samsara", "driver-mapping", "profiles", companyId] });
    },
    onError: (error) => pushToast(userFacingApiError(error, "Failed to unmap"), "error"),
  });

  const rows = profilesQuery.data?.profiles ?? [];
  const selectedRows = rows.filter((r) => selected.has(r.samsara_driver_id));
  const selectedMappedCount = selectedRows.filter((r) => r.mapped).length;

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllOnPage = () => {
    const pageIds = rows.map((r) => r.samsara_driver_id);
    const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const columns: DataTableColumn<SamsaraProfile>[] = [
    {
      key: "select",
      label: "",
      sortable: false,
      render: (row) => (
        <input
          type="checkbox"
          checked={selected.has(row.samsara_driver_id)}
          onChange={() => toggleRow(row.samsara_driver_id)}
          data-testid={`profile-select-${row.samsara_driver_id}`}
        />
      ),
    },
    {
      key: "samsara_name",
      label: "Samsara name",
      sortable: true,
      sortValue: (row) => row.samsara_name ?? "",
      render: (row) => row.samsara_name || "—",
    },
    {
      key: "samsara_driver_id",
      label: "Samsara ID",
      sortable: true,
      sortValue: (row) => row.samsara_driver_id,
      render: (row) => <span className="font-mono text-xs">{row.samsara_driver_id}</span>,
    },
    {
      key: "last_seen_at",
      label: "Last seen",
      sortable: true,
      sortValue: (row) => row.last_seen_at ?? "",
      render: (row) => (row.last_seen_at ? new Date(row.last_seen_at).toLocaleDateString() : "—"),
    },
    {
      key: "mapped_to",
      label: "Mapped to",
      sortable: true,
      sortValue: (row) => mappedToLabel(row),
      render: (row) => mappedToLabel(row),
    },
    {
      key: "suggestion",
      label: "Resolver suggestion",
      sortable: true,
      sortValue: (row) => row.resolver_suggestion.status,
      render: (row) => {
        const { text, tone } = suggestionLabel(row);
        // §7 nonfinancial palette: slate tokens only — tone is carried by weight/italics, not color.
        const toneClass = tone === "ok" ? "font-semibold text-slate-700" : tone === "warn" ? "italic text-slate-600" : "text-slate-500";
        return (
          <span className="flex items-center gap-2">
            <span className={`text-xs ${toneClass}`}>{text}</span>
            {row.resolver_suggestion.status === "matched" ? (
              <button
                type="button"
                className="text-xs font-semibold text-slate-700 underline"
                data-testid={`apply-suggestion-${row.samsara_driver_id}`}
                onClick={() =>
                  mapMutation.mutate({
                    samsara_driver_ids: [row.samsara_driver_id],
                    target_kind: "driver",
                    target_id: (row.resolver_suggestion as { status: "matched"; target_id: string }).target_id,
                  })
                }
                disabled={mapMutation.isPending}
              >
                Use suggestion
              </button>
            ) : null}
          </span>
        );
      },
    },
  ];

  return (
    <div className="space-y-4 p-4">
      <PageHeader title="Samsara Driver Mapping" subtitle="Map Samsara telematics profiles to real drivers or vendors — never auto-applied" />
      {!companyId ? <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700">Select an operating company.</div> : null}
      <DataPanel title="Samsara profiles">
        <div className="flex items-center gap-3 border-b border-gray-200 px-3 py-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={`text-xs font-semibold uppercase tracking-wide ${status === tab.value ? "text-slate-900 underline" : "text-slate-500"}`}
              onClick={() => {
                setStatus(tab.value);
                setCursor(0);
                setSelected(new Set());
              }}
              data-testid={`status-tab-${tab.value}`}
            >
              {tab.text}
            </button>
          ))}
          <input
            type="text"
            className="ml-auto rounded-sm border border-gray-300 px-2 py-1 text-xs"
            placeholder="Search name or Samsara ID"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCursor(0);
            }}
            data-testid="profiles-search"
          />
        </div>
        {selected.size > 0 ? (
          <div className="flex items-center gap-2 border-b border-gray-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-700">{selected.size} selected</span>
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              onClick={() => setPicker({ kind: "driver", samsaraDriverIds: [...selected] })}
              data-testid="bulk-map-to-driver"
            >
              Map to Driver
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              onClick={() => setPicker({ kind: "vendor", samsaraDriverIds: [...selected] })}
              data-testid="bulk-map-to-vendor"
            >
              Map to Vendor
            </button>
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-40"
              disabled={selectedMappedCount === 0 || unmapMutation.isPending}
              onClick={() => unmapMutation.mutate([...selected])}
              data-testid="bulk-unmap"
            >
              Unmap{selectedMappedCount > 0 ? ` (${selectedMappedCount})` : ""}
            </button>
            <button type="button" className="ml-auto text-xs text-slate-500 underline" onClick={() => setSelected(new Set())}>
              Clear
            </button>
          </div>
        ) : null}
        {profilesQuery.isLoading ? <p className="px-3 py-3 text-xs text-gray-500">Loading Samsara profiles…</p> : null}
        {profilesQuery.isError ? (
          <p className="px-3 py-3 text-xs text-red-700" data-testid="profiles-error">
            Couldn&apos;t load Samsara profiles. Try refreshing the page.
          </p>
        ) : null}
        {!profilesQuery.isLoading && !profilesQuery.isError && rows.length === 0 ? (
          <p className="px-3 py-3 text-xs text-gray-500" data-testid="profiles-empty">
            No {status === "unmapped" ? "unmapped" : status === "mapped" ? "mapped" : ""} Samsara profiles
            {search ? ` matching "${search}"` : ""}.
          </p>
        ) : null}
        {!profilesQuery.isLoading && !profilesQuery.isError && rows.length > 0 ? (
          <>
            <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-1">
              <input
                type="checkbox"
                checked={rows.length > 0 && rows.every((r) => selected.has(r.samsara_driver_id))}
                onChange={toggleAllOnPage}
                data-testid="select-all-on-page"
              />
              <span className="text-xs text-gray-500">Select all on this page ({rows.length})</span>
            </div>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.samsara_driver_id} />
          </>
        ) : null}
        {profilesQuery.data?.next_cursor != null ? (
          <div className="border-t border-gray-200 px-3 py-2">
            <button
              type="button"
              className="text-xs font-semibold text-slate-700 underline"
              onClick={() => setCursor(profilesQuery.data!.next_cursor!)}
              data-testid="profiles-load-more"
            >
              Load more
            </button>
          </div>
        ) : null}
      </DataPanel>

      {picker ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" data-testid="target-picker-modal">
          <div className="w-96 rounded-sm border border-gray-300 bg-white p-4 shadow-lg">
            <h3 className="text-xs font-semibold text-slate-900">
              Map {picker.samsaraDriverIds.length} profile(s) to a {picker.kind}
            </h3>
            <div className="mt-2 flex gap-2 text-xs">
              {(["active", "past", "all"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={pickerFilter === f ? "font-semibold text-slate-900 underline" : "text-slate-500"}
                  onClick={() => setPickerFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="mt-2">
              <Combobox
                options={targetOptions}
                value={pickerTargetId}
                onChange={setPickerTargetId}
                loading={targetsQuery.isLoading}
                placeholder={`Search ${picker.kind}s…`}
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-sm border border-gray-300 px-3 py-1 text-xs"
                onClick={() => {
                  setPicker(null);
                  setPickerTargetId(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-sm bg-slate-800 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                disabled={!pickerTargetId || mapMutation.isPending}
                data-testid="target-picker-confirm"
                onClick={() =>
                  pickerTargetId &&
                  mapMutation.mutate({
                    samsara_driver_ids: picker.samsaraDriverIds,
                    target_kind: picker.kind,
                    target_id: pickerTargetId,
                  })
                }
              >
                Confirm map
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
