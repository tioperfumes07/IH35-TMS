import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getBankingTiles, getBankingUncategorized } from "../../../api/banking";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatNumber, formatUsdCents, monthToDateRange } from "../format";
import { getMoneyMap } from "../api";

type Props = { companyId: string };

/**
 * ROUND 443.246 — Banking Money Map (LEAD-FIN-DESIGN-Banking).
 * Prefers GET /banking/money-map; falls back to account tiles + uncategorized count.
 */
export function MoneyMapBoard({ companyId }: Props) {
  const range = useMemo(() => monthToDateRange(), []);

  const apiQ = useQuery({
    queryKey: ["mod-graphics", "money-map", companyId, range.from, range.to],
    queryFn: () => getMoneyMap(companyId, range.from, range.to),
    enabled: Boolean(companyId),
    retry: false,
  });

  const tilesQ = useQuery({
    queryKey: ["mod-graphics", "bank-tiles", companyId],
    queryFn: () => getBankingTiles(companyId),
    enabled: Boolean(companyId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });
  const uncatQ = useQuery({
    queryKey: ["mod-graphics", "bank-uncat-map", companyId],
    queryFn: () => getBankingUncategorized(companyId, { limit: 1 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const accounts = useMemo(() => {
    if (apiQ.data?.accounts?.length) return apiQ.data.accounts;
    return (tilesQ.data?.tiles ?? [])
      .filter((t) => t.tile_kind === "real")
      .map((t) => ({
        bank_account_id: t.id,
        display_name: t.display_name,
        line_count: 0,
        in_cents: 0,
        out_cents: 0,
        pending_review_count: t.uncategorized_count ?? 0,
        feed_state: null as string | null,
      }));
  }, [apiQ.data, tilesQ.data]);

  const pendingTotal =
    apiQ.data?.pending_review_total ??
    uncatQ.data?.meta?.uncategorized_count ??
    accounts.reduce((s, a) => s + (a.pending_review_count ?? 0), 0);

  const totalIn = accounts.reduce((s, a) => s + (a.in_cents ?? 0), 0);
  const totalOut = accounts.reduce((s, a) => s + (a.out_cents ?? 0), 0);
  const totalLines = accounts.reduce((s, a) => s + (a.line_count ?? 0), 0);
  const hasFlow = accounts.some((a) => a.in_cents > 0 || a.out_cents > 0 || a.line_count > 0);

  const groups = apiQ.data?.outflow_groups ?? [];

  return (
    <ModBoardShell
      eyebrow={`Banking · USMCA · ${range.from} → ${range.to}`}
      title="Money map"
      subtitle="Where cash came in and went out — categorized only; uncategorized stays its own group"
      testId="money-map-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Money in"
          value={hasFlow ? formatUsdCents(totalIn) : "—"}
          hint={hasFlow ? `${formatNumber(totalLines)} lines` : "Awaiting money-map API"}
          to={`/banking/transactions?from=${range.from}&to=${range.to}`}
          testId="money-map-kpi-in"
        />
        <ClickableStat
          label="Money out"
          value={hasFlow ? formatUsdCents(totalOut) : "—"}
          to={`/banking/transactions?from=${range.from}&to=${range.to}&direction=out`}
          testId="money-map-kpi-out"
        />
        <ClickableStat
          label="To review"
          value={formatNumber(pendingTotal ?? 0)}
          hint="Pending categorization"
          to="/banking/transactions?type=uncategorized"
          testId="money-map-kpi-review"
        />
        <ClickableStat
          label="Accounts"
          value={formatNumber(accounts.length)}
          to="/banking/accounts"
          testId="money-map-kpi-accounts"
        />
      </div>

      <ModSectionHead title="Accounts" viewAllTo="/banking/accounts" />

      {accounts.length === 0 ? (
        <p className="mod-board__sub" data-testid="money-map-empty">
          No active bank accounts linked. Connect a feed to populate the money map.
        </p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2" data-testid="money-map-accounts">
          {accounts.map((a) => {
            const maxFlow = Math.max(a.in_cents, a.out_cents, 1);
            return (
              <Link
                key={a.bank_account_id}
                to={`/banking/accounts/${a.bank_account_id}`}
                className="rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] p-2 no-underline text-inherit hover:border-[var(--mod-navy)]"
                data-mod-click-through="1"
                data-testid={`money-map-acct-${a.bank_account_id}`}
              >
                <div className="font-[family-name:var(--mod-font-cond)] text-xs font-semibold text-[var(--mod-navy)]">
                  {a.display_name}
                </div>
                <div className="mt-1 grid grid-cols-2 gap-1 text-xs">
                  <div>
                    <div className="text-section-header font-bold uppercase text-[var(--mod-muted)]">In</div>
                    <div className="font-[family-name:var(--mod-mono)] text-[var(--mod-green)]">
                      {hasFlow ? formatUsdCents(a.in_cents) : "—"}
                    </div>
                    <div
                      className="mt-0.5 h-1 rounded-sm bg-[#D5DBE3]"
                      title="Inflow width"
                    >
                      <div
                        className="h-full rounded-sm bg-[var(--mod-green)]"
                        style={{ width: `${hasFlow ? (a.in_cents / maxFlow) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="text-section-header font-bold uppercase text-[var(--mod-muted)]">Out</div>
                    <div className="font-[family-name:var(--mod-mono)] text-[var(--mod-red)]">
                      {hasFlow ? formatUsdCents(a.out_cents) : "—"}
                    </div>
                    <div className="mt-0.5 h-1 rounded-sm bg-[#D5DBE3]">
                      <div
                        className="h-full rounded-sm bg-[var(--mod-red)]"
                        style={{ width: `${hasFlow ? (a.out_cents / maxFlow) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-1 text-section-header text-[var(--mod-muted)]">
                  {formatNumber(a.line_count)} lines · {formatNumber(a.pending_review_count)} to review
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {groups.length > 0 ? (
        <>
          <ModSectionHead title="Outflow groups (categorized)" viewAllTo="/banking/transactions" />
          <div className="mod-board__kpi-grid">
            {groups.map((g) => (
              <ClickableStat
                key={g.key}
                label={g.label}
                value={formatUsdCents(g.cents)}
                to={`/banking/transactions?group=${encodeURIComponent(g.key)}`}
                testId={`money-map-group-${g.key}`}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="mod-board__sub" data-testid="money-map-groups-pending">
          Outflow groups (Relay wallet, cards, advances, vendors) appear when the money-map API is live.
          Uncategorized stays in To review — never guessed into a group.
        </p>
      )}
    </ModBoardShell>
  );
}
