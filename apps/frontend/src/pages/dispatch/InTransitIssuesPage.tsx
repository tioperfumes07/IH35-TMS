import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useMemo, useState } from "react";
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
import { formatQueryErrorDetail } from "../../lib/tableError";

export function InTransitIssuesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5186 — visible reverse filters (URL-only ?driver_id=/load_id=/unit_id= is not reverse chrome).
  const reverseLoadId = searchParams.get("load_id")?.trim() || "";
  const reverseDriverId = searchParams.get("driver_id")?.trim() || "";
  const reverseUnitId = searchParams.get("unit_id")?.trim() || "";
  const [createOpen, setCreateOpen] = useState(false);
  const [loadId, setLoadId] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "severe">("warning");
  const [error, setError] = useState("");

  function patchSearchParam(key: "driver_id" | "load_id" | "unit_id", next: string) {
    const p = new URLSearchParams(searchParams);
    if (next) p.set(key, next);
    else p.delete(key);
    setSearchParams(p, { replace: true });
  }

  const issuesQ = useQuery({
    queryKey: ["dispatch", "intransit-issues", companyId, reverseLoadId, reverseDriverId, reverseUnitId],
    queryFn: () =>
      listDispatchIntransitIssues(companyId, {
        load_id: reverseLoadId || undefined,
        driver_id: reverseDriverId || undefined,
        unit_id: reverseUnitId || undefined,
      }),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createDispatchIntransitIssue({
        operating_company_id: companyId,
        load_id: loadId.trim(),
        issue_category: category,
        issue_description: description.trim(),
        severity,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dispatch", "intransit-issues", companyId] });
      setCreateOpen(false);
      setLoadId("");
      setDescription("");
    },
    onError: () => setError("Failed to create issue."),
  });

  const resolveMutation = useMutation({
    mutationFn: (issueId: string) => resolveDispatchIntransitIssue(issueId, { operating_company_id: companyId }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["dispatch", "intransit-issues", companyId] }),
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
        render: (issue) =>
          issue.load_id ? (
            <EntityLink kind="load" id={issue.load_id} label={entityLabel(issue.load_number, issue.load_id, "Load")} />
          ) : (
            entityLabel(issue.load_number, null, "Load")
          ),
      },
      { key: "driver_name", label: "Driver", sortable: true, render: (issue) => <EntityLink kind="driver" id={issue.driver_id ?? undefined} label={entityLabel(issue.driver_name, issue.driver_id, "Driver")} /> },
      { key: "unit_number", label: "Unit", sortable: true, render: (issue) => <EntityLink kind="unit" id={issue.unit_id ?? undefined} label={entityLabel(issue.unit_number, issue.unit_id, "Unit")} /> },
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
              onClick={() => resolveMutation.mutate(issue.id)}
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

      <div className="flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3">
        <label className="block min-w-[200px] text-xs text-slate-600">
          Driver
          <div className="mt-1">
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={reverseDriverId || null}
              onChange={(next) => patchSearchParam("driver_id", next ?? "")}
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
              value={reverseLoadId || null}
              onChange={(next) => patchSearchParam("load_id", next ?? "")}
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
              value={reverseUnitId || null}
              onChange={(next) => patchSearchParam("unit_id", next ?? "")}
              allowCreate={false}
              placeholder="All units"
              className="w-full"
              dataTestId="intransit-issues-filter-unit"
            />
          </div>
        </label>
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

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create In-Transit Issue">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            if (!loadId.trim() || description.trim().length < 10) {
              setError("Load ID and description (≥10 chars) are required.");
              return;
            }
            createMutation.mutate();
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
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Category</label>
            <select
              value={category}
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
              onChange={(event) => setDescription(event.target.value)}
              className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              rows={4}
            />
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
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
