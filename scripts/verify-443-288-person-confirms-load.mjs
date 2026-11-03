#!/usr/bin/env node
// MATRIX-BUILT-OPTIONAL — engine guard (OWNER RULING 443.288 / LEAD register row 102), not a surface wiring guard; claims no Built credit.
/**
 * verify-443-288-person-confirms-load — OWNER RULING 443.288 (10-23-2026 7:59 PM CT): "when setting on a load an expense,
 * the dispatcher or closer whatever must confirm them. always. i dont want to rely in a system that constantly fails."
 * Register row 102 (11-03). Four invariants, pinned in source; --selftest plants each defect back and must see it refused.
 *
 *  (a) a child expense follows its parent's load — the confirm engine refuses a child (CHILD_FOLLOWS_ITS_RECEIPT), confirms
 *      children only together with their receipt, and ALWAYS runs THE family move for the confirmed load (row 102 fix: a
 *      child that drifted was left behind when the receipt was confirmed in place — prod 11-03: 11 such children).
 *  (b) no machine marks a load 'confirmed' — the database trigger makes every load write 'proposed' unless the transaction
 *      names a person; ONE module (expense-load-confirm-actor.ts) sets that actor and refuses the background-job actor by
 *      name (MACHINE_CANNOT_CONFIRM_LOAD, row 102 fix); no other source sets it or writes load_confirmation 'confirmed';
 *      no cron / job / fill engine / sweep imports the actor writer; the fill engine never moves a confirmed load.
 *  (c) settlement close refuses while any expense on its loads is 'proposed' — the pay-run close (EXPENSE_LOADS_PROPOSED,
 *      skipped only for a preview), the load-bookended trip close (before trip_closed_at is stamped) and the tour
 *      readiness item (hard); the shared reader filters live, proposed expenses on active settlement lines.
 *  (d) a family (receipt + children + Relay siblings) moves together — a Relay fill changed by a person is carried by its
 *      Relay id (row 102 fix: ledger + every sibling row), the receipt document move takes Relay siblings, the fill engine
 *      writes its evidence on every sibling, and a confirmation on a sibling counts for the fill.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-443-288-person-confirms-load";
const SRC = "apps/backend/src";
const F = {
  actor: `${SRC}/accounting/expense-load-confirm-actor.ts`,
  svc: `${SRC}/accounting/expense-load-confirmation.service.ts`,
  payrun: `${SRC}/driver-finance/settlement-payrun-close.service.ts`,
  bookended: `${SRC}/driver-finance/settlements-load-bookended.service.ts`,
  tour: `${SRC}/driver-finance/tour-readout.routes.ts`,
  fill: `${SRC}/fuel/fill-truck-and-load.service.ts`,
  reclass: `${SRC}/accounting/reclassify/reclassify.service.ts`,
  migration: "db/migrations/202616230700_expense_load_confirmation.sql",
};
/** Machine code: background jobs and the engines that propose a load. None may name a confirming person. */
const MACHINE = [/^apps\/backend\/src\/cron\//, /^apps\/backend\/src\/jobs\//, /\/fill-truck-and-load\.service\.ts$/, /\/fuel-follows-truck-sweep\.ts$/, /\/fuel-ingest-hooks\.ts$/, /\/fuel-receipt-repoint\.service\.ts$/];

function walk(dir, out = []) {
  for (const n of readdirSync(path.join(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    if (n === "node_modules" || n === "__tests__") continue;
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.ts$/.test(n) && !/\.(test|spec)\.ts$/.test(n) && !/\.d\.ts$/.test(n)) out.push(rel);
  }
  return out;
}

function between(src, start, end) {
  const i = src.indexOf(start);
  if (i < 0) return "";
  const j = src.indexOf(end, i + start.length);
  return j < 0 ? src.slice(i) : src.slice(i, j);
}

export function findDefects(s, tree) {
  const out = [];
  // ── (a) child follows parent ──────────────────────────────────────────────────────────────────────────────────
  const eng = between(s.svc, "export async function confirmExpenseLoadsInClientTx(", "\nexport async function proposedExpenseLoadsOnSettlement(");
  if (!eng) out.push("(a) confirmExpenseLoadsInClientTx not found");
  if (!/if \(e\.parent\) \{\s*throw new ExpenseLoadConfirmRefused\("CHILD_FOLLOWS_ITS_RECEIPT"/.test(eng)) out.push("(a) the confirm engine must refuse a child by name (it follows its receipt)");
  if (!/load_id = \$3::uuid AND \(id = \$1::uuid OR parent_expense_id = \$1::uuid\)/.test(eng)) out.push("(a) children must be confirmed together with their receipt, on the receipt's load");
  const famAt = eng.indexOf("await moveExpenseFamilyToLoad(");
  const changedEnd = eng.indexOf("out.moved += 1;\n      }");
  const confirmAt = eng.indexOf("SET load_confirmation = 'confirmed'");
  if (famAt < 0 || changedEnd < 0 || famAt < changedEnd || famAt > confirmAt) out.push("(a) the family move must run for EVERY confirmed receipt (outside the changed-load branch), before the confirm");
  // ── (b) only a person confirms ────────────────────────────────────────────────────────────────────────────────
  if (!/IF v_actor ~ '\^\[0-9a-f\]\{8\}/.test(s.migration) || !/NEW\.load_confirmation := 'proposed';/.test(s.migration)) out.push("(b) the trigger must confirm only with a person actor and otherwise write 'proposed'");
  if (!/MACHINE_ACTOR_IDS\.has\(userId\.toLowerCase\(\)\)[\s\S]{0,80}throw new ExpenseLoadConfirmRefused\(\s*"MACHINE_CANNOT_CONFIRM_LOAD"/.test(s.actor)) out.push("(b) the actor writer must refuse a machine actor by name (MACHINE_CANNOT_CONFIRM_LOAD)");
  if (!/SYSTEM_ACTOR_USER_ID/.test(between(s.actor, "export const MACHINE_ACTOR_IDS", ";\n"))) out.push("(b) the machine actor set must include SYSTEM_ACTOR_USER_ID");
  const mark = between(s.actor, "export async function markExpenseLoadConfirmedBy(", "\n}");
  const withFn = between(s.actor, "export async function withExpenseLoadConfirmedBy<", "\n}");
  for (const [n, b] of [["markExpenseLoadConfirmedBy", mark], ["withExpenseLoadConfirmedBy", withFn]]) {
    const a = b.indexOf("assertPersonConfirmsLoad(userId)");
    const w = b.indexOf("app.expense_load_confirm_actor', $1");
    if (a < 0 || w < 0 || a > w) out.push(`(b) ${n} must refuse a machine before it sets the confirming actor`);
  }
  if (!/withExpenseLoadConfirmedBy\(client, input\.actorUserId,/.test(eng)) out.push("(b) the confirm engine must run under withExpenseLoadConfirmedBy (the person)");
  for (const [rel, src] of Object.entries(tree)) {
    if (rel === F.actor) continue;
    if (/set_config\(\s*'app\.expense_load_confirm_actor',\s*\$\d/.test(src)) out.push(`(b) ${rel} sets the confirming actor itself — only expense-load-confirm-actor.ts may`);
    if (rel !== F.svc && /SET\s+load_confirmation\s*=\s*'confirmed'/.test(src)) out.push(`(b) ${rel} writes load_confirmation 'confirmed' — only the confirm engine may`);
    if (/load_confirmed_by_user_id\s*=\s*\$/.test(src)) out.push(`(b) ${rel} writes load_confirmed_by_user_id — only the trigger stamps who confirmed`);
    if (MACHINE.some((re) => re.test(rel)) && /\b(markExpenseLoadConfirmedBy|withExpenseLoadConfirmedBy|confirmExpenseLoadsInClientTx)\b/.test(src)) out.push(`(b) machine code ${rel} names a confirming person`);
  }
  if (!/await markExpenseLoadConfirmedBy\(client as never, input\.confirm_load_by_user_id\)/.test(s.reclass)) out.push("(b) reclassify by load must set the person through markExpenseLoadConfirmedBy");
  const act = between(s.fill, "export function rerunAction(", "\n}\n");
  if (!/if \(input\.loadConfirmed\) return "load_confirmed";/.test(act) || act.indexOf("input.loadConfirmed") > act.indexOf("return input.toLoadId")) out.push("(b) the fill engine must never move a person-confirmed load");
  // ── (c) close refuses proposed ────────────────────────────────────────────────────────────────────────────────
  if (!/if \(input\.previewOnly !== true\) \{\s*const proposedLoads = await proposedExpenseLoadsOnSettlement\(client as never, opco, settlementId\);\s*if \(proposedLoads\.length\) throw new SettlementPayRunError\("EXPENSE_LOADS_PROPOSED"/.test(s.payrun)) out.push("(c) the pay-run close must refuse EXPENSE_LOADS_PROPOSED (only a preview skips it)");
  const bk = s.bookended.indexOf("const proposedLoads = await proposedExpenseLoadsOnSettlement(");
  const bkThrow = s.bookended.indexOf('throw new ExpenseLoadConfirmRefused("EXPENSE_LOADS_PROPOSED"');
  const bkStamp = bkThrow < 0 ? -1 : s.bookended.indexOf("SET trip_closed_at = $2::timestamptz", bkThrow);
  if (bk < 0 || bkThrow < bk || bkStamp < 0 || bkThrow > bkStamp) out.push("(c) the trip close must refuse EXPENSE_LOADS_PROPOSED before it stamps trip_closed_at");
  if (!/key: "expense_loads_confirmed",[^\n]*hard: true, ok: proposedRes\.rows\.length === 0/.test(s.tour) || !/e\.load_confirmation = 'proposed'/.test(s.tour)) out.push("(c) the tour readiness must hold the close (hard) while an expense load is proposed");
  const reader = between(s.svc, "export async function proposedExpenseLoadsOnSettlement(", "\nexport function ");
  if (!/e\.voided_at IS NULL AND e\.load_confirmation = 'proposed'/.test(reader) || !/sl\.is_active = true AND sl\.voided_at IS NULL AND sl\.load_id IS NOT NULL/.test(reader)) out.push("(c) the close reader must read live proposed expenses on active settlement-line loads");
  // ── (d) family moves together ─────────────────────────────────────────────────────────────────────────────────
  if (!/fillKind: "relay_fuel",\s*fillId: relayId, toLoadId: target/.test(eng)) out.push("(d) a person's change of a Relay fill must carry it by its Relay id (ledger + every sibling row)");
  if (!/moveFuelReceiptDocumentToLoad\(client as never, input\.operatingCompanyId, \{ fillId: relayId \?\? e\.fill,/.test(eng)) out.push("(d) the document-only move must take the Relay siblings (fill by Relay id)");
  const doc = between(s.reclass, "export async function moveFuelReceiptDocumentToLoad(", "\nexport ");
  if (!/\(ft\.id::text = \$3 OR ft\.relay_fuel_transaction_id::text = \$3\)/.test(doc)) out.push("(d) the receipt document move must move every Relay sibling fuel row");
  if (!/fillKind: "relay_fuel", fillId: input\.resolution\.relay_id/.test(s.fill) || !/relay_fuel_transaction_id = \$14::uuid AND voided_at IS NULL/.test(s.fill)) out.push("(d) the fill engine must carry a Relay fill by its Relay id and stamp every sibling row");
  if (!/s\.relay_fuel_transaction_id = f\.relay_fuel_transaction_id/.test(between(s.fill, "export async function loadFillFacts(", "\nexport "))) out.push("(d) a confirmation on a Relay sibling must count for the fill");
  return out;
}

const src = Object.fromEntries(Object.entries(F).map(([k, f]) => [k, readFileSync(path.join(ROOT, f), "utf8")]));
const tree = Object.fromEntries(walk(SRC).map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  const base = findDefects(src, tree);
  if (base.length) { console.error(`${LABEL} --selftest FAIL — real tree not clean:\n - ${base.join("\n - ")}`); process.exit(1); }
  const plant = (k, a, b) => {
    if (!src[k].includes(a)) return null;
    const next = { ...src, [k]: src[k].replace(a, b) };
    return { s: next, t: { ...tree, ...(Object.prototype.hasOwnProperty.call(tree, F[k]) ? { [F[k]]: next[k] } : {}) } };
  };
  const extra = (rel, body) => ({ s: src, t: { ...tree, [rel]: body } });
  const plants = [
    ["(a) child confirmable on its own", plant("svc", 'throw new ExpenseLoadConfirmRefused("CHILD_FOLLOWS_ITS_RECEIPT"', 'console.warn("CHILD_FOLLOWS_ITS_RECEIPT"')],
    ["(a) children confirmed off the receipt's load", plant("svc", "load_id = $3::uuid AND (id = $1::uuid OR parent_expense_id = $1::uuid)", "(id = $1::uuid OR parent_expense_id = $1::uuid)")],
    ["(a) family move only on a changed load (old code)", plant("svc", "        out.moved += 1;\n      }\n", "        await moveExpenseFamilyToLoad(client as never, { parentExpenseIds: [e.id] });\n        out.moved += 1;\n      }\n      if (false) await noop(\n")],
    ["(b) machine actor accepted", plant("actor", 'throw new ExpenseLoadConfirmRefused(\n      "MACHINE_CANNOT_CONFIRM_LOAD"', 'void new ExpenseLoadConfirmRefused(\n      "MACHINE_CANNOT_CONFIRM_LOAD"')],
    ["(b) machine set drops the system actor", plant("actor", "[SYSTEM_ACTOR_USER_ID, ", "[")],
    ["(b) mark skips the machine check", plant("actor", "  if (!UUID.test(userId)) return;\n  assertPersonConfirmsLoad(userId);\n", "  if (!UUID.test(userId)) return;\n")],
    ["(b) trigger confirms without a person", plant("migration", "  NEW.load_confirmation := 'proposed';\n  NEW.load_confirmed_by_user_id := NULL;", "  NEW.load_confirmation := 'confirmed';\n  NEW.load_confirmed_by_user_id := NULL;")],
    ["(b) reclassify sets the actor itself", plant("reclass", "await markExpenseLoadConfirmedBy(client as never, input.confirm_load_by_user_id);", "await client.query(`SELECT set_config('app.expense_load_confirm_actor', $1::text, true)`, [input.confirm_load_by_user_id]);")],
    ["(b) a cron confirms loads", extra(`${SRC}/cron/planted-autoconfirm.cron.ts`, `import { markExpenseLoadConfirmedBy } from "../accounting/expense-load-confirm-actor.js";\nawait markExpenseLoadConfirmedBy(c, SYSTEM);`)],
    ["(b) a writer stamps confirmed directly", extra(`${SRC}/fuel/planted.service.ts`, "await c.query(`UPDATE accounting.expenses SET load_confirmation = 'confirmed' WHERE id = $1`)")],
    ["(b) a writer sets the actor directly", extra(`${SRC}/fuel/planted2.service.ts`, "await c.query(`SELECT set_config('app.expense_load_confirm_actor', $1, true)`, [x])")],
    ["(b) fill engine moves a confirmed load", plant("fill", '  if (input.loadConfirmed) return "load_confirmed";\n', "")],
    ["(c) pay-run close lets proposed through", plant("payrun", 'if (proposedLoads.length) throw new SettlementPayRunError("EXPENSE_LOADS_PROPOSED"', 'if (false) throw new SettlementPayRunError("EXPENSE_LOADS_PROPOSED"')],
    ["(c) trip close lets proposed through", plant("bookended", 'throw new ExpenseLoadConfirmRefused("EXPENSE_LOADS_PROPOSED"', 'console.warn("EXPENSE_LOADS_PROPOSED"')],
    ["(c) tour readiness soft", plant("tour", 'key: "expense_loads_confirmed", label: "Every expense\'s load confirmed by a person", hard: true', 'key: "expense_loads_confirmed", label: "Every expense\'s load confirmed by a person", hard: false')],
    ["(c) close reader counts voided lines", plant("svc", "sl.is_active = true AND sl.voided_at IS NULL AND sl.load_id IS NOT NULL", "sl.load_id IS NOT NULL")],
    ["(d) Relay fill changed by one row (old code)", plant("svc", 'fillKind: "relay_fuel",\n              fillId: relayId, toLoadId: target', 'fillKind: "fuel_transaction",\n              fillId: e.fill, toLoadId: target')],
    ["(d) document move leaves Relay siblings", plant("svc", "{ fillId: relayId ?? e.fill,", "{ fillId: e.fill,")],
    ["(d) receipt document move drops siblings", plant("reclass", "AND (ft.id::text = $3 OR ft.relay_fuel_transaction_id::text = $3)", "AND ft.id::text = $3")],
    ["(d) fill evidence on one row only", plant("fill", "relay_fuel_transaction_id = $14::uuid AND voided_at IS NULL", "false")],
    ["(d) sibling confirmation ignored", plant("fill", "s.relay_fuel_transaction_id = f.relay_fuel_transaction_id", "s.id = f.id")],
  ];
  let caught = 0;
  for (const [name, p] of plants) {
    const hit = p !== null && findDefects(p.s, p.t).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}${p === null ? " (plant did not apply)" : ""}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${plants.length} planted defects caught; real tree clean`);
  process.exit(caught === plants.length ? 0 : 1);
}

const defects = findDefects(src, tree);
if (defects.length) { console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`); process.exit(1); }
console.log(`${LABEL} PASS — (a) children follow their receipt · (b) only a person confirms a load (machine refused by name) · (c) close refuses proposed · (d) receipt + children + Relay siblings move together`);
