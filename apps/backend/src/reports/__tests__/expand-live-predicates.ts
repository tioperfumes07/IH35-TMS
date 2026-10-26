/**
 * Source-text scope tests read the service file. Since FINAL-4 (verify-live-document-predicates-single-source)
 * the void / status exclusions are spelled through the canonical predicate module, so the test expands each
 * helper call into the exact SQL it emits and asserts against THAT — the effective query, not a spelling.
 */
import * as predicates from "../../accounting/live-document-predicates.sql.js";

const HELPERS: Record<string, (alias?: string) => string> = {
  notVoided: (a) => predicates.notVoided(a),
  liveInvoice: (a) => predicates.liveInvoice(String(a)),
  issuedInvoice: (a) => predicates.issuedInvoice(String(a)),
  postedBillStatus: (a) => predicates.postedBillStatus(String(a)),
  liveSettlement: (a) => predicates.liveSettlement(String(a)),
};

export function expandLivePredicates(src: string): string {
  return src.replace(
    /(\$\{)?\b(notVoided|liveInvoice|issuedInvoice|postedBillStatus|liveSettlement)\(\s*(?:"([A-Za-z_][A-Za-z0-9_]*)")?\s*\)(\})?/g,
    (_m, _open, fn: string, alias: string | undefined) => HELPERS[fn](alias),
  );
}
