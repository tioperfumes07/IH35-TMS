import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router-dom";
import {
  createDispatchIntransitIssue,
  listDispatchIntransitIssues,
  resolveDispatchIntransitIssue,
} from "../../api/dispatch";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { PageHeader } from "../../components/layout/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { useCompanyContext } from "../../contexts/CompanyContext";

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

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm text-slate-600">Select an operating company.</div>;
  }

  const issues = issuesQ.data?.issues ?? [];

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
            <Link to="/dispatch" className="rounded border px-3 py-1.5 text-sm">
              Dispatch Home
            </Link>
          </div>
        }
      />

      <section className="overflow-x-auto rounded border bg-white">
        <table className="min-w-full text-sm">
          <thead className="border-b bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Reported</th>
              <th className="px-3 py-2">Load</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Severity</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {issuesQ.isLoading ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  Loading issues…
                </td>
              </tr>
            ) : issues.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                  No in-transit issues.
                </td>
              </tr>
            ) : (
              issues.map((issue) => (
                <tr key={issue.id} className="border-b last:border-b-0">
                  <td className="px-3 py-2">{new Date(issue.reported_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {issue.load_id ? (
                      <Link to={`/dispatch?load_id=${encodeURIComponent(issue.load_id)}`} className="text-slate-700 hover:underline">
                        {issue.load_number ?? issue.load_id}
                      </Link>
                    ) : (
                      issue.load_number ?? "—"
                    )}
                  </td>
                  <td className="px-3 py-2">{issue.driver_name ?? "—"}</td>
                  <td className="px-3 py-2">{issue.issue_category}</td>
                  <td className="px-3 py-2">
                    <StatusBadge status={issue.severity} />
                  </td>
                  <td className="px-3 py-2">{issue.status}</td>
                  <td className="px-3 py-2">
                    {issue.status === "open" || issue.status === "acknowledged" ? (
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
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create In-Transit Issue">
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
            <label className="text-xs font-semibold text-gray-600">Load ID</label>
            <input
              value={loadId}
              onChange={(event) => setLoadId(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
              placeholder="UUID of load"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-gray-600">Category</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
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
              className="rounded border border-gray-300 h-9 px-2 text-[13px]"
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
              className="rounded border border-gray-300 px-2 py-1.5 text-[13px]"
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
