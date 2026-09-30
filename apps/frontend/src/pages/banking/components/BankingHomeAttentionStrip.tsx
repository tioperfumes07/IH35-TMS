import { ActionButton } from "../../../components/shared/ActionButton";

export type BankingHomeAttentionFacts = {
  uncategorizedCount: number;
  transactionCount: number;
  reconciledAccountsCount: number;
  totalBankAccounts: number;
  unboundCashGlCount: number;
  qboConnected: boolean;
  escrowBalanceCents: number;
  escrowDriverCount: number;
};

type Props = {
  facts: BankingHomeAttentionFacts;
  onCategorize: () => void;
  onReconcile: () => void;
  onCashGl: () => void;
  onDriverEscrow: () => void;
};

/**
 * C-51 — Banking Home attention strip. Surfaces the buried live facts the owner named
 * (uncategorized backlog, never-reconciled accounts, unbound Cash GL, QBO not connected,
 * Driver Escrow liability pool) in ONE composition above the tiles — not buried in KPI gray.
 */
export function BankingHomeAttentionStrip({
  facts,
  onCategorize,
  onReconcile,
  onCashGl,
  onDriverEscrow,
}: Props) {
  const rows: Array<{
    id: string;
    tone: "bad" | "warn" | "good";
    title: string;
    body: string;
    action?: { label: string; onClick: () => void };
  }> = [];

  if (facts.transactionCount > 0 && facts.uncategorizedCount > 0) {
    rows.push({
      id: "uncategorized",
      tone: facts.uncategorizedCount / facts.transactionCount >= 0.5 ? "bad" : "warn",
      title: `${facts.uncategorizedCount.toLocaleString()} of ${facts.transactionCount.toLocaleString()} bank transactions still need Match or Categorize`,
      body: "This is the For-review backlog. Home must show it before any healthy zero.",
      action: { label: "Categorize now", onClick: onCategorize },
    });
  }

  if (facts.totalBankAccounts > 0 && facts.reconciledAccountsCount === 0) {
    rows.push({
      id: "never-reconciled",
      tone: "bad",
      title: `0 of ${facts.totalBankAccounts} bank accounts have ever been reconciled`,
      body: "Reconciliation is the books gate. Do not treat this screen as reconciled.",
      action: { label: "Start reconciliation", onClick: onReconcile },
    });
  } else if (facts.totalBankAccounts > 0 && facts.reconciledAccountsCount < facts.totalBankAccounts) {
    rows.push({
      id: "partial-reconciled",
      tone: "warn",
      title: `${facts.reconciledAccountsCount} of ${facts.totalBankAccounts} accounts ever reconciled`,
      body: "Finish the remaining accounts before treating cash as closed.",
      action: { label: "Open reconciliation", onClick: onReconcile },
    });
  }

  if (facts.unboundCashGlCount > 0 && facts.totalBankAccounts > 0) {
    rows.push({
      id: "cash-gl",
      tone: "bad",
      title: `Cash GL unbound on ${facts.unboundCashGlCount} of ${facts.totalBankAccounts} bank account(s)`,
      body: "An unbound account cannot post. Map Cash GL before Bank Register work.",
      action: { label: "Map Cash GL", onClick: onCashGl },
    });
  }

  if (!facts.qboConnected) {
    rows.push({
      id: "qbo",
      tone: "warn",
      title: "QuickBooks is not connected — last sync never",
      body: "Parallel books. Reconcile first. Do not connect or push until the feed is clean.",
    });
  }

  if (facts.escrowDriverCount > 0 || facts.escrowBalanceCents !== 0) {
    const dollars = (facts.escrowBalanceCents / 100).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
    });
    rows.push({
      id: "escrow",
      tone: "warn",
      title: `Driver Escrow liability pool ${dollars} across ${facts.escrowDriverCount} driver(s)`,
      body: "Escrow is a liability the company owes back — not an expense. Open the Driver Escrow register.",
      action: { label: "Driver Escrow", onClick: onDriverEscrow },
    });
  }

  if (rows.length === 0) return null;

  return (
    <section
      className="space-y-2 rounded-sm border border-[#E5E7EB] bg-white p-2"
      data-testid="banking-home-attention-strip"
      data-c51-home-attention="1"
      aria-label="Banking Home attention"
    >
      <p className="px-1 text-xs font-bold uppercase tracking-wide text-[#4B5563]">Needs attention</p>
      <ul className="space-y-2">
        {rows.map((row) => {
          const border = row.tone === "bad" ? "#B42318" : row.tone === "warn" ? "#B54708" : "#027A48";
          const bg = row.tone === "bad" ? "#fdecea" : row.tone === "warn" ? "#fffaeb" : "#ecfdf3";
          return (
            <li
              key={row.id}
              className="rounded-sm border border-[#E5E7EB] px-3 py-2 text-xs"
              style={{ borderLeft: `4px solid ${border}`, background: bg }}
              data-attention-id={row.id}
            >
              <p className="font-semibold text-[#0F1219]">{row.title}</p>
              <p className="mt-1 text-[#6B7280]">{row.body}</p>
              {row.action ? (
                <div className="mt-2">
                  <ActionButton onClick={row.action.onClick}>{row.action.label}</ActionButton>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
