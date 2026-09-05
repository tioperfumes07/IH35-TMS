#!/usr/bin/env node
import fs from "node:fs";

const file = "scripts/run-quarantine-usmca-wrong-entity-loads-once.mts";
const source = fs.readFileSync(file, "utf8");
const failures = [];
const requireText = (text, message) => { if (!source.includes(text)) failures.push(message); };

requireText('executeVoidCancel("expense"', "runner must reuse the canonical expense void executor");
requireText('executeVoidCancel("invoice"', "runner must reuse the canonical invoice void executor");
requireText("settlement_lines", "runner must void settlement rows at load-line grain");
requireText("leave every shared parent open", "runner must preserve shared pre-settlements");
requireText("for (const loadNumber of selected)", "runner must process the selected fixed reconciliation list");
requireText('await client.query("BEGIN")', "each load family must start its own transaction");
requireText('if (APPLY) await client.query("COMMIT")', "writes must require explicit --commit");
requireText("unvoidable_money", "runner must fail closed on paid/factored money");
requireText("TRANSPORTATION-NOT-USMCA-2026-08-07-CUTOFF", "quarantine memo is required");
requireText("is_sample_data=true", "quarantined wrong-entity rows must leave the real USMCA population");
requireText("restored_for_wrong_entity_void", "soft-deleted rows must be restored and audited before canonical cancellation");
requireText("soft_deleted_at=NULL, deleted_by_user_id=NULL", "quarantine must remain visible in the register");
if (/\bDELETE\s+FROM\b/i.test(source)) failures.push("quarantine runner must never delete");

const list = source.match(/const LOAD_NUMBERS = \[([\s\S]*?)\] as const;/)?.[1]?.match(/"\d+"/g) ?? [];
if (list.length !== 29 || new Set(list).size !== 29) failures.push(`expected 29 unique load numbers, found ${list.length}/${new Set(list).size}`);

if (failures.length) {
  console.error("verify-quarantine-usmca-wrong-entity-loads: FAIL");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log("verify-quarantine-usmca-wrong-entity-loads: PASS (29 unique loads, canonical document executors, load-line settlement grain, per-load tx, never delete)");
