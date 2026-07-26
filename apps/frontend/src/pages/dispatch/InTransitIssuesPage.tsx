import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EntityLink } from "../../components/shared/EntityLink";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
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

export function InTransitIssuesPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [loadId, setLoadId] = useState("");
  const [category, setCategory] = useState("mechanical");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<"info" | "warning" | "severe">("warning");
  const [error, setError] = useState("");

  const issuesQ = useQuery({
    queryKey: ["dispatch", "intransit-issues", companyId],
    queryFn: () => listDispatchIntransitIssues(companyId),
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
            <Link to={`/dispatch?load_id=${encodeURIComponent(issue.load_id)}`} className="text-slate-700 hover:underline">
              {issue.load_number ?? issue.load_id}
            </Link>
          ) : (
            issue.load_number ?? "—"
          ),
      },
      { key: "driver_name", label: "Driver", sortable: true, render: (issue) => <EntityLink kind="driver" id={issue.driver_id ?? undefined} label={issue.driver_name ?? "—"} /> },
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

      <ParityTable<DispatchIntransitIssueRow>
        columns={columns}
        rows={issues}
        rowKey={(issue) => issue.id}
        loading={issuesQ.isLoading}
        emptyText="No in-transit issues."
        storageKey="dispatch-intransit-issues"
        exportFilename="intransit-issues"
      />

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
