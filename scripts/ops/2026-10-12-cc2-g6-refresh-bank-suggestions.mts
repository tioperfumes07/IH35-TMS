// LEAD 443.78 G6 / 443.80 #3 — banking READY TO MATCH, READ ONLY (Owner Law B: "it suggests and we accept it or change the
// transactions" — nothing is written). For the Relay Fuel Wallet, the Dreamline Diesel Card and USMCA FREIGHT (BofA): every
// unmatched line's SUGGESTED document from suggestBankMatches (the Match drawer's own findCandidates, ranked per 443.80 #3).
// Per account: lines / one suggested document / several (all shown, none preselected) / none + reason; --tsv lists every line.
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-12-cc2-g6-refresh-bank-suggestions.mts [--tsv=<path>]
import fs from "node:fs";
import { suggestBankMatches } from "../../apps/backend/src/accounting/bank-recon/match.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const ACCOUNTS: Array<[string, string]> = [
  ["Relay Fuel Wallet", "809fcfbb-738e-471c-8fc1-a38f0f9b814a"],
  ["Dreamline Diesel Card", "f1839d0c-04ea-425b-b942-d0de1c4447a9"],
  ["USMCA FREIGHT (BofA)", "e83028a5-dcda-4233-b660-5b9923b3d39c"],
];
const tsv = (process.argv.find((a) => a.startsWith("--tsv=")) ?? "").slice(6);
const only = (process.argv.find((a) => a.startsWith("--account=")) ?? "").slice(10);
const rows: string[] = ["account\tbank_transaction_id\toutcome\treason_or_documents"];
for (const [name, id] of ACCOUNTS.filter(([n]) => !only || n.toLowerCase().includes(only.toLowerCase()))) {
  const t0 = Date.now();
  const out = await suggestBankMatches({ operating_company_id: USMCA, bank_account_id: id });
  const reasons: Record<string, number> = {};
  for (const o of out.outcomes) {
    if (o.result === "none") { reasons[o.reason] = (reasons[o.reason] ?? 0) + 1; rows.push([name, o.bank_transaction_id, "none", o.reason + ((o as { detail?: string }).detail ? ` ${(o as { detail?: string }).detail}` : "")].join("\t")); }
    else if (o.result === "several") rows.push([name, o.bank_transaction_id, "several", o.documents.join(",")].join("\t"));
    else if (o.result === "suggested") rows.push([name, o.bank_transaction_id, "suggested", `${o.ledger_entry_kind}:${o.ledger_entry_id} ${o.reference ?? ""}${o.variance_cents ? ` variance ${o.variance_cents}` : ""}`].join("\t"));
    else if (o.result === "group") rows.push([name, o.bank_transaction_id, "group", `${o.reference ?? ""} = ${o.members.join("+")}${o.variance_cents ? ` variance ${o.variance_cents}` : ""}`].join("\t"));
  }
  const several = out.outcomes.filter((o) => o.result === "several").length;
  const group = out.outcomes.filter((o) => o.result === "group").length;
  const already = out.outcomes.filter((o) => o.result === "already_suggested_or_matched").length;
  console.log(`${name}: ${out.lines} lines — one suggestion ${out.suggested}, group suggestion ${group}, several ${several}, already matched ${already}, none ${JSON.stringify(reasons)} (${Math.round((Date.now() - t0) / 1000)}s)`);
}
if (tsv) { fs.writeFileSync(tsv, rows.join("\n") + "\n"); console.log(`tsv -> ${tsv}`); }
process.exit(0);
