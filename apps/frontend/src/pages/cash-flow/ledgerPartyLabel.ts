import type { RollingLedgerRow } from "../../api/cashFlow";
import { formatCompanyName } from "../../lib/formatCompanyName";
import { formatPersonName } from "../../lib/formatPersonName";

/**
 * Row 219 (live 11-03) — the cash-flow ledger printed the raw payee ("Refrigerx Transportation Llc",
 * "Trident Transport, Llc") while Customers printed "LLC": cash-flow had no casing path at all. Every cash-flow
 * party now goes through the ONE org casing function (formatCompanyName) or, for drivers, formatPersonName.
 * Bank / card / loan account names and synthetic labels ("Fuel (4-wk avg)", "Relay") render as given.
 * Display only — sort / search keep the raw counterparty.
 */
const PERSON_KINDS = new Set<RollingLedgerRow["document_kind"]>(["driver_bill", "settlement"]);
const ORG_KINDS = new Set<RollingLedgerRow["document_kind"]>(["bill", "expense", "invoice", "factoring_advance", "load"]);

export function ledgerPartyLabel(
  row: Pick<RollingLedgerRow, "document_kind" | "counterparty" | "document_id"> & { type?: string },
): string {
  const raw = String(row.counterparty ?? "").trim();
  if (!raw) return "";
  if (/^fuel-avg-/.test(String(row.document_id ?? ""))) return raw;
  if (PERSON_KINDS.has(row.document_kind) || /driver/i.test(String(row.type ?? ""))) return formatPersonName(raw);
  if (!ORG_KINDS.has(row.document_kind)) return raw;
  // factoring: "ACME FREIGHT LLC +2 more" — case the name, keep the count tail as built
  const tail = / \+\d+ more$/.exec(raw);
  return tail ? `${formatCompanyName(raw.slice(0, tail.index))}${tail[0]}` : formatCompanyName(raw);
}
