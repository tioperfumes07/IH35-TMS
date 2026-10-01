import { ActionButton } from "../../../components/shared/ActionButton";
import { formatUsd } from "../../../lib/money";

type Props = {
  reconciledAccountsCount: number;
  totalBankAccounts: number;
  differenceCents: number | null;
  onStart: () => void;
};

/**
 * C-64 — Reconciliation card on Banking Home: big figure, progress bar, one primary button.
 */
export function BankingReconHomeCard({
  reconciledAccountsCount,
  totalBankAccounts,
  differenceCents,
  onStart,
}: Props) {
  const pct =
    totalBankAccounts > 0
      ? Math.round((reconciledAccountsCount / totalBankAccounts) * 100)
      : 0;
  const differenceLabel =
    differenceCents == null ? "—" : formatUsd(differenceCents / 100);
  const figure =
    totalBankAccounts === 0
      ? "—"
      : `${reconciledAccountsCount} of ${totalBankAccounts}`;

  return (
    <section
      className="rounded-sm border border-[#E5E7EB] bg-white p-3"
      data-testid="banking-recon-home-card"
      data-c64-recon-card="1"
    >
      <p className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Reconciliation</p>
      <p
        className="mt-2 text-center font-semibold tabular-nums text-[#0F1219]"
        style={{ fontSize: 22 }}
        data-testid="banking-recon-home-figure"
      >
        {figure}
      </p>
      <p className="text-center text-xs text-[#6B7280]">accounts ever reconciled</p>
      <div className="mt-3 h-2 w-full overflow-hidden rounded-sm bg-[#E5E7EB]" aria-hidden="true">
        <div
          className="h-full rounded-sm bg-[#14314F] transition-[width]"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-[#6B7280]">
        <span>{pct}%</span>
        <span>
          Difference{" "}
          <span className="font-medium tabular-nums text-[#0F1219]">{differenceLabel}</span>
        </span>
      </div>
      <div className="mt-3 flex justify-center">
        <ActionButton onClick={onStart} data-testid="banking-recon-home-start">
          Start reconciliation
        </ActionButton>
      </div>
    </section>
  );
}
