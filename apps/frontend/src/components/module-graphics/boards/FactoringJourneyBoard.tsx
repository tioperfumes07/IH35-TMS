import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listFactoringPurchases } from "../../../api/factoring-purchases";
import { EntityLink } from "../../shared/EntityLink";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";
import { formatNumber, formatUsdCents } from "../format";
import { getFactoringJourney } from "../api";

type Props = { companyId: string };

function cents(v: number | string | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? Number(v) : v;
  return Number.isFinite(n) ? n : 0;
}

/**
 * ROUND 443.246 — Factoring invoice journey (LEAD-FIN-DESIGN-Factoring).
 * Prefers GET /factoring/journey; falls back to posted purchases list.
 */
export function FactoringJourneyBoard({ companyId }: Props) {
  const apiQ = useQuery({
    queryKey: ["mod-graphics", "factoring-journey", companyId],
    queryFn: () => getFactoringJourney(companyId),
    enabled: Boolean(companyId),
    retry: false,
  });

  const purchQ = useQuery({
    queryKey: ["mod-graphics", "factoring-purchases", companyId],
    queryFn: () => listFactoringPurchases(companyId, { status: "posted" }),
    enabled: Boolean(companyId) && apiQ.data == null && !apiQ.isLoading,
    retry: false,
  });

  const purchases = useMemo(() => {
    if (apiQ.data?.purchases?.length) return apiQ.data.purchases;
    return (purchQ.data?.purchases ?? [])
      .filter((p) => p.status === "posted" && !p.voided_at)
      .map((p) => ({
        id: p.id,
        display_id: p.display_id,
        purchase_date: p.purchase_date,
        invoice_count: p.invoice_count ?? 0,
        gross_cents: cents(p.gross_cents),
        fee_cents: cents(p.fee_cents),
        escrow_cents: cents(p.escrow_reserve_cents),
        cash_reserve_cents: cents(p.cash_reserve_cents),
        wire_cents: cents(p.wire_fee_cents),
        net_cents: cents(p.net_to_company_cents),
      }));
  }, [apiQ.data, purchQ.data]);

  const totals = useMemo(() => {
    if (apiQ.data?.totals) return apiQ.data.totals;
    const gross = purchases.reduce((s, p) => s + p.gross_cents, 0);
    const fee = purchases.reduce((s, p) => s + p.fee_cents, 0);
    const escrow = purchases.reduce((s, p) => s + p.escrow_cents, 0);
    const wire = purchases.reduce((s, p) => s + p.wire_cents, 0);
    const net = purchases.reduce((s, p) => s + p.net_cents, 0);
    const invoices = purchases.reduce((s, p) => s + p.invoice_count, 0);
    const trueCost = gross > 0 ? ((fee + wire) / gross) * 100 : null;
    return {
      purchase_count: purchases.length,
      invoice_count: invoices,
      gross_cents: gross,
      fee_cents: fee,
      escrow_cents: escrow,
      wire_cents: wire,
      net_cents: net,
      true_cost_pct: trueCost,
    };
  }, [apiQ.data, purchases]);

  const steps = apiQ.data?.steps ?? [
    { step: 1, label: "Delivered · invoiced", value: null as number | null },
    { step: 2, label: "Sent to Faro", value: null },
    { step: 3, label: "Purchased", value: totals.purchase_count },
    { step: 4, label: "Fee + escrow", value: totals.fee_cents + totals.escrow_cents },
    { step: 5, label: "Net wired", value: totals.net_cents },
    { step: 6, label: "Paid to Faro · reserve released", value: null },
  ];

  return (
    <ModBoardShell
      eyebrow="Factoring · USMCA · live"
      title="Invoice journey"
      subtitle="Posted Faro purchases — true cost = (fee + wire) ÷ gross"
      testId="factoring-journey-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="Purchases"
          value={formatNumber(totals.purchase_count)}
          to="/factoring?tab=purchase_report"
          testId="factoring-journey-kpi-purchases"
        />
        <ClickableStat
          label="Gross"
          value={formatUsdCents(totals.gross_cents)}
          hint={`${formatNumber(totals.invoice_count)} invoices`}
          to="/factoring?tab=purchase_report"
          testId="factoring-journey-kpi-gross"
        />
        <ClickableStat
          label="Net to company"
          value={formatUsdCents(totals.net_cents)}
          to="/factoring?tab=payments_to_you"
          testId="factoring-journey-kpi-net"
        />
        <ClickableStat
          label="True cost"
          value={
            totals.true_cost_pct == null ? "—" : `${totals.true_cost_pct.toFixed(2)}%`
          }
          hint={`Fee ${formatUsdCents(totals.fee_cents)} · Wire ${formatUsdCents(totals.wire_cents)}`}
          to="/factoring?tab=chargebacks_fees"
          testId="factoring-journey-kpi-true-cost"
        />
      </div>

      <ModSectionHead title="Journey steps" viewAllTo="/factoring" />
      <div className="grid gap-1 sm:grid-cols-3 lg:grid-cols-6" data-testid="factoring-journey-steps">
        {steps.map((s) => (
          <div
            key={s.step}
            className="rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] px-2 py-1.5"
          >
            <div className="text-[11px] font-bold uppercase text-[var(--mod-muted)]">
              {s.step}. {s.label}
            </div>
            <div className="font-[family-name:var(--mod-mono)] text-[14px] font-semibold text-[var(--mod-navy)]">
              {s.value == null
                ? "no data"
                : s.step === 3
                  ? formatNumber(s.value)
                  : formatUsdCents(s.value)}
            </div>
          </div>
        ))}
      </div>

      <ModSectionHead title="Purchases" viewAllTo="/factoring?tab=purchase_report" />
      {purchases.length === 0 ? (
        <p className="mod-board__sub" data-testid="factoring-journey-empty">
          No posted factoring purchases yet. Journey steps with no source stay “no data”.
        </p>
      ) : (
        <div className="space-y-1" data-testid="factoring-journey-purchases">
          {purchases.slice(0, 12).map((p) => {
            const parts = [
              { key: "net", cents: p.net_cents, color: "var(--mod-green)" },
              { key: "fee", cents: p.fee_cents, color: "var(--mod-amber)" },
              { key: "escrow", cents: p.escrow_cents, color: "var(--mod-blue)" },
              { key: "wire", cents: p.wire_cents, color: "var(--mod-red)" },
            ];
            const gross = Math.max(p.gross_cents, 1);
            return (
              <div
                key={p.id}
                className="block rounded-sm border border-[var(--mod-border)] bg-[var(--mod-wash)] px-2 py-1.5 text-inherit hover:border-[var(--mod-navy)]"
                data-mod-click-through="1"
                data-testid={`factoring-journey-row-${p.display_id}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <EntityLink
                    kind="factoring_purchase"
                    id={p.id}
                    label={p.display_id}
                    className="font-[family-name:var(--mod-font-cond)] text-[13px] font-semibold text-[var(--mod-navy)] no-underline"
                  />
                  <span className="text-[12px] text-[var(--mod-muted)]">
                    {p.purchase_date} · {formatNumber(p.invoice_count)} inv ·{" "}
                    {formatUsdCents(p.gross_cents)}
                  </span>
                </div>
                <div className="mt-1 flex h-2 w-full overflow-hidden rounded-sm bg-[#D5DBE3]">
                  {parts.map((part) => (
                    <div
                      key={part.key}
                      style={{
                        width: `${(part.cents / gross) * 100}%`,
                        background: part.color,
                      }}
                      title={`${part.key}: ${formatUsdCents(part.cents)}`}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </ModBoardShell>
  );
}
