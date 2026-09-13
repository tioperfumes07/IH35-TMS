import { useQuery } from "@tanstack/react-query";
import { listExpenseDuplicates } from "../../api/accounting";
import { DataPanel } from "../../components/layout/DataPanel";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
};

// D2 (owner law, 2026-09-13, "ONE saved query, published three ways") — the SAME
// listExpenseDuplicateGroups() definition that powers ExpensesListPage.tsx's full-list panel and
// OwnerHome.tsx's "Duplicate expenses" chip, scoped to this one vendor via the same additive
// vendor_id filter the backend service already accepts. Never a second query, never a re-derived
// fingerprint.
export function VendorDuplicateExpensesSection({ operatingCompanyId, vendorId }: Props) {
  const query = useQuery({
    queryKey: ["vendor-duplicate-expenses", operatingCompanyId, vendorId],
    queryFn: () => listExpenseDuplicates(operatingCompanyId, 25, vendorId),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  const groups = query.data?.groups ?? [];

  if (!query.isLoading && !query.isError && groups.length === 0) return null;

  return (
    <DataPanel title="Possible duplicate expenses">
      {query.isError ? (
        <ListErrorBanner
          message={userFacingApiError(query.error, "Couldn't load duplicate expenses for this vendor")}
          onRetry={() => void query.refetch()}
        />
      ) : query.isLoading ? (
        <p className="text-xs text-gray-500">Loading…</p>
      ) : (
        <div className="space-y-1" data-testid="vendor-duplicate-expenses-reverse">
          {groups.map((group) => (
            <div
              key={`${group.vendor_uuid}:${group.transaction_date}:${group.total_amount_cents}`}
              className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs text-slate-700"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">
                  {group.count} expenses · {formatDateUS(group.transaction_date)} · {formatUsdCents(group.total_amount_cents)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-2">
                {group.members.map((m) => (
                  <EntityLink
                    key={m.id}
                    kind="expense"
                    id={m.id}
                    label={entityLabel(m.expense_number, m.id, "Expense")}
                    className="text-slate-700 hover:underline"
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </DataPanel>
  );
}
