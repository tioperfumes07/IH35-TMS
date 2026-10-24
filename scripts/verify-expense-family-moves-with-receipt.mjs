#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — engine guard (OWNER RULING 443.288-A expense family), not a surface wiring guard; claims no Built credit.
/**
 * verify-expense-family-moves-with-receipt — OWNER RULING 443.288-A (10-23-2026): "why are they on the wrong load, that
 * is the real issue that should be fixed so it does not happen again". A statement card credit / card difference is a
 * CHILD of its receipt and ALWAYS moves load with it; it never has its own load decision.
 *   1. both statement writers link the child to its receipt (parent_expense_id + spine role statement_card_difference_of)
 *      and never name the receipt's UUID in the memo;
 *   2. THE family move lives in the reclassify engine and moves child postings by reclassify (never an UPDATE of a posting
 *      amount), then the document follows;
 *   3. applyReclassifyOnClient runs the family move after every load reclassify (reclassify by load, moveFuelReceiptToLoad,
 *      fill-truck-and-load), and the child's own reclassify turns the follow off (no recursion);
 *   4. every other load-move path calls it: the first attach (attachFuelReceiptToLoad), the fill-truck document-only branch
 *      and the expense relink route;
 *   5. the migration adds the same-company FK and the backfill.
 * --selftest plants each regression and must see it refused.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-expense-family-moves-with-receipt";
const FILES = {
  writers: "apps/backend/src/fuel/dreamline-statement-import.service.ts",
  engine: "apps/backend/src/accounting/reclassify/reclassify.service.ts",
  attach: "apps/backend/src/fuel/fuel-receipt-repoint.service.ts",
  fill: "apps/backend/src/fuel/fill-truck-and-load.service.ts",
  relink: "apps/backend/src/accounting/expenses.routes.ts",
  migration: "db/migrations/202616220700_expense_family_parent_link.sql",
};
const read = () => Object.fromEntries(Object.entries(FILES).map(([k, p]) => [k, readFileSync(join(ROOT, p), "utf8")]));

function between(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return null;
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}

export function familyFailures(s) {
  const f = [];
  // 1. writers
  for (const fn of ["postStatementCardCreditAsExpense", "postStatementCostDifferenceAsExpense"]) {
    const body = between(s.writers, `export async function ${fn}(`, "\nexport async function ");
    if (!body) { f.push(`${fn} not found`); continue; }
    if (!/linkExpenseChildToParentInClientTx\([\s\S]{0,300}parentExpenseId: input\.expenseId[\s\S]{0,120}role: "statement_card_difference_of"/.test(body)) f.push(`${fn} must link the child to its receipt (parent_expense_id + statement_card_difference_of)`);
    if (/memo:\s*`[^`]*\$\{input\.expenseId\}/.test(body)) f.push(`${fn} memo names the receipt UUID — write the receipt number, link the record`);
  }
  // 2. the family move
  const fam = between(s.engine, "export async function moveExpenseFamilyToLoad(", "\nasync function parentsMovedByBatch(");
  if (!fam) f.push("moveExpenseFamilyToLoad not found in the reclassify engine");
  else {
    if (!/c\.parent_expense_id = ANY\(\$2::uuid\[\]\) AND c\.voided_at IS NULL/.test(fam)) f.push("the family move must select every live child of the parents");
    if (!/applyReclassifyOnClient\(client, \{[\s\S]{0,400}to_load_id: input\.toLoadId[\s\S]{0,300}family_follow: false/.test(fam)) f.push("child postings must move by THE reclassify engine with the follow turned off");
    if (!/throw new Error\(`expense_family_child_refused/.test(fam)) f.push("a refused child line must throw (the receipt never moves without its children)");
    // 443.288-B: each child moves through THE one document move (moveExpenseDocumentToLoad); its header follows there.
    if (!/for \(const child of children\) \{\s*await moveExpenseDocumentToLoad\(client, \{/.test(fam)) f.push("every child must move through moveExpenseDocumentToLoad");
    const doc = between(s.engine, "export async function moveExpenseDocumentToLoad(", "\n/** The receipts");
    if (!doc || !/UPDATE accounting\.expenses SET load_id = \$3::uuid, expense_number = \$4/.test(doc)) f.push("the child document header must follow the load");
    if (/UPDATE accounting\.journal_entry_postings/.test(fam)) f.push("the family move must never UPDATE a posting (reclassify only)");
  }
  const link = between(s.engine, "export async function linkExpenseChildToParentInClientTx(", "\nexport async function moveExpenseFamilyToLoad(");
  if (!link || !/relationship_role: input\.role/.test(link) || !/linked_object_type: "expense"/.test(link)) f.push("the parent link must write the spine role on every child posting");
  // 3. the engine hook
  const apply = between(s.engine, "export async function applyReclassifyOnClient(", "\nexport async function ");
  if (!apply || !/if \(target\.to_load_id && input\.family_follow !== false\) \{[\s\S]{0,300}moveExpenseFamilyToLoad\(client,/.test(apply)) f.push("applyReclassifyOnClient must move the family after every load reclassify");
  // 4. the other load-move paths
  if (!/moveExpenseFamilyToLoad\(client as never, \{[\s\S]{0,120}parentExpenseIds: \[doc\.id\], toLoadId: loadId/.test(s.attach)) f.push("attachFuelReceiptToLoad must bring the receipt's children");
  if (!/moveExpenseFamilyToLoad\(client as never, \{[\s\S]{0,160}parentExpenseIds: parents, toLoadId: input\.toLoadId/.test(s.fill)) f.push("fill-truck-and-load (document-only branch) must bring the receipt's children");
  if (!/moveExpenseFamilyToLoad\(client as never, \{[\s\S]{0,200}parentExpenseIds: \[params\.data\.expenseId\][\s\S]{0,40}toLoadId: body\.new_load_id/.test(s.relink)) f.push("the expense relink route must bring the expense's children");
  // 5. migration
  if (!/FOREIGN KEY \(operating_company_id, parent_expense_id\)\s+REFERENCES accounting\.expenses \(operating_company_id, id\)/.test(s.migration)) f.push("parent_expense_id must be a same-company FK");
  if (!/'statement_card_difference_of'/.test(s.migration) || !/HAVING count\(DISTINCT parent_id\) = 1/.test(s.migration)) f.push("the backfill must link only a single unambiguous parent and write the spine role");
  return f;
}

const sources = read();
if (process.argv.includes("--selftest")) {
  const base = familyFailures(sources);
  if (base.length) { console.error(`${LABEL} --selftest FAIL — real tree not clean: ${base.join("; ")}`); process.exit(1); }
  const plants = [
    ["card credit not linked", { writers: sources.writers.replace('parentExpenseId: input.expenseId, journalEntryId: je, role: "statement_card_difference_of"', 'parentExpenseId: input.expenseId, journalEntryId: je, role: "x"') }],
    ["cost difference not linked", { writers: sources.writers.replace(/(export async function postStatementCostDifferenceAsExpense\([\s\S]*?)await linkExpenseChildToParentInClientTx\(/, "$1await noLink(") }],
    ["receipt UUID back in the memo", { writers: sources.writers.replace("card discount $${(cents / 100).toFixed(2)} on ${receiptLabel}", "card discount on receipt ${input.expenseId}") }],
    ["children moved without reclassify", { engine: sources.engine.replace("const batch = await applyReclassifyOnClient(client, {\n      operating_company_id: input.operatingCompanyId, posting_ids: legs", "const batch = await noReclassify(client, {\n      operating_company_id: input.operatingCompanyId, posting_ids: legs") }],
    ["children moved without the one document move", { engine: sources.engine.replace("for (const child of children) {\n    await moveExpenseDocumentToLoad(client, {", "for (const child of children) {\n    await noMove(client, {") }],
    ["follow recursion", { engine: sources.engine.replace(" family_follow: false,\n    }, { userId: input.actorUserId", "\n    }, { userId: input.actorUserId") }],
    ["refused child swallowed", { engine: sources.engine.replace("throw new Error(`expense_family_child_refused", "console.warn(`expense_family_child_refused") }],
    ["child header left behind", { engine: sources.engine.replace(/(export async function moveExpenseDocumentToLoad\([\s\S]*?)UPDATE accounting\.expenses SET load_id = \$3::uuid, expense_number = \$4/, "$1SELECT 1 /* header left behind */") }],
    ["engine hook removed", { engine: sources.engine.replace("if (target.to_load_id && input.family_follow !== false) {", "if (false) {") }],
    ["attach leaves children", { attach: sources.attach.replace("parentExpenseIds: [doc.id], toLoadId: loadId", "parentExpenseIds: [], toLoadId: loadId") }],
    ["fill-truck leaves children", { fill: sources.fill.replace("await moveExpenseFamilyToLoad(client as never, {\n          operatingCompanyId: input.companyId", "await noop(client as never, {\n          operatingCompanyId: input.companyId") }],
    ["relink leaves children", { relink: sources.relink.replace("parentExpenseIds: [params.data.expenseId]", "parentExpenseIds: []") }],
    ["FK not same-company", { migration: sources.migration.replace("FOREIGN KEY (operating_company_id, parent_expense_id)\n      REFERENCES accounting.expenses (operating_company_id, id)", "FOREIGN KEY (parent_expense_id)\n      REFERENCES accounting.expenses (id)") }],
    ["backfill guesses an ambiguous parent", { migration: sources.migration.replace("HAVING count(DISTINCT parent_id) = 1", "HAVING count(DISTINCT parent_id) >= 1") }],
  ];
  for (const [name, patch] of plants) {
    const mutated = { ...sources, ...patch };
    if (Object.keys(patch).every((k) => mutated[k] === sources[k])) { console.error(`${LABEL} --selftest FAIL — plant did not apply: ${name}`); process.exit(1); }
    if (familyFailures(mutated).length === 0) { console.error(`${LABEL} --selftest FAIL — plant escaped: ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} --selftest PASS (${plants.length}/${plants.length} plants caught; real tree clean)`);
  process.exit(0);
}
const failures = familyFailures(sources);
if (failures.length) {
  for (const x of failures) console.error(`FAIL ${LABEL}: ${x}`);
  process.exit(1);
}
console.log(`PASS ${LABEL}`);
