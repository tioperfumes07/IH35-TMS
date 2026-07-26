#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607780000_bank_account_cash_gl_postable_trigger.sql";
const HELD = "db/migrations/.held-migrations.json";
const ROUTES = "apps/backend/src/banking/banking.routes.ts";
export function run(root = ROOT) {
  const f = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/i.test(mig)) f.push("migration missing DO NOT RUN ON PROD");
  if (!/assert_cash_gl_account_postable/.test(mig)) f.push("missing assert_cash_gl_account_postable function");
  if (!/is_postable\s*=\s*true/.test(mig)) f.push("trigger must require is_postable = true");
  if (!/trg_bank_account_cash_gl_postable/.test(mig)) f.push("missing trigger trg_bank_account_cash_gl_postable");
  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  const heldEntries = [...(held.held || []), ...(held.applied_held || [])];
  if (!heldEntries.some((h) => h.file === path.basename(MIG))) f.push("must register held migration");
  // Route-level still required (#3338)
  const routes = fs.readFileSync(path.join(root, ROUTES), "utf8");
  if (!/account_not_postable/.test(routes)) f.push("banking.routes must still reject account_not_postable");
  return f;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-cash-gl-trig-");
    for (const rel of [MIG, HELD, ROUTES]) fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(tmp, MIG), "SELECT 1;");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    fs.writeFileSync(path.join(tmp, ROUTES), "app.put");
    if (!run(tmp).length) throw new Error("bug must fail");
    fs.writeFileSync(path.join(tmp, MIG), "-- DO NOT RUN ON PROD\nCREATE FUNCTION banking.assert_cash_gl_account_postable() RETURNS trigger AS $$ BEGIN IF NOT EXISTS (SELECT 1 FROM catalogs.accounts a WHERE a.is_postable = true) THEN RAISE; END IF; RETURN NEW; END; $$;\nCREATE TRIGGER trg_bank_account_cash_gl_postable BEFORE INSERT ON banking.bank_accounts FOR EACH ROW EXECUTE FUNCTION banking.assert_cash_gl_account_postable();");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    fs.writeFileSync(path.join(tmp, ROUTES), "account_not_postable");
    if (run(tmp).length) throw new Error("good must pass " + run(tmp));
    console.log("verify-banking-cash-gl-postable-trigger --selftest OK");
  } else {
    const r = run();
    if (r.length) { console.error(r.join("\n")); process.exit(1); }
    console.log("verify-banking-cash-gl-postable-trigger — OK");
  }
}
