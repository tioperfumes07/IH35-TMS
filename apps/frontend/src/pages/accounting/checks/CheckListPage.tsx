import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listChecks } from "../../../api/checks";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { formatDateUS } from "../../../lib/formatDate";

/**
 * Check list route (`/accounting/checks`), R-154 §5. Minimal server-sorted-by-date list for PR 4/7 --
 * full ParityTable design-law parity (sortable columns, server sort on every column, voided banner
 * styling) is a follow-up refinement once the print-queue and void/reissue flows (PR 5-6/7) give this
 * list something more than a plain read to show. Disclosed, not silently thin.
 */
export function CheckListPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const query = useQuery({
    queryKey: ["checks", "list", companyId, offset],
    queryFn: () => listChecks(companyId, { limit, offset }),
    enabled: Boolean(companyId),
  });

  return (
    <AccountingSubNavWrapper
      title="Checks"
      subtitle="All checks"
      createControl={
        <Link to="/accounting/checks/new">
          <Button variant="primary">+ Check</Button>
        </Link>
      }
    >
      {!companyId ? (
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      ) : query.isLoading ? (
        <div className="text-xs text-gray-500">Loading…</div>
      ) : (
        <div className="rounded border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-left text-gray-500">
              <tr>
                <th className="px-3 py-2">Check #</th>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Payee</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {(query.data?.rows ?? []).map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-3 py-2">
                    <Link to={`/accounting/checks/${row.id}`} className="text-blue-700 underline">
                      {row.check_number ?? "To print"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{formatDateUS(row.transaction_date)}</td>
                  <td className="px-3 py-2">{row.print_on_check_name}</td>
                  <td className="px-3 py-2">{row.voided_at ? "Voided" : row.print_status}</td>
                  <td className="px-3 py-2 text-right">
                    ${(row.total_amount_cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
              {(query.data?.rows ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-400">
                    No checks yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
            <button type="button" disabled={offset === 0} onClick={() => setOffset((o) => Math.max(0, o - limit))} className="disabled:opacity-40">
              ← Prev
            </button>
            <button
              type="button"
              disabled={(query.data?.rows ?? []).length < limit}
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
