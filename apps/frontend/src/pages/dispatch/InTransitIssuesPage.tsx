import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  createDispatchIntransitIssue,
  listDispatchIntransitIssues,
  resolveDispatchIntransitIssue,
  type DispatchIntransitIssueRow,
} from "../../api/dispatch";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ListErrorState } from "../../components/ListErrorState";
import { useStagedListFilters } from "../../components/table";
import { formatQueryErrorDetail } from "../../lib/tableError";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";

const EMPTY_FILTERS = {
  driverId: "",
  loadId: "",
  unitId: "",
};

export function InTransitIssuesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5186 + LV-DISPATCH-INTRANSIT-ISSUES-FILTER-SILENT-APPLY — stage until Apply;
  // URL driver_id/load_id/unit_id sync on Apply/Reset. issue_id remains deep-link only.
  const reverseIssueId = searchParams.get("issue_id")?.trim() || "";
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() || "";
  const loadIdFromUrl = searchParams.get("load_id")?.trim() || "";
  const unitIdFromUrl = searchParams.get("unit_id")?.trim() || "";
  const [createOpen, setCreateOpen] = useState(false);
  const [loadId, setLoadId] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "severe">("warning");
  const [error, setError] = useState("");
  const createGenerationRef = useRef(0);
  const { pushToast } = useToast();

  useEffect(() => {
    createGenerationRef.current += 1;
    setLoadId("");
    setCategory("mechanical");
    setDescription("");
    setSeverity("warning");
    setError("");
  }, [companyId, createOpen]);

  function patchListSearchParam(next: { driverId: string; loadId: string; unitId: string }) {
    const p = new URLSearchParams(searchParams);
    const pairs: Array<["driver_id" | "load_id" | "unit_id", string]> = [
      ["driver_id", next.driverId],
      ["load_id", next.loadId],
      ["unit_id", next.unitId],
    ];
    for (const [key, value] of pairs) {
      if (value) p.set(key, value);
      else p.delete(key);
    }
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
    loadId: loadIdFromUrl,
    unitId: unitIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({
      ...prev,
      driverId: driverIdFromUrl,
      loadId: loadIdFromUrl,
      unitId: unitIdFromUrl,
    }));
  }, [driverIdFromUrl, loadIdFromUrl, unitIdFromUrl]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }
  function setLoadFilter(next: string) {
    staged.setDraft((d) => ({ ...d, loadId: next }));
  }
  function setUnitFilter(next: string) {
    staged.setDraft((d) => ({ ...d, unitId: next }));
  }

  const issuesQ = useQuery({
    queryKey: [
      "dispatch",
      "intransit-issues",
      companyId,
      reverseIssueId,
      applied.loadId,
      applied.driverId,
      applied.unitId,
    ],
    queryFn: () =>
      listDispatchIntransitIssues(companyId, {
        issue_id: reverseIssueId || undefined,
        load_id: applied.loadId || undefined,
        driver_id: applied.driverId || undefined,
        unit_id: applied.unitId || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: (input: {
      generation: number;
      companyId: string;
      loadId: string;
      category: string;
      description: string;
      severity: "info" | "warning" | "severe";
    }) =>
      createDispatchIntransitIssue({
        operating_company_id: input.companyId,
        load_id: input.loadId,
        issue_category: input.category,
        issue_description: input.description,
        severity: input.severity,
      }),
    onSuccess: (_created, input) => {
      if (input.generation !== createGenerationRef.current) return;
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "intransit-issues", input.companyId] });
      setCreateOpen(false);
      setLoadId("");
      setDescription("");
    },
    onError: (_cause, input) => {
      if (input.generation === createGenerationRef.current) setError("Failed to create issue.");
    },
  });

  const resolveMutation = useMutation({
    mutationFn: (input: { issueId: string; companyId: string }) =>
      resolveDispatchIntransitIssue(input.issueId, { operating_company_id: input.companyId }),
    onSuccess: (_resolved, input) =>
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "intransit-issues", input.companyId] }),
    // DISP-F6329: createMutation's onError sets the local `error` state, but that state only
    // renders inside the "Create In-Transit Issue" modal — invisible from the table's "Resolve"
    // button. A rejected resolve silently did nothing. Use a toast here instead, since the table
    // row has no local error-display surface of its own.
    onError: (err) => pushToast(userFacingApiError(err, "Could not resolve this issue"), "error"),
  });

  const issues = issuesQ.data?.issues ?? [];

  // Migrated to the shared QBO-parity grid — columns, load deep-link, and the Resolve row action are
  // preserved verbatim (§7 additive-only). Declared BEFORE the `!companyId` early return below so the
  // hook call is unconditional (Rules of Hooks — companyId can change between renders).
  const columns = useMemo<ParityColumn<DispatchIntransitIssueRow>[]>(
    () => [
      {
        key: "reported_at",
        label: "Reported",
        sortable: true,
        render: (issue) => new Date(issue.reported_at).toLocaleString(),
      },
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (issue) => <EntityLinkOrTombstone kind="load" id={issue.load_id} name={issue.load_number} noun="Load" />,
      },
      { key: "driver_name", label: "Driver", sortable: true, render: (issue) => <EntityLinkOrTombstone kind="driver" id={issue.driver_id} name={issue.driver_name} noun="Driver" /> },
      { key: "unit_number", label: "Unit", sortable: true, render: (issue) => <EntityLinkOrTombstone kind="unit" id={issue.unit_id} name={issue.unit_number} noun="Unit" /> },
      { key: "issue_category", label: "Category", sortable: true },
      { key: "severity", label: "Severity", render: (issue) => <StatusBadge status={issue.severity} /> },
      { key: "status", label: "Status", sortable: true },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (issue) =>
          issue.status === "open" || issue.status === "acknowledged" ? (
            <Button
              size="sm"
              variant="secondary"
              loading={resolveMutation.isPending}
              onClick={() => resolveMutation.mutate({ issueId: issue.id, companyId })}
            >
              Resolve
            </Button>
          ) : (
            "—"
          ),
      },
    ],
    [resolveMutation],
  );

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  return (
    <div data-testid="dispatch-intransit-issues-page" className="mx-auto max-w-6xl space-y-4">
      <PageHeader
        title="In-Transit Issues"
        subtitle="Driver-reported and office-created in-flight problems"
        actions={
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              + Create Issue
            </Button>
            <Link to="/dispatch" className="rounded-sm border px-3 py-1.5 text-sm">
              Dispatch Home
            </Link>
          </div>
        }
      />

      <div className="relative flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3" data-testid="intransit-issues-filters">
        <label className="block min-w-[200px] text-xs text-slate-600">
          Driver
          <div className="mt-1">
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="w-full"
              dataTestId="intransit-issues-filter-driver"
            />
          </div>
        </label>
        <label className="block min-w-[200px] text-xs text-slate-600">
          Load
          <div className="mt-1">
            <EntityPicker
              kind="load"
              operatingCompanyId={companyId}
              value={filterDraft.loadId || null}
              onChange={(next) => setLoadFilter(next ?? "")}
              allowCreate={false}
              placeholder="All loads"
              className="w-full"
              dataTestId="intransit-issues-filter-load"
            />
          </div>
        </label>
        <label className="block min-w-[200px] text-xs text-slate-600">
          Unit
          <div className="mt-1">
            <EntityPicker
              kind="unit"
              operatingCompanyId={companyId}
              value={filterDraft.unitId || null}
              onChange={(next) => setUnitFilter(next ?? "")}
              allowCreate={false}
              placeholder="All units"
              className="w-full"
              dataTestId="intransit-issues-filter-unit"
            />
          </div>
        </label>
        <Button type="button" size="sm" data-testid="intransit-issues-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="intransit-issues-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="intransit-issues-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>

      {issuesQ.isError ? (
        <ListErrorState
          title="Couldn't load in-transit issues"
          {...formatQueryErrorDetail(issuesQ.error)}
          onRetry={() => void issuesQ.refetch()}
        />
      ) : (
        <ParityTable<DispatchIntransitIssueRow>
        columns={columns}
        rows={issues}
        rowKey={(issue) => issue.id}
        loading={issuesQ.isLoading}
        emptyText="No in-transit issues."
        storageKey="dispatch-intransit-issues"
        exportFilename="intransit-issues"
        />
      )}

      <Modal variant="drawer" open={createOpen} onClose={() => { if (!createMutation.isPending) setCreateOpen(false); }} title="Create In-Transit Issue">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (!loadId.trim() || description.trim().length < 10) {
              setError("Load ID and description (≥10 chars) are required.");
              return;
            }
            createMutation.mutate({
              generation: createGenerationRef.current,
              companyId,
              loadId: loadId.trim(),
              category,
              description: description.trim(),
              severity,
            });
          }}
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Load</label>
            {/* C1 PICKER LAW: was a raw-UUID box. An in-transit issue whose load_id is blank or
                mistyped is an exception report attached to nothing. */}
            <EntityPicker
              kind="load"
              operatingCompanyId={companyId}
              value={loadId || null}
              onChange={(next) => setLoadId(next ?? "")}
              placeholder="Select load"
              disabled={createMutation.isPending}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Category</label>
            <select
              value={category}
              disabled={createMutation.isPending}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="mechanical">Mechanical</option>
              <option value="safety">Safety</option>
              <option value="cargo">Cargo</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Severity</label>
            <select
              value={severity}
              disabled={createMutation.isPending}
              onChange={(event) => setSeverity(event.target.value as typeof severity)}
              className="rounded-sm border border-gray-300 h-9 px-2 text-[13px]"
            >
              <option value="info">Info</option>
              <option value="warning">Warning</option>
              <option value="severe">Severe</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Description</label>
            <textarea
              value={description}
              disabled={createMutation.isPending}
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={4}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)} disabled={createMutation.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
