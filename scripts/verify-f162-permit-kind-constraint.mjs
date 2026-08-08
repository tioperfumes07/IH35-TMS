#!/usr/bin/env node
/**
 * GUARD: the F162 migration that seeds category_kind='permit' MUST first extend the enforcing CHECK
 * `expense_category_account_map_category_kind_check` so its allowed-set includes 'permit'. This is the
 * exact defect that froze prod at 6020040: the seed inserted 'permit' while the CHECK omitted it, so
 * db:migrate died in pre-deploy the moment a USMCA company existed (invisible on CI's empty DB).
 * Static, DB-free, mutation-proven: reddens if 'permit' is dropped from the constraint's allowed-set.
 */
import fs from "node:fs";
import path from "node:path";
const LABEL = "verify:f162-permit-kind-constraint";
const dir = "db/migrations";
const file = fs.readdirSync(dir).find((f) => /seed_usmca_permit_expense_category_map/.test(f));
if (!file) { console.log(`${LABEL} OK — F162 migration not present`); process.exit(0); }
const sql = fs.readFileSync(path.join(dir, file), "utf8");
const seedsPermit = /category_kind\s*=\s*'permit'/i.test(sql);
if (!seedsPermit) { console.log(`${LABEL} OK — migration does not seed a 'permit' kind`); process.exit(0); }
const m = sql.match(/ADD\s+CONSTRAINT\s+expense_category_account_map_category_kind_check[\s\S]*?(?:ANY\s*\(\s*ARRAY\s*\[([\s\S]*?)\]|IN\s*\(([\s\S]*?)\))/i);
if (!m) { console.error(`${LABEL} FAILED\n- migration seeds 'permit' but has NO 'ADD CONSTRAINT ... category_kind_check' extending the allowed-set — the CHECK rejects the seed wherever a USMCA company exists (prod-freeze class).`); process.exit(1); }
const allowed = m[1] || m[2] || "";
if (!/'permit'/.test(allowed)) { console.error(`${LABEL} FAILED\n- the re-added category_kind_check allowed-set does NOT contain 'permit'. set was: ${allowed.replace(/\s+/g," ").trim().slice(0,220)}`); process.exit(1); }
console.log(`${LABEL} OK — F162 re-adds category_kind_check with 'permit' in its allowed-set before seeding it (${file})`);
process.exit(0);
