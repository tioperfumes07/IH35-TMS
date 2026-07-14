import { qboWriteDisabled } from "./qbo-write-disabled.js";

// QBO-WRITE-KILL — reconcile-only architecture lock. qboPostMasterJson was the single outbound funnel
// that POSTed masterdata / invoice / bill objects INTO QuickBooks. Under the parallel-books,
// reconcile-only architecture TMS never writes to QBO, so the outbound entity write is permanently
// removed here — the function hard-fails instead of issuing an HTTP POST. unwrapIntuitEntity (a pure
// response reader used by mirror/read code) is retained. Enforced by scripts/verify-no-qbo-write-path.mjs.
export async function qboPostMasterJson(
  operatingCompanyId: string,
  relativePath: string,
  _body: Record<string, unknown>,
  _operation: "create" | "update"
): Promise<Record<string, unknown>> {
  void operatingCompanyId;
  return qboWriteDisabled(`qbo_master_write:${relativePath}`);
}

export function unwrapIntuitEntity(response: Record<string, unknown>): Record<string, unknown> {
  const candidates = ["Vendor", "Customer", "Item", "Account"] as const;
  for (const key of candidates) {
    const row = response[key];
    if (row && typeof row === "object" && !Array.isArray(row)) return row as Record<string, unknown>;
  }
  return response;
}
