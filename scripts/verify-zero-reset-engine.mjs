#!/usr/bin/env node
// ROUND 326 queue item 22 (CC-1) — THE ZERO-RESET ENGINE (a scope of the one complete-delete engine, never a second
// delete engine). Fails if the --scope=zero-reset path loses any of the owner's conditions:
//   1. master data survives untouched — a master / preserve / identity / catalog table reached through the FK graph
//      is a BLOCKER, and master-data counts are proven unchanged after the delete;
//   2. refuses unless the preservation engine (preserve.*) has recorded its rows;
//   3. bank lines are kept (links cleared, back to the queue), never deleted;
//   4. one transaction, proven in it: GL postings 0 and every deleted table 0 for the company, else rolled back;
//   5. APPLY stays owner-only (OWNER_AUTH_ID verified, assertIsIntendedProduction) and DRY is read-only.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-zero-reset-engine";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "scripts/ops/2026-10-02-cc1-r326-complete-delete.ts";
const MASTER = ["mdata.customers", "mdata.drivers", "mdata.vendors", "mdata.locations", "mdata.units", "mdata.equipment", "catalogs.accounts", "catalogs.items", "identity.users"];

export function problems(s) {
  const p = [];
  if (!/if \(SCOPE === "zero-reset"\) \{\s*\n\s*for \(const t of ZERO_RESET_ROOTS\)/.test(s)) p.push("the zero-reset scope must collect every row of the document roots");
  for (const m of MASTER) if (!s.includes(`"${m}"`)) p.push(`master table ${m} must be listed as surviving`);
  if (!/if \(isMasterOrPreserve\(fk\.child\) \|\| !fk\.nullable\) \{\s*\n\s*report\.push\(`BLOCKER/.test(s)) p.push("a master / preserve table (or a non-nullable link) reached by the FK graph must be a BLOCKER");
  if (!/delete order is TOPOLOGICAL over the FK graph/.test(s) || !/!edges\.some\(\(e\) => e\.parent === t && left\.has\(e\.child\)\)/.test(s)) p.push("the zero-reset must delete in topological order (children before parents)");
  if (!/Every bank line of the company goes back to the queue/.test(s) || !/column_name LIKE 'matched/.test(s)) p.push("every bank line must return to the queue with all matched_* pointers cleared (most carry no FK)");
  if (!/ZERO-RESET REFUSED: the plan would touch preserved table/.test(s) || !/ZERO-RESET REFUSED: DELETE on preserved table/.test(s)) p.push("the preserved-table refusal must be an ASSERTION in the engine (plan check before the first write + per-DELETE check), not a report line");
  if (!/kind: "rows"/.test(s) || !/DELETE FROM \$\{r\.table\} WHERE \$\{r\.col\}::text = ANY/.test(s)) p.push("a child with no single-column primary key must be deleted by its foreign key");
  if (!/masterAfter\[t\] !== n\) throw new Error\(`ZERO-RESET PROOF FAILED: master table/.test(s)) p.push("master-data counts must be proven unchanged after the delete");
  if (!/BLOCKER preservation engine has not recorded preserve\./.test(s)) p.push("the zero-reset must refuse until the preservation engine has recorded its rows");
  if (!/RESET_TABLES = new Set\(\["banking\.bank_transactions"\]\)/.test(s) || !/UPDATE \$\{r\.table\} SET \$\{r\.col\} = NULL/.test(s)) p.push("bank lines must be kept and unlinked, never deleted");
  if (!/ZERO-RESET PROOF FAILED: \$\{gl\} GL posting\(s\) remain/.test(s) || !/ZERO-RESET PROOF FAILED: \$\{t\} still has/.test(s)) p.push("GL postings and every deleted table must be proven 0 in the same transaction");
  if (!/verify-owner-authorization\.mjs/.test(s) || !/assertIsIntendedProduction\(client/.test(s) || !/BEGIN READ ONLY/.test(s)) p.push("APPLY must stay owner-AUTH + intended-production; DRY must be read-only");
  return p;
}

// ROUND 288.3 item 4 / 296 6b: the held delete-route migration keeps CC-3's narrow merged-duplicate allowance, so the
// canonical customer / vendor merge is never re-broken when it applies.
export function migrationProblems(m) {
  const p = [];
  if (!/a\.merged_customer_id = \(v_row ->> 'id'\)::uuid[\s\S]{0,200}a\.reversed_at IS NULL\) THEN\s*\n\s*RETURN OLD;/.test(m)) p.push("202615210200 must allow deleting a merged customer duplicate (live customer alias)");
  if (!/a\.merged_vendor_id = \(v_row ->> 'id'\)::uuid[\s\S]{0,200}a\.reversed_at IS NULL\) THEN\s*\n\s*RETURN OLD;/.test(m)) p.push("202615210200 must allow deleting a merged vendor duplicate (live vendor alias)");
  return p;
}
const MIGRATION = "db/migrations/202615210200_complete_delete_route_and_inbound_entity.sql";

export function run() {
  return [...problems(readFileSync(path.join(ROOT, FILE), "utf8")), ...migrationProblems(readFileSync(path.join(ROOT, MIGRATION), "utf8"))];
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = readFileSync(path.join(ROOT, FILE), "utf8");
  const own = [...problems(src), ...migrationProblems(readFileSync(path.join(ROOT, MIGRATION), "utf8"))];
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["preserved deleted", src.replace("if (isMasterOrPreserve(fk.child) || !fk.nullable) {", "if (false) {")],
      ["assertion removed", src.replace("ZERO-RESET REFUSED: DELETE on preserved table", "note")],
      ["depth order", src.replace("!edges.some((e) => e.parent === t && left.has(e.child))", "true")],
      ["no master proof", src.replace("masterAfter[t] !== n) throw", "false) throw")],
      ["bank deleted", src.replace('RESET_TABLES = new Set(["banking.bank_transactions"])', "RESET_TABLES = new Set<string>([])")],
      ["no preservation check", src.replace("BLOCKER preservation engine has not recorded preserve.", "note preservation ")],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — zero-reset: master data survives (blocker + proof), preservation precondition, bank lines kept, GL + tables proven 0 in one transaction, owner-only APPLY.`);
}
