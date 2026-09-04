import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { StatusBadge } from "../../components/StatusBadge";
import { ParityTable } from "../../components/parity/ParityTable";
import { CollapsedListFilters, useStagedListFilters } from "../../components/table";
import { useBulkPermission } from "../../hooks/useBulkPermission";
import { useToast } from "../../components/Toast";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import type { summarizeDriverDqf } from "../../lib/driverDqf";
import { Combobox } from "../../components/Combobox";
import { companyToday } from "../../lib/businessDate";
import { BulkActionModal, BulkProgressDialog } from "../../components/bulk";
import { useEntityBulkAction } from "../../components/bulk/useEntityBulkAction";
import { employmentStatusCatalogClient } from "../../api/lists-drivers-catalogs";
import {
  bulkTagDrivers,
  createDriverTag,
  listDriverTagMemberships,
  listDriverTags,
  type DriverTagMembership,
} from "../../api/driver-tags";

const DRIVER_STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "Active", label: "Active" },
  { value: "Inactive", label: "Inactive" },
  { value: "Terminated", label: "Terminated" },
  { value: "Probation", label: "Probation" },
];

export type DriverTableRow = {
  driverId: string;
  name: string;
  status: string;
  summary: ReturnType<typeof summarizeDriverDqf>;
};

// Enriched with flat sort keys for the DQF chip + checklist-stats columns (ParityTable sorts by
// String(row[key]); the real values live nested under `summary`).
type EnrichedDriverRow = DriverTableRow & {
  dqf_level: string;
  dqf_present_count: number;
};

type Props = {
  rows: DriverTableRow[];
  companyId: string;
  onOpenProfile?: (driverId: string) => void;
  onUpdated?: () => void;
};

export function DriversTable({ rows, companyId, onOpenProfile, onUpdated }: Props) {
  const { pushToast } = useToast();
  // Same role gate the old BulkSelectableTable wrapper enforced (BULK_WRITE_ROLES via
  // useBulkPermission, applied inside its BulkActionBar) — preserved here so bulk selection/actions
  // stay hidden for roles that couldn't use them before. Matches the FuelTransactionsTable /
  // TBL-STANDARD batch-1 idiom.
  const bulkPermission = useBulkPermission();
  const bulk = useEntityBulkAction();
  const [deactivateRows, setDeactivateRows] = useState<DriverTableRow[]>([]);
  const [employmentReasonId, setEmploymentReasonId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [tagFilterId, setTagFilterId] = useState("");
  const staged = useStagedListFilters({
    applied: { status: statusFilter, tag: tagFilterId },
    empty: { status: "", tag: "" },
    onApply: (next) => {
      setStatusFilter(next.status);
      setTagFilterId(next.tag);
    },
  });

  // DRIVER-F7334 — canonical company-scoped driver tags.
  const qc = useQueryClient();
  const [tagRows, setTagRows] = useState<DriverTableRow[]>([]);
  const [tagAction, setTagAction] = useState<"add" | "remove">("add");
  const [selectedTagId, setSelectedTagId] = useState<string | null>(null);
  const driverTagsQ = useQuery({
    queryKey: ["drivers", "driver-tags", companyId],
    queryFn: () => listDriverTags(companyId),
    enabled: Boolean(companyId),
    staleTime: 30_000,
  });
  const driverTagOptions = useMemo(
    () => (driverTagsQ.data?.tags ?? []).map((t) => ({ value: t.id, label: t.label })),
    [driverTagsQ.data?.tags]
  );
  const rosterDriverIds = useMemo(() => rows.map((r) => r.driverId), [rows]);
  const membershipsQ = useQuery({
    queryKey: ["drivers", "driver-tag-memberships", companyId, rosterDriverIds.join(",")],
    queryFn: () => listDriverTagMemberships(companyId, rosterDriverIds),
    enabled: Boolean(companyId && rosterDriverIds.length > 0),
    staleTime: 15_000,
  });
  const membershipsByDriver: Record<string, DriverTagMembership[]> = membershipsQ.data?.memberships ?? {};
  const createTagMut = useMutation({
    mutationFn: (input: { code: string; label: string }) => createDriverTag(companyId, input.code, input.label),
    onSuccess: async (result) => {
      await qc.invalidateQueries({ queryKey: ["drivers", "driver-tags", companyId] });
      setSelectedTagId(result.tag.id);
    },
    onError: () => pushToast("Couldn't create tag", "error"),
  });
  const bulkTagMut = useMutation({
    mutationFn: (input: { driverIds: string[]; tagId: string; action: "add" | "remove"; reason?: string }) =>
      bulkTagDrivers(companyId, input.driverIds, input.tagId, input.action, input.reason),
    onSuccess: async (result) => {
      pushToast(`${result.affected} driver(s) ${tagAction === "add" ? "tagged" : "untagged"}`, "success");
      await qc.invalidateQueries({ queryKey: ["drivers", "driver-tag-memberships", companyId] });
      setTagRows([]);
      setSelectedTagId(null);
    },
    onError: () => pushToast("Bulk tag action failed", "error"),
  });

  const enrichedRows = useMemo<EnrichedDriverRow[]>(
    () => rows.map((row) => ({ ...row, dqf_level: row.summary.level, dqf_present_count: row.summary.presentCount })),
    [rows]
  );

  const filteredRows = useMemo(() => {
    let out = enrichedRows;
    if (statusFilter) out = out.filter((row) => row.status === statusFilter);
    if (tagFilterId) {
      // Filters the currently-loaded roster page by active tag membership. A full server-side
      // roster-wide tag filter (beyond the current page) is a follow-on if the owner wants it —
      // see this PR's REMAINING note.
      out = out.filter((row) => (membershipsByDriver[row.driverId] ?? []).some((m) => m.tag_id === tagFilterId));
    }
    return out;
  }, [enrichedRows, statusFilter, tagFilterId, membershipsByDriver]);

  const employmentReasonsQ = useQuery({
    queryKey: ["lists", "drivers", "employment-status", companyId],
    queryFn: () => employmentStatusCatalogClient.list(),
    enabled: Boolean(companyId && deactivateRows.length > 0),
  });
  const inactiveReasons = useMemo(
    () => (employmentReasonsQ.data?.rows ?? []).filter((row) => row.code !== "ACTIVE").map((row) => ({ value: row.id, label: row.label })),
    [employmentReasonsQ.data?.rows]
  );

  useEffect(() => {
    setDeactivateRows([]);
    setEmploymentReasonId(null);
    setTagRows([]);
    setSelectedTagId(null);
    setTagFilterId("");
  }, [companyId]);

  function handleExportSelected(selected: DriverTableRow[]) {
    const scope = selected.length > 0 ? selected : filteredRows;
    if (scope.length === 0) {
      pushToast("No drivers to export.", "info");
      return;
    }
    const esc = (value: unknown) => {
      const s = value == null ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Driver", "Status", "DQF level", "Present", "Missing", "Expired", "Driver ID"];
    const lines = scope.map((row) =>
      [row.name, row.status, row.summary.level, row.summary.presentCount, row.summary.missingCount, row.summary.expiredCount, row.driverId]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `IH35-drivers-dqf-${companyToday()}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <>
    <ParityTable<EnrichedDriverRow>
      rows={filteredRows}
      rowKey={(row) => row.driverId}
      storageKey="drivers-table"
      emptyText="No drivers match the applied filters."
      selectable={bulkPermission.canUseBulkOps}
      filterBar={
        <CollapsedListFilters
          activeFilterCount={(statusFilter ? 1 : 0) + (tagFilterId ? 1 : 0)}
          onApply={staged.apply}
          onReset={staged.reset}
          onCancel={staged.cancel}
          applyDisabled={!staged.dirty}
          testIdPrefix="drivers-table"
          dataAttributes={{ "data-drivers-table-filter-toolbar": "collapsed" }}
        >
          <div className="w-full max-w-xs text-xs font-semibold text-slate-600">
            <label htmlFor="drivers-table-status-filter">Status</label>
            <Combobox
              id="drivers-table-status-filter"
              dataTestId="drivers-table-status-filter"
              className="mt-1"
              options={DRIVER_STATUS_FILTERS.filter((option) => option.value)}
              value={staged.draft.status || null}
              onChange={(next) => staged.setDraft((prev) => ({ ...prev, status: next ?? "" }))}
              placeholder="All statuses"
              allowClear
            />
          </div>
          <div className="w-full max-w-xs text-xs font-semibold text-slate-600">
            <label htmlFor="drivers-table-tag-filter">Tag</label>
            <Combobox
              id="drivers-table-tag-filter"
              dataTestId="drivers-table-tag-filter"
              className="mt-1"
              options={driverTagOptions}
              value={staged.draft.tag || null}
              onChange={(next) => staged.setDraft((prev) => ({ ...prev, tag: next ?? "" }))}
              placeholder="All tags"
              allowClear
            />
          </div>
        </CollapsedListFilters>
      }
      batchActions={(selected) => {
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700"
              onClick={() => handleExportSelected(selected)}
            >
              Export Selected (CSV)
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              title="Add or remove a tag on the selected drivers"
              className="rounded-sm border border-gray-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50"
              onClick={() => {
                setTagRows(selected);
                setTagAction("add");
                setSelectedTagId(null);
              }}
            >
              Tag
            </button>
            <button
              type="button"
              disabled={selected.length === 0}
              title="Deactivate selected drivers"
              className="rounded-sm border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-800 disabled:opacity-50"
              onClick={() => {
                setDeactivateRows(selected);
                setEmploymentReasonId(null);
              }}
            >
              Deactivate
            </button>
          </div>
        );
      }}
      columns={[
        {
          key: "name",
          label: "Driver",
          sortable: true,
          cellClass: "font-medium text-slate-900",
          // D1: the driver name itself opens the profile (entity-name click → its profile),
          // not only the trailing "Open profile" action. Same target as that action.
          render: (row) =>
            onOpenProfile ? (
              <button
                type="button"
                onClick={() => onOpenProfile(row.driverId)}
                className="text-left font-medium text-slate-900 hover:text-slate-700 hover:underline"
              >
                {row.name}
              </button>
            ) : (
              <EntityLinkOrTombstone
                kind="driver"
                id={row.driverId}
                name={row.name}
                noun="Driver"
                className="font-medium text-slate-900 hover:text-slate-700 hover:underline"
                data-testid="drivers-table-name-link"
              />
            ),
        },
        {
          key: "status",
          label: "Status",
          sortable: true,
          render: (row) => <StatusBadge status={row.status} />,
        },
        {
          key: "dqf_level",
          label: "DQF status chips",
          sortable: true,
          render: (row) => <DriverDqfComplianceChip summary={row.summary} compact />,
        },
        {
          key: "dqf_present_count",
          label: "Checklist stats",
          cellClass: "text-slate-600",
          sortable: true,
          render: (row) => `${row.summary.presentCount} present · ${row.summary.missingCount} missing · ${row.summary.expiredCount} expired`,
        },
        {
          // EXEMPT (derived from a batch reverse-lookup, no single sortable scalar on the row).
          key: "tags",
          label: "Tags",
          render: (row) => {
            const tags = membershipsByDriver[row.driverId] ?? [];
            if (tags.length === 0) return <span className="text-xs text-gray-400">—</span>;
            return (
              <div className="flex flex-wrap gap-1" data-testid={`drivers-table-tags-${row.driverId}`}>
                {tags.map((t) => (
                  <span key={t.tag_id} className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
                    {t.label}
                  </span>
                ))}
              </div>
            );
          },
        },
        {
          // EXEMPT (pure action column — reuses the standing "actions" key already registered in
          // EXEMPT_COLUMN_KEYS / GLOBAL-SORT-RULE.md; no per-driver data to sort on).
          key: "actions",
          label: "Profile",
          className: "text-right",
          cellClass: "text-right",
          render: (row) =>
            onOpenProfile ? (
              <button type="button" onClick={() => onOpenProfile(row.driverId)} className="text-xs font-semibold text-slate-700 hover:underline">
                Open profile
              </button>
            ) : (
              <EntityLinkOrTombstone
                kind="driver"
                id={row.driverId}
                name={row.name}
                noun="Driver"
                className="text-xs font-semibold text-slate-700 hover:underline"
                data-testid="drivers-table-open-profile-link"
              />
            ),
        },
      ]}
    />
    <BulkActionModal
      open={deactivateRows.length > 0}
      actionLabel="Deactivate drivers"
      affectedCount={deactivateRows.length}
      requiresReason
      confirming={bulk.progressLoading}
      description="Selected drivers will become inactive and leave active rosters. Existing history is retained."
      payloadFields={
        <div className="space-y-1">
          <label htmlFor="driver-bulk-deactivate-reason" className="text-xs font-medium text-gray-800">Employment status reason</label>
          <Combobox
            id="driver-bulk-deactivate-reason"
            options={inactiveReasons}
            value={employmentReasonId}
            onChange={setEmploymentReasonId}
            placeholder={employmentReasonsQ.isLoading ? "Loading reasons…" : "Select reason"}
          />
          {employmentReasonsQ.isError ? <p className="text-xs text-red-600">Could not load employment status reasons.</p> : null}
        </div>
      }
      onCancel={() => {
        if (bulk.progressLoading) return;
        setDeactivateRows([]);
        setEmploymentReasonId(null);
      }}
      onConfirm={({ reason }) => {
        if (!employmentReasonId) {
          pushToast("Select an employment status reason.", "error");
          return;
        }
        void bulk.runBulk({
          domain: "mdata",
          resource: "drivers",
          ids: deactivateRows.map((row) => row.driverId),
          action: "set_status",
          payload: { status: "Inactive", reason_code_id: employmentReasonId },
          reason,
          operatingCompanyId: companyId,
          invalidateKeys: [["drivers"]],
        }, onUpdated).then(() => {
          setDeactivateRows([]);
          setEmploymentReasonId(null);
        }).catch(() => undefined);
      }}
    />
    <BulkActionModal
      open={tagRows.length > 0}
      actionLabel={tagAction === "add" ? "Tag drivers" : "Remove tag"}
      affectedCount={tagRows.length}
      requiresReason={tagAction === "remove"}
      confirming={bulkTagMut.isPending}
      description={
        tagAction === "add"
          ? "Selected drivers will be tagged. Tag membership history is retained; removing later archives it, it is never deleted."
          : "Selected drivers will have this tag removed. A reason is required and the membership is archived, not deleted."
      }
      payloadFields={
        <div className="space-y-3">
          <div className="flex gap-2 text-xs font-semibold">
            <button
              type="button"
              className={`rounded-sm border px-2 py-1 ${tagAction === "add" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 text-slate-700"}`}
              onClick={() => setTagAction("add")}
            >
              Add tag
            </button>
            <button
              type="button"
              className={`rounded-sm border px-2 py-1 ${tagAction === "remove" ? "border-slate-700 bg-slate-700 text-white" : "border-gray-300 text-slate-700"}`}
              onClick={() => setTagAction("remove")}
            >
              Remove tag
            </button>
          </div>
          <div>
            <label htmlFor="driver-bulk-tag-picker" className="text-xs font-medium text-gray-800">Tag</label>
            <Combobox
              id="driver-bulk-tag-picker"
              options={driverTagOptions}
              value={selectedTagId}
              onChange={setSelectedTagId}
              placeholder={driverTagsQ.isLoading ? "Loading tags…" : "Select tag"}
              allowAddNew={
                tagAction === "add"
                  ? {
                      label: "+ Create new tag",
                      onAdd: (query) => {
                        const code = query.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").slice(0, 48);
                        if (!code) return;
                        createTagMut.mutate({ code, label: query.trim() });
                      },
                    }
                  : undefined
              }
            />
            {driverTagsQ.isError ? <p className="text-xs text-red-600">Could not load tags.</p> : null}
          </div>
        </div>
      }
      onCancel={() => {
        if (bulkTagMut.isPending) return;
        setTagRows([]);
        setSelectedTagId(null);
      }}
      onConfirm={({ reason }) => {
        if (!selectedTagId) {
          pushToast("Select a tag.", "error");
          return;
        }
        bulkTagMut.mutate({
          driverIds: tagRows.map((row) => row.driverId),
          tagId: selectedTagId,
          action: tagAction,
          reason,
        });
      }}
    />
    <BulkProgressDialog
      open={bulk.progressOpen}
      requested={bulk.progress.requested}
      succeeded={bulk.progress.succeeded}
      failed={bulk.progress.failed}
      loading={bulk.progressLoading}
      bulk_call_id={bulk.progress.bulk_call_id}
      onClose={() => bulk.setProgressOpen(false)}
    />
    </>
  );
}
