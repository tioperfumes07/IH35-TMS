import type { ReactNode } from "react";
import type { PlaidBankAccount } from "../../../api/banking";
import { derivePlaidConnectionBadgeClasses, derivePlaidConnectionBadgeLabel, latestPlaidLastSyncedAtMs } from "./plaid-item-display";

type Props = {
  institution: string;
  accounts: PlaidBankAccount[];
  actions?: ReactNode;
  nowMs?: number;
};

export function PlaidItemCard({ institution, accounts, actions, nowMs }: Props) {
  const badgeLabel = derivePlaidConnectionBadgeLabel(accounts, nowMs);
  const badgeClass = derivePlaidConnectionBadgeClasses(badgeLabel);
  const lastSyncMs = latestPlaidLastSyncedAtMs(accounts);

  return (
    <div className="rounded border border-gray-100 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 gap-2">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-gray-100 text-xs font-bold text-gray-700"
            aria-hidden
          >
            {institution.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900">{institution}</p>
            <p className="text-xs text-gray-500">Last sync: {lastSyncMs ? new Date(lastSyncMs).toLocaleString() : "—"}</p>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>{badgeLabel}</span>
          {actions}
        </div>
      </div>
    </div>
  );
}
