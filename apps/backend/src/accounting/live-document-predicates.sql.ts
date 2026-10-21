/** ROUND 443.213: one live-document vocabulary. Caller must bind company scope.
 * History/audit readers deliberately do not use live-only predicates.
 */
function sqlAlias(alias: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) throw new Error("invalid SQL alias");
  return alias;
}

export function liveSettlement(alias: string): string {
  const a = sqlAlias(alias);
  return `(${a}.status NOT IN ('cancelled', 'void', 'voided') AND ${a}.voided_at IS NULL AND ${a}.reversed_at IS NULL)`;
}

export function liveDriverBill(alias: string): string {
  const a = sqlAlias(alias);
  return `(${a}.status NOT IN ('void', 'voided') AND ${a}.voided_at IS NULL)`;
}

export function liveExpense(alias: string): string {
  const a = sqlAlias(alias);
  return `(${a}.status NOT IN ('void', 'voided') AND ${a}.voided_at IS NULL)`;
}

export function liveBill(alias: string): string {
  const a = sqlAlias(alias);
  return `(${a}.status NOT IN ('void', 'voided') AND ${a}.voided_at IS NULL AND ${a}.revoked_at IS NULL)`;
}

/** Bill lines have a void timestamp, but no document status. */
export function liveBillLine(alias: string): string {
  return `${sqlAlias(alias)}.voided_at IS NULL`;
}

export function activeSettlementLine(line: string, settlement: string): string {
  const sl = sqlAlias(line);
  return `(${sl}.is_active = true AND ${sl}.voided_at IS NULL AND ${liveSettlement(settlement)})`;
}

export function driverBillHasActiveSettlement(alias: string): string {
  const db = sqlAlias(alias);
  return `EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
    JOIN driver_finance.driver_settlements ds
      ON ds.id = sl.settlement_id AND ds.operating_company_id = ${db}.operating_company_id
    WHERE sl.source_driver_bill_id = ${db}.id
      AND sl.operating_company_id = ${db}.operating_company_id
      AND ${activeSettlementLine("sl", "ds")})`;
}

/** Open obligation, independent of due-date bucketing or duplicate A/P presentation.
 * Cash-flow additionally excludes accrued_bill_id when that A/P document is already shown.
 */
export function openDriverBill(alias: string): string {
  const a = sqlAlias(alias);
  return `(${liveDriverBill(a)} AND ${a}.status = 'open' AND NOT ${driverBillHasActiveSettlement(a)})`;
}
