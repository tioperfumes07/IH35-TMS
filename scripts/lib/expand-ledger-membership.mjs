/**
 * ACCT-F2026100601 moved the ledger-membership rule (not voided · not sample · batch posted/reversed) out of each
 * statement reader into ONE file, apps/backend/src/accounting/ledger-membership.ts, interpolated as
 * ${LEDGER_POSTING_COUNTS_SQL}. Guards that check a reader's SQL for those clauses must check the SQL the reader
 * actually RUNS: this expands the import into the rule's real text, read from the rule file itself (default aliases
 * je / p / pb), so every existing clause check still applies — and still fails if the rule file loses a clause.
 * A reader that does not import the rule is returned unchanged (it must then carry the clauses itself).
 */
import fs from "node:fs";
import path from "node:path";

export const LEDGER_MEMBERSHIP_REL = "apps/backend/src/accounting/ledger-membership.ts";

export function ledgerMembershipRuleText(root = process.cwd()) {
  const src = fs.readFileSync(path.join(root, LEDGER_MEMBERSHIP_REL), "utf8");
  const tpl = src.match(/export function ledgerPostingCountsSql[\s\S]*?return `([^`]*)`;/)?.[1];
  if (!tpl) throw new Error(`${LEDGER_MEMBERSHIP_REL}: ledgerPostingCountsSql return template not found`);
  return tpl.replaceAll("${je}", "je").replaceAll("${p}", "p").replaceAll("${pb}", "pb");
}

export function expandLedgerMembership(serviceSource, root = process.cwd()) {
  const src = String(serviceSource ?? "");
  if (!/import \{[^}]*\bLEDGER_POSTING_COUNTS_SQL\b[^}]*\} from "\.\/ledger-membership\.js"/.test(src)) return src;
  return src.replaceAll("${LEDGER_POSTING_COUNTS_SQL}", ledgerMembershipRuleText(root));
}
