#!/usr/bin/env node
/**
 * UI4 (LEAD 11-03) — register rows 241 / 244 / 247 / 252.
 *  D065 Manual JE Step 2: header + rows share ONE minmax(0,…) grid template constant with shrinkable items;
 *       Account/Class ReferenceSelect MUST pass size="sm" so Combobox drops FILTER min-w-[10rem] (live Class/Debit overlap).
 *  D068 Bill detail Journal Entity column: the reader returns the party NAME (postingPartyNameSql, same-company,
 *       vendor/driver/customer) and PostingGrid renders it via entityLabel — never the uuid.
 *  D071 Match candidate payee: people (server counterparty_is_person) via formatPersonName, organisations as stored.
 *  D076 Escrow holder label: same-company name first (resolve_driver_label_same_company), then the merge survivor
 *       in the escrow's company, then the raw holder row — never "Driver — not visible" for a holder that exists.
 * Static. --selftest plants each defect back in memory.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ui4-d065-d068-d071-d076";
const FILES = {
  je: "apps/frontend/src/components/accounting/ManualJEModal.tsx",
  grid: "apps/frontend/src/components/accounting/PostingGrid.tsx",
  party: "apps/backend/src/accounting/posting-party.sql.ts",
  jeSvc: "apps/backend/src/accounting/journal-entries.service.ts",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
  person: "apps/backend/src/banking/match-candidate-person-payee.ts",
  escrow: "apps/backend/src/accounting/escrow/service.ts",
};
const TEMPLATE = "grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)]";

export function findDefects(s) {
  const out = [];
  // D065
  if (!s.je.includes(`MANUAL_JE_LINE_GRID_TEMPLATE =\n  "${TEMPLATE}"`)) out.push("D065: MANUAL_JE_LINE_GRID_TEMPLATE is not the fixed minmax(0,…) 5-track template");
  if (!/MANUAL_JE_LINE_GRID_CLASS = `grid min-w-0 \$\{MANUAL_JE_LINE_GRID_TEMPLATE\} gap-1 \[&>\*\]:min-w-0`/.test(s.je)) out.push("D065: line grid class lost min-w-0 / [&>*]:min-w-0");
  if ((s.je.match(/\$\{MANUAL_JE_LINE_GRID_CLASS\}/g) ?? []).length < 2) out.push("D065: header and rows do not both use MANUAL_JE_LINE_GRID_CLASS");
  if (/grid-cols-\[[^\]]*\]/.test(s.je.replace(TEMPLATE, "")) || /grid-cols-\d/.test(s.je)) out.push("D065: a second (drifting) grid-cols template exists in ManualJEModal");
  // Live Class→Debit overlap: default Combobox size=md carries min-w-[10rem] (~142px). Both Step 2
  // ReferenceSelects must opt into size="sm" (form field, no min-width) so the picker can shrink.
  const jeRefSelects = s.je.match(/<ReferenceSelect[\s\S]*?\/>/g) ?? [];
  if (jeRefSelects.length < 2) out.push("D065: Manual JE Step 2 must render Account + Class ReferenceSelect");
  for (const tag of jeRefSelects) {
    if (!/\bsize="sm"/.test(tag)) out.push("D065: Manual JE ReferenceSelect missing size=\"sm\" (FILTER min-w-[10rem] overlaps Debit)");
  }
  // D068
  for (const kind of ["vendor", "driver", "customer"]) {
    if (!new RegExp(`WHEN '${kind}' THEN \\(SELECT`).test(s.party)) out.push(`D068: postingPartyNameSql does not resolve ${kind} names`);
  }
  if ((s.jeSvc.match(/postingPartyNameSql\("p"\)\} AS entity_name/g) ?? []).length < 2) out.push("D068: journal readers do not select entity_name");
  if (!/entityLabel\(p\.entity_name, p\.entity_uuid,/.test(s.grid)) out.push("D068: PostingGrid Entity column does not render via entityLabel(entity_name, …)");
  if (/render: \(p\) =>\s*p\.entity_uuid\s*[,}]/.test(s.grid)) out.push("D068: PostingGrid renders the raw entity_uuid");
  // D071
  if (!/return c\.counterparty_is_person \? formatPersonName\(name\) : name;/.test(s.drawer)) out.push("D071: payee label does not gate formatPersonName on counterparty_is_person");
  if (/formatPersonName\(c\.counterparty_name\)/.test(s.drawer)) out.push("D071: MatchDrawer person-cases every payee (organisations included)");
  if (!/Payee: \{matchCandidatePayeeLabel\(c\)\}/.test(s.drawer)) out.push("D071: candidate row does not use matchCandidatePayeeLabel");
  if (!/applyCounterpartyPersonFlag\(result\.candidates, personIds\)/.test(s.route)) out.push("D071: match-candidates route does not stamp counterparty_is_person");
  if (!/v\.operating_company_id = \$1::uuid/.test(s.person) || !/v\.driver_id IS NOT NULL/.test(s.person)) out.push("D071: person resolver is not same-company driver-payee based");
  // D076
  const list = s.escrow.slice(s.escrow.indexOf("export async function listEscrowAccounts("));
  const listBody = list.slice(0, list.indexOf("\nexport ", 10));
  if (!/mdata\.resolve_driver_label_same_company\(ea\.holder_id, ea\.operating_company_id\)/.test(listBody)) out.push("D076: escrow holder label does not try the same-company resolver first");
  if (!/LEFT JOIN mdata\.drivers ds\s+ON ds\.id = d\.merged_into_driver_id\s+AND ds\.operating_company_id = ea\.operating_company_id/.test(listBody)) out.push("D076: escrow holder label does not follow the merge survivor in the escrow's company");
  if (!/COALESCE\(d\.first_name, ''\) \|\| ' ' \|\| COALESCE\(d\.last_name, ''\)/.test(listBody)) out.push("D076: escrow holder label lost the raw holder-row fallback");
  return out;
}

const load = () => Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
const s = load();
if (process.argv.includes("--selftest")) {
  const plant = (key, from, to) => ({ ...s, [key]: s[key].replace(from, to) });
  const plants = [
    ["D065 bare 1fr tracks", plant("je", TEMPLATE, "grid-cols-[2fr_1.3fr_1fr_1fr_1.6fr]")],
    ["D065 items cannot shrink", plant("je", "gap-1 [&>*]:min-w-0`", "gap-1`")],
    ["D065 rows drift to grid-cols-6", plant("je", "className={`${MANUAL_JE_LINE_GRID_CLASS} rounded-sm", "className={`grid grid-cols-6 rounded-sm")],
    ["D065 picker loses size=sm", plant("je", 'placeholder="Class"\n                    size="sm"', 'placeholder="Class"\n                    size="md"')],
    ["D068 driver name dropped", plant("party", "WHEN 'driver' THEN (SELECT", "WHEN 'driverx' THEN (SELECT")],
    ["D068 grid prints uuid", plant("grid", /p\.entity_uuid\n\s+\? entityLabel\(p\.entity_name, p\.entity_uuid,[^\n]*\n\s+: "—",/, 'p.entity_uuid,')],
    ["D071 all payees person-cased", plant("drawer", "<span data-testid=\"match-candidate-payee\">Payee: {matchCandidatePayeeLabel(c)}</span>", "<span data-testid=\"match-candidate-payee\">Payee: {formatPersonName(c.counterparty_name)}</span>")],
    ["D071 route does not flag persons", plant("route", "applyCounterpartyPersonFlag(result.candidates, personIds)", "result.candidates")],
    ["D076 survivor join removed", plant("escrow", /LEFT JOIN mdata\.drivers ds\s+ON ds\.id = d\.merged_into_driver_id\s+AND ds\.operating_company_id = ea\.operating_company_id/, "")],
    ["D076 same-company resolver removed", plant("escrow", "mdata.resolve_driver_label_same_company(ea.holder_id, ea.operating_company_id),", "")],
  ];
  let caught = 0;
  for (const [name, planted] of plants) {
    const changed = Object.keys(FILES).some((k) => planted[k] !== s[k]);
    const hit = changed && findDefects(planted).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught`);
  process.exit(caught === plants.length ? 0 : 1);
}
const defects = findDefects(s);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — D065 fixed line grid · D068 party names · D071 person-only casing · D076 same-company/survivor holder names`);
