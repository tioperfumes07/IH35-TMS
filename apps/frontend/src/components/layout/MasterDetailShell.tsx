import type { ReactNode } from "react";
import { MASTER_DETAIL } from "../../design/master-detail";

type Props = {
  master: ReactNode;
  detail: ReactNode;
  /** Optional override class on the outer shell. */
  className?: string;
  testId?: string;
};

/**
 * C-16 / C-17 — one master-detail shell for Customers, Vendors, Drivers.
 * Split widths come from MASTER_DETAIL tokens (not per-page magic numbers).
 */
export function MasterDetailShell({ master, detail, className = "", testId }: Props) {
  return (
    <div
      className={`${MASTER_DETAIL.shellClass} ${className}`.trim()}
      data-testid={testId ?? "master-detail-shell"}
      data-master-detail-shell="true"
    >
      {master}
      <div className={MASTER_DETAIL.detailPaneClass} data-master-detail-detail="true">
        {detail}
      </div>
    </div>
  );
}
