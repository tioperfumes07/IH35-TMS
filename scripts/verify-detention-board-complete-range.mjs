#!/usr/bin/env node
/**
 * DET-MONEY-F6934-DETENTION-BOARD-SILENT-200-ACCRUAL-QUEUE
 *
 * The finding: listDetentionBoard capped at LIMIT 200, silently truncating the operational queue
 * and deriving count/active_count/live_accrued_amount_cents from the truncated page — a real
 * money-lane defect since accrued billable amounts sit on those excluded rows. Live-verified
 * (2026-08-29): the query already has NO LIMIT and count/active_count are computed from the full
 * fetched `events` array, not a capped subset. This guard locks that shape in place so a future
 * "just add pagination" change can't silently reintroduce a truncation without also fixing the
 * money-derived fields it feeds.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const serviceFile = path.join(root, "apps/backend/src/dispatch/detention.service.ts");
const pageFile = path.join(root, "apps/frontend/src/pages/dispatch/DetentionBoardPage.tsx");

function failures(service, page) {
  const found = [];
  // The listDetentionBoard function body (from its export to the next top-level export/EOF).
  const fnMatch = service.match(/export async function listDetentionBoard[\s\S]*?(?=\nexport (?:async )?function|\n$)/);
  const fn = fnMatch ? fnMatch[0] : "";
  if (!fn) {
    found.push("listDetentionBoard function not found");
    return found;
  }
  if (/LIMIT\s+\d+/i.test(fn)) found.push("detention board query still has a LIMIT cap");
  if (!fn.includes("WHERE de.operating_company_id = $1::uuid")) found.push("company scope missing");
  if (!fn.includes("de.status IN ('accruing', 'closed')")) found.push("operational status scope missing");
  if (/l\.status\s*(?:=|IN\s*\()/i.test(fn)) found.push("detention board must not be filtered by load status");
  if (!fn.includes("count: events.length")) found.push("count must be derived from the full events array, not a capped page");
  if (!fn.includes('active_count: events.filter((e) => e.status === "accruing").length'))
    found.push("active_count must be derived from the full events array, not a capped page");
  if (!fn.includes("live_accrued_amount_cents")) found.push("live_accrued_amount_cents must be computed for every returned row");
  if (!fn.includes('operational_state: row.status === "accruing" ? "active" : "complete"')) found.push("operational detention classification missing");
  if (!fn.includes('billing_state: row.status === "closed" ? "unbilled_receivable" : "estimated"')) found.push("unbilled receivable classification missing");
  for (const [kind, testProp] of [
    ["load", "event.load_number"],
    ["customer", "event.customer_name"],
    ["driver", "event.driver_name"],
    ["unit", "event.unit_number"],
  ]) {
    if (!page.includes(`kind="${kind}"`) || !page.includes(testProp)) found.push(`${kind} EntityLink missing on the board page`);
  }
  if (!page.includes("getDetentionBoard(companyId)")) found.push("board page must consume getDetentionBoard");
  if (!page.includes('label: "Detention status"') || !page.includes("operationalStateLabel(event.operational_state)")) found.push("operational detention column missing");
  if (!page.includes('label: "Customer balance"') || !page.includes("billingStateLabel(event.billing_state)")) found.push("customer receivable column missing");
  if (!page.includes('label: "Estimated / unbilled"')) found.push("amount column does not distinguish estimate from unbilled balance");
  return found;
}

if (process.argv.includes("--selftest")) {
  const service = fs.readFileSync(serviceFile, "utf8");
  const page = fs.readFileSync(pageFile, "utf8");
  const baseline = failures(service, page);
  if (baseline.length) {
    console.error(`SELFTEST FAIL: repository already red.\n${baseline.join("\n")}`);
    process.exit(1);
  }
  const mutations = [
    [service.replace("ORDER BY de.status ASC, de.started_at ASC", "ORDER BY de.status ASC, de.started_at ASC\n        LIMIT 200"), page],
    [service.replaceAll("WHERE de.operating_company_id = $1::uuid", "WHERE true"), page],
    [service.replace("count: events.length", "count: events.slice(0, 200).length"), page],
    [service.replace('active_count: events.filter((e) => e.status === "accruing").length', "active_count: 0"), page],
    [service, page.replace('kind="driver"', 'kind="removed"')],
    [service.replaceAll('operational_state: row.status === "accruing" ? "active" : "complete"', 'operational_state: "active"'), page],
    [service.replace('billing_state: row.status === "closed" ? "unbilled_receivable" : "estimated"', 'billing_state: "estimated"'), page],
    [service, page.replace('label: "Customer balance"', 'label: "Status"')],
    [service.replace("AND de.status IN ('accruing', 'closed')", "AND de.status IN ('accruing', 'closed')\n          AND l.status = 'in_transit'"), page],
  ];
  const missed = mutations.filter(([s, p]) => failures(s, p).length === 0);
  if (missed.length) {
    console.error(`SELFTEST FAIL: ${missed.length}/${mutations.length} planted regressions not caught`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: ${mutations.length}/${mutations.length} planted regressions caught`);
  process.exit(0);
}

const service = fs.readFileSync(serviceFile, "utf8");
const page = fs.readFileSync(pageFile, "utf8");
const found = failures(service, page);
if (found.length) {
  console.error(`FAIL: ${found.join("; ")}`);
  process.exit(1);
}
console.log("PASS: detention board query is unbounded and count/active_count/live_accrued_amount_cents derive from the complete result set");
