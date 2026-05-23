export class CashBasisSnapshotMissingError extends Error {
  readonly periodId: string;
  constructor(periodId: string) {
    super("cash_basis_snapshot_missing");
    this.periodId = periodId;
  }
}

export async function resolveCashBasisRead<T>(input: {
  basis: "accrual" | "cash";
  closedPeriodId: string | null;
  snapshotPayload: Record<string, unknown> | null;
  reportKey: "balance_sheet" | "trial_balance" | "profit_loss";
  computeLiveCash: () => Promise<T>;
}): Promise<{ source: "snapshot" | "live"; report: T }> {
  if (input.basis !== "cash") {
    return { source: "live", report: await input.computeLiveCash() };
  }
  if (input.closedPeriodId) {
    const reports = ((input.snapshotPayload?.reports as Record<string, unknown> | undefined) ?? {}) as Record<string, unknown>;
    const snapshot = reports[input.reportKey];
    if (!snapshot) throw new CashBasisSnapshotMissingError(input.closedPeriodId);
    return { source: "snapshot", report: snapshot as T };
  }
  return { source: "live", report: await input.computeLiveCash() };
}
