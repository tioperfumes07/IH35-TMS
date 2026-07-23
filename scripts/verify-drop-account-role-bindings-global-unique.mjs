#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607770000_drop_account_role_bindings_global_unique.sql";
const HELD = "db/migrations/.held-migrations.json";
export function run(root = ROOT) {
  const f = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/i.test(mig)) f.push("migration missing DO NOT RUN ON PROD");
  if (!/DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_key/.test(mig)) f.push("must DROP account_role_bindings_role_key_key");
  if (/DROP CONSTRAINT IF EXISTS uq_account_role_bindings_company_role_key/.test(mig)) f.push("must NOT drop per-entity unique");
  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  if (!(held.held || []).some((h) => h.file === path.basename(MIG))) f.push("must register in .held-migrations.json");
  return f;
}
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-drop-unique-");
    fs.mkdirSync(path.join(tmp, "db/migrations"), { recursive: true });
    fs.writeFileSync(path.join(tmp, MIG), "ALTER TABLE x DROP CONSTRAINT IF EXISTS other;");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    if (!run(tmp).length) throw new Error("bug must fail");
    fs.writeFileSync(path.join(tmp, MIG), "-- DO NOT RUN ON PROD\nALTER TABLE catalogs.account_role_bindings DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_key;");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    if (run(tmp).length) throw new Error("good must pass: " + run(tmp));
    console.log("verify-drop-account-role-bindings-global-unique --selftest OK");
  } else {
    const r = run();
    if (r.length) { console.error(r.join("\n")); process.exit(1); }
    console.log("verify-drop-account-role-bindings-global-unique — OK");
  }
}
