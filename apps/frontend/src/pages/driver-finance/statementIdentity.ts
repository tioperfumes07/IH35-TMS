/**
 * ROUND 8.17 board 35 — Settlement statement header / KPI identity.
 *
 * Prefer the driver settlement AlwaysTrack number (source_document_ref / settlement_number).
 * When that is null but the linked company settlement already carries an AlwaysTrack
 * display_id (tour readout company_settlement.display_id), show that — never leave the
 * Settlement KPI as a bare dash while the company statement link shows a real number.
 * Open / draft / ready_to_close without a number → PENDING (status from the detail reader).
 */
import { settlementNumber } from "../../lib/settlementNumber";

const ALWAYSTRACK_DOC_RE = /^\d{4,}$/;

export function statementIdentity(opts: {
  settlement: Record<string, unknown>;
  companyDisplayId?: string | null;
}): string | null {
  const fromDriver = settlementNumber(
    opts.settlement as {
      source_document_ref?: string | null;
      settlement_number?: string | null;
      status?: string | null;
      is_open?: boolean | null;
    },
  );
  if (fromDriver) return fromDriver;

  const company = String(opts.companyDisplayId ?? "").trim();
  if (ALWAYSTRACK_DOC_RE.test(company)) return company;

  const status = String(opts.settlement.status ?? "").toLowerCase();
  if (
    opts.settlement.is_open === true ||
    status === "open" ||
    status === "draft" ||
    status === "ready_to_close"
  ) {
    return "PENDING";
  }
  return null;
}
