// ACCT-F4431380 (Lead 443.137 item 9e) — QuickBooks is a READ-ONLY ARCHIVE.
//
// Owner ruling: USMCA is entirely the TMS ERP; TRANSPORTATION and TRUCKING are frozen QuickBooks
// mirrors. A QBO puller / reconciler / bootstrap may write ONLY its own inbound mirror or staging
// table (mdata.qbo_*, qbo.*, qbo_sync.*, integrations.qbo_*). It may never INSERT/UPDATE a native
// money table (accounting.bills / bill_lines / bill_payments / invoices / invoice_lines / payments /
// payment_applications / expenses / expense_lines / vendor_credits / journal_entries / postings) or a
// native master table (catalogs.accounts / catalogs.items / mdata.customers / mdata.vendors).
//
// Every former QBO -> native projection or reconcile entry point now throws this error. It REFUSES BY
// NAME rather than returning an "enabled:false / 0 rows" result, because a caller that reports success
// on a projection that silently did nothing is exactly how a dead path hides (the flag block in
// migration 202614530000 already made these no-ops; this makes the refusal explicit and removes the
// SQL so it cannot be re-armed by a flag flip). Guard: scripts/verify-qbo-paths-never-write-native-tables.mjs.

export const QBO_NATIVE_WRITE_REFUSED = "QBO_NATIVE_WRITE_REFUSED" as const;

export class QboNativeWriteRefusedError extends Error {
  readonly code = QBO_NATIVE_WRITE_REFUSED;
  readonly site: string;
  readonly nativeTables: readonly string[];
  readonly operatingCompanyId: string | null;

  constructor(input: { site: string; nativeTables: readonly string[]; operatingCompanyId?: string | null }) {
    super(
      `${QBO_NATIVE_WRITE_REFUSED}: ${input.site} would write native table(s) ${input.nativeTables.join(", ")} ` +
        `from QuickBooks. QuickBooks is a read-only archive (owner ruling; Lead 443.137 item 9e) — ` +
        `QBO paths write only their mirror tables. Create native records through the TMS service layer.`
    );
    this.name = "QboNativeWriteRefusedError";
    this.site = input.site;
    this.nativeTables = input.nativeTables;
    this.operatingCompanyId = input.operatingCompanyId ?? null;
  }
}

export function isQboNativeWriteRefusedError(error: unknown): error is QboNativeWriteRefusedError {
  return (
    error instanceof QboNativeWriteRefusedError ||
    (typeof error === "object" && error !== null && (error as { code?: unknown }).code === QBO_NATIVE_WRITE_REFUSED)
  );
}

/** Throw the named refusal. Typed `never` so a former projection body can be replaced by one call. */
export function refuseQboNativeWrite(site: string, nativeTables: readonly string[], operatingCompanyId?: string | null): never {
  throw new QboNativeWriteRefusedError({ site, nativeTables, operatingCompanyId });
}
