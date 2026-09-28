import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { listChecks, type CheckListRow } from "../../../api/checks";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { formatDateUS } from "../../../lib/formatDate";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

/**
 * Check list route (`/accounting/checks`), R-154 §5. Minimal server-sorted-by-date list for PR 4/7 --
 * full ParityTable design-law parity (server sort on every column, voided banner styling) is a
 * follow-up refinement once the print-queue and void/reissue flows (PR 5-6/7) give this list
 * something more than a plain read to show. Disclosed, not silently thin.
 *
 * go26-consolidation-ratchet (raw_table_outside_infra): routed through the same ParityTable the
 * other 51 accounting list pages use, "caller pre-pages" recipe (pass the current server page's
 * rows, pageSize = rows.length, hidePager) since this page still owns its own Prev/Next offset
 * chrome rather than ParityTable's internal pager.
 */
export function CheckListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const navigate = useNavigate();
  const companyId = selectedCompanyId ?? "";
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const query = useQuery({
    queryKey: ["checks", "list", companyId, offset],
    queryFn: () => listChecks(companyId, { limit, offset }),
    enabled: Boolean(companyId),
  });

  const rows = query.data?.rows ?? [];

  const columns: Array<ParityColumn<CheckListRow>> = [
    {
      key: "check_number",
      label: "Check #",
      sortable: false,
      render: (row) => (
        <Link to={`/accounting/checks/${row.id}`} className="text-blue-700 underline">
          {row.check_number ?? "To print"}
        </Link>
      ),
    },
    { key: "transaction_date", label: "Date", sortable: false, render: (row) => formatDateUS(row.transaction_date) },
    { key: "print_on_check_name", label: "Payee", sortable: false },
    {
      key: "print_status",
      label: "Status",
      sortable: false,
      render: (row) => (row.voided_at ? "Voided" : row.print_status),
    },
    {
      key: "total_amount_cents",
      label: "Amount",
      sortable: false,
      className: "text-right",
      cellClass: "text-right",
      render: (row) =>
        `$${(row.total_amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
    },
  ];

  return (
    <AccountingSubNavWrapper
      title="Checks"
      subtitle="All checks"
      createControl={
        <div className="flex items-center gap-2">
          <Link to="/accounting/checks/print">
            <Button variant="tertiary">Print checks</Button>
          </Link>
          <Link to="/accounting/checks/new">
            <Button variant="primary">+ Check</Button>
          </Link>
        </div>
      }
    >
      {!companyId ? (
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      ) : query.isError ? (
        <ListErrorBanner onRetry={() => void query.refetch()} />
      ) : (
        <div className="rounded border border-gray-200">
          <ParityTable<CheckListRow>
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            emptyText="No checks yet."
            onRowClick={(row) => navigate(`/accounting/checks/${row.id}`)}
            pageSize={rows.length || 1}
            hidePager
            enableColumnResize={false}
            enableColumnReorder={false}
          />
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
            <button type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))} className="disabled:opacity-40">
              ← Prev
            </button>
            <button
              type="button"
              disabled={rows.length < limit}
              onClick={() => setOffset((o) => o + limit)}
              className="disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </AccountingSubNavWrapper>
  );
}
