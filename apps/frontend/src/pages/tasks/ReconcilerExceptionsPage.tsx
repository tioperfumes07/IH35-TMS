import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "../../components/layout/PageHeader";
import { KpiCard } from "../../components/layout/KpiCard";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { fetchReconcilerExceptions, type ReconcilerException } from "../../api/reconciler";
import { TasksModuleTabs } from "./TasksModuleTabs";

type Row = ReconcilerException & { rule: string };

function dollars(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** What the owner does next, in plain words. The repair itself happens on the record's own screen,
 *  through the engine that already exists there; this page never writes. */
export function repairHint(row: ReconcilerException): string {
  if (row.repair_engine === "POST /api/v1/accounting/invoices/from-load") return "Create the invoice from this load";
  if (row.repair_engine === "POST /api/v1/accounting/invoices/:id/send") return "Send the draft invoice already on this load";
  if (row.entity_type === "load") return "Complete the missing item on the load";
  if (row.entity_type === "recovery_link") return "Review the driver recovery";
  return "Decide how the short-pay is recovered";
}

export function recordHref(row: ReconcilerException): string | null {
  return row.entity_type === "load" ? `/dispatch/loads/${row.entity_id}` : null;
}

function scrollToQueue() {
  document.getElementById("reconciler-exception-queue")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function ReconcilerExceptionsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const query = useQuery({
    queryKey: ["reconciler", "exceptions", companyId],
    queryFn: ({ signal }) => fetchReconcilerExceptions(companyId, signal),
    enabled: Boolean(companyId),
  });

  const rows = useMemo<Row[]>(
    () => (query.data?.results ?? []).flatMap((r) => r.exceptions.map((e) => ({ ...e, rule: r.title }))),
    [query.data],
  );
  const errored = (query.data?.results ?? []).filter((r) => r.status === "error");
  const atStake = rows.reduce((sum, r) => sum + (r.amount_cents ?? 0), 0);

  const columns = useMemo<ParityColumn<Row>[]>(
    () => [
      { key: "rule", label: "Rule", sortable: true, cellClass: "text-slate-700" },
      {
        key: "entity_label",
        label: "Record",
        sortable: true,
        render: (row) => {
          const href = recordHref(row);
          return href ? (
            <Link to={href} className="font-medium text-blue-700 hover:underline">
              {row.entity_label}
            </Link>
          ) : (
            <span className="font-medium text-slate-800">{row.entity_label}</span>
          );
        },
      },
      { key: "reason", label: "What is wrong", sortable: true, cellClass: "text-slate-700" },
      { key: "since", label: "Since", sortable: true, render: (row) => row.since.slice(0, 10), cellClass: "text-slate-600" },
      { key: "amount_cents", label: "Amount", sortable: true, render: (row) => dollars(row.amount_cents), cellClass: "whitespace-nowrap text-slate-700" },
      { key: "repair_engine", label: "Repair", sortable: true, render: (row) => repairHint(row), cellClass: "text-slate-700" },
    ],
    [],
  );

  if (!companyId) {
    return (
      <div className="space-y-4 p-4">
        <PageHeader title="Exceptions" subtitle="Records the reconciler found out of line" />
        <TasksModuleTabs />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700">
          Select an operating company to view its exceptions.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Exceptions" subtitle="Records the reconciler found out of line, checked live each time this page loads" />
      <TasksModuleTabs />

      {query.isError ? <ListErrorBanner onRetry={() => void query.refetch()} /> : null}
      {errored.length > 0 ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-2 text-xs text-red-800" data-testid="reconciler-errored">
          {errored.map((r) => r.title).join(", ")} could not be checked this time. Its exceptions are not shown, which does not mean it has none.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <KpiCard label="Open exceptions" number={query.data ? rows.length : "—"} onClick={scrollToQueue} />
        <KpiCard label="Money at stake" number={query.data ? dollars(atStake) : "—"} onClick={scrollToQueue} />
      </div>
      {query.data ? (
        <div className="text-xs text-slate-500" data-testid="reconciler-checked">
          {query.data.results.length} rules checked at {new Date(query.data.ran_at).toLocaleTimeString("en-US")}.
        </div>
      ) : null}

      <div id="reconciler-exception-queue" />
      <ParityTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.key}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        storageKey="tasks-reconciler-exceptions"
        emptyText="No exceptions: every rule the reconciler checks holds right now."
      />
    </div>
  );
}
