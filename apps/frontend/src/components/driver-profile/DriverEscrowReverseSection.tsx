import { useQuery } from "@tanstack/react-query";
import { getDriverEscrow } from "../../api/driverFinance";
import { entityLabel } from "../../lib/entity-label";
import { formatUsdCents } from "../../lib/money";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * Owner order (CC-1 item 3): "add the Escrow view (per-driver escrow balance)". Reads
 * accounting.escrow_accounts/escrow_postings (GET /api/v1/driver-finance/drivers/:id/escrow) —
 * the GL-tied source this session's own GO-19-02 WORM correction wrote to, NOT
 * driver_finance.escrow_balances (confirmed STALE live for the exact 3 drivers that ruling
 * zeroed — filed as ACCT-ESCROW-BALANCES-STALE-VS-GO19, not read here).
 */
export function DriverEscrowReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-escrow-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);

  const query = useQuery({
    queryKey: ["driver-finance", "escrow", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => getDriverEscrow(driverId, operatingCompanyId),
    enabled,
  });

  const accounts = query.data?.accounts ?? [];
  const postings = (query.data?.postings ?? []).slice(0, 5);
  const totalBalanceCents = query.data?.total_balance_cents ?? 0;
  const isLoading = query.isLoading;
  const isError = query.isError;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">Escrow</h3>
        {!isLoading && !isError ? (
          <span className="text-xs font-semibold text-slate-900" data-testid="driver-escrow-total-balance">
            {formatUsdCents(totalBalanceCents)}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-gray-600">This driver's escrow balance and most recent postings.</p>

      {isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {isError ? <ListErrorBanner message="Failed to load escrow." onRetry={() => void query.refetch()} /> : null}
      {!isLoading && !isError && accounts.length === 0 ? (
        <p className="text-xs text-gray-500">No escrow account for this driver.</p>
      ) : null}

      {accounts.length > 0 ? (
        <ul className="space-y-1" data-testid="driver-escrow-accounts">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between rounded-sm border border-gray-100 px-2 py-1 text-xs">
              <span className="text-slate-700">{a.purpose || "Escrow"}</span>
              <span className="font-semibold text-slate-900">{formatUsdCents(a.balance_cents)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {postings.length > 0 ? (
        <div data-testid="driver-escrow-postings">
          <h4 className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent postings</h4>
          <ul className="mt-1 space-y-1">
            {postings.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 rounded-sm border border-gray-100 px-2 py-1 text-xs">
                <span className="min-w-0 text-slate-700">
                  {p.posting_type} — {p.note?.trim() || p.source_type || "—"}
                  {p.linked_journal_entry_id ? (
                    <>
                      {" · "}
                      <EntityLink
                        kind="journal_entry"
                        id={p.linked_journal_entry_id}
                        label={entityLabel(null, p.linked_journal_entry_id, "JE")}
                      />
                    </>
                  ) : null}
                </span>
                <span className="shrink-0 font-semibold text-slate-900">{formatUsdCents(p.amount_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
