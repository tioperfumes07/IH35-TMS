import { useEffect, useState } from "react";
import { ActionButton } from "../../../components/shared/ActionButton";
import { X } from "lucide-react";
import { formatUsdCents } from "../../../utils/qboFormat";

export type BankingHomeAttentionFacts = {
  uncategorizedCount: number;
  transactionCount: number;
  reconciledAccountsCount: number;
  totalBankAccounts: number;
  unboundCashGlCount: number;
  qboConnected: boolean;
  escrowBalanceCents: number;
  escrowDriverCount: number;
  unmatchedAged7d: number;
  unmatched7dAlertOpen: boolean;
};

type Props = {
  facts: BankingHomeAttentionFacts;
  onCategorize: () => void;
  onReconcile: () => void;
  onCashGl: () => void;
  onDriverEscrow: () => void;
};

type AttentionRow = {
  id: string;
  tone: "bad" | "warn" | "good";
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
};

/**
 * C-65 / ROUND 304 — house alert surface: fixed right dock, narrow (~380px), enters from
 * the side. Nothing behind them moves. Never full-width in-flow banners.
 * Action buttons stay (Map Cash GL, Start reconciliation, …) — 09-12 money-modules pattern.
 */
export function BankingHomeAttentionStrip({
  facts,
  onCategorize,
  onReconcile,
  onCashGl,
  onDriverEscrow,
}: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setDismissed(new Set());
  }, [
    facts.uncategorizedCount,
    facts.reconciledAccountsCount,
    facts.unboundCashGlCount,
    facts.qboConnected,
    facts.escrowDriverCount,
    facts.escrowBalanceCents,
    facts.unmatchedAged7d,
    facts.unmatched7dAlertOpen,
  ]);

  const rows: AttentionRow[] = [];

  if (facts.unmatchedAged7d > 0) {
    rows.push({
      id: "unmatched-7d-alert",
      tone: "bad",
      title: `${facts.unmatchedAged7d.toLocaleString()} unmatched for 7+ days — ALERT`,
      body: facts.unmatched7dAlertOpen
        ? "Owner A1: a number is not an alert. This pages Owner/Administrator and is open on Integrity Alerts until every aged line is matched to a document."
        : "Owner A1: bank lines older than 7 days still have no bill, expense, invoice, settlement, or payment. Match them — categorizing the account is not a match.",
      action: { label: "Match now", onClick: onCategorize },
    });
  }

  if (facts.transactionCount > 0 && facts.uncategorizedCount > 0) {
    rows.push({
      id: "uncategorized",
      tone: facts.uncategorizedCount / facts.transactionCount >= 0.5 ? "bad" : "warn",
      title: `${facts.uncategorizedCount.toLocaleString()} need Match or Categorize`,
      body: `${facts.uncategorizedCount.toLocaleString()} of ${facts.transactionCount.toLocaleString()} bank transactions still for review.`,
      action: { label: "Categorize now", onClick: onCategorize },
    });
  }

  if (facts.totalBankAccounts > 0 && facts.reconciledAccountsCount === 0) {
    rows.push({
      id: "never-reconciled",
      tone: "bad",
      title: `0 of ${facts.totalBankAccounts} accounts reconciled`,
      body: "Reconciliation is the books gate.",
      action: { label: "Start reconciliation", onClick: onReconcile },
    });
  } else if (facts.totalBankAccounts > 0 && facts.reconciledAccountsCount < facts.totalBankAccounts) {
    rows.push({
      id: "partial-reconciled",
      tone: "warn",
      title: `${facts.reconciledAccountsCount} of ${facts.totalBankAccounts} accounts reconciled`,
      body: "Finish remaining accounts before treating cash as closed.",
      action: { label: "Open reconciliation", onClick: onReconcile },
    });
  }

  if (facts.unboundCashGlCount > 0 && facts.totalBankAccounts > 0) {
    rows.push({
      id: "cash-gl",
      tone: "bad",
      title: `Cash GL unbound on ${facts.unboundCashGlCount}`,
      body: "Map Cash GL before Bank Register work.",
      action: { label: "Map Cash GL", onClick: onCashGl },
    });
  }

  if (!facts.qboConnected) {
    rows.push({
      id: "qbo",
      tone: "warn",
      title: "QuickBooks is not connected",
      body: "Parallel books. Reconcile only — no write-back.",
    });
  }

  if (facts.escrowDriverCount > 0 || facts.escrowBalanceCents !== 0) {
    const dollars = formatUsdCents(facts.escrowBalanceCents);
    rows.push({
      id: "escrow",
      tone: "warn",
      title: `Driver Escrow ${dollars}`,
      body: `Liability across ${facts.escrowDriverCount} driver(s).`,
      action: { label: "Driver Escrow", onClick: onDriverEscrow },
    });
  }

  const visible = rows.filter((r) => !dismissed.has(r.id));
  if (visible.length === 0) return null;

  return (
    <aside
      className="pointer-events-none fixed bottom-3 right-3 z-[220] flex w-[min(380px,calc(100vw-1.5rem))] flex-col gap-1.5"
      data-testid="banking-home-attention-strip"
      data-c51-home-attention="1"
      data-c65-alert-dock="1"
      aria-label="Banking Home attention"
    >
      {visible.map((row) => {
        const border = row.tone === "bad" ? "#B42318" : row.tone === "warn" ? "#B54708" : "#027A48";
        const bg = row.tone === "bad" ? "#FDECEA" : row.tone === "warn" ? "#FFFAEB" : "#ECFDF3";
        return (
          <div
            key={row.id}
            role="alert"
            className="pointer-events-auto animate-[slideInRight_180ms_ease-out] rounded-sm border border-[#E5E7EB] px-2.5 py-2 text-xs shadow-sm"
            style={{ borderLeft: `3px solid ${border}`, background: bg }}
            data-attention-id={row.id}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug text-[#0F1219]">{row.title}</p>
                <p className="mt-0.5 leading-snug text-[#6B7280]">{row.body}</p>
                {row.action ? (
                  <div className="mt-1.5">
                    <ActionButton onClick={row.action.onClick}>{row.action.label}</ActionButton>
                  </div>
                ) : null}
              </div>
              <button
                type="button"
                className="shrink-0 rounded-sm p-0.5 text-[#6B7280] hover:bg-black/5 hover:text-[#0F1219]"
                aria-label={`Dismiss ${row.title}`}
                data-testid={`attention-dismiss-${row.id}`}
                onClick={() => setDismissed((prev) => new Set(prev).add(row.id))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
      <style>{`@keyframes slideInRight{from{opacity:0;transform:translateX(12px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </aside>
  );
}
