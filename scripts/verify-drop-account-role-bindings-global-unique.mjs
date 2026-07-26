#!/usr/bin/env node
/**
 * Guard: drop global UNIQUE(role_key) on catalogs.account_role_bindings (WO #5).
 *
 * After DROP, CI fresh DBs keep only the PARTIAL unique index from held
 * 202607010700: UNIQUE (operating_company_id, role_key) WHERE operating_company_id IS NOT NULL.
 * Postgres requires ON CONFLICT to include that same WHERE — bare
 * ON CONFLICT (operating_company_id, role_key) fails with:
 *   "there is no unique or exclusion constraint matching the ON CONFLICT specification"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202607770000_drop_account_role_bindings_global_unique.sql";
const HELD = "db/migrations/.held-migrations.json";
const COMPANIONS = [
  "apps/backend/test-helpers/global-account-role-bindings-lock.ts",
  "apps/backend/src/driver-finance/__tests__/settlement-payrun-close.db.test.ts",
  "apps/backend/src/accounting/settlement-posting/__tests__/settlement-gl-posting.db.test.ts",
  "apps/backend/src/accounting/settlement-posting/__tests__/settlement-bill-payment-posting.db.test.ts",
];

const PARTIAL_CONFLICT =
  /ON CONFLICT \(operating_company_id, role_key\) WHERE \(operating_company_id IS NOT NULL\)/;

export function run(root = ROOT) {
  const f = [];
  const mig = fs.readFileSync(path.join(root, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/i.test(mig)) f.push("migration missing DO NOT RUN ON PROD");
  if (!/DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_key/.test(mig)) {
    f.push("must DROP account_role_bindings_role_key_key");
  }
  if (/DROP CONSTRAINT IF EXISTS uq_account_role_bindings_company_role_key/.test(mig)) {
    f.push("must NOT drop per-entity unique");
  }
  const held = JSON.parse(fs.readFileSync(path.join(root, HELD), "utf8"));
  const heldEntries = [...(held.held || []), ...(held.applied_held || [])];
  if (!heldEntries.some((h) => h.file === path.basename(MIG))) {
    f.push("must register in .held-migrations.json");
  }

  for (const rel of COMPANIONS) {
    const src = fs.readFileSync(path.join(root, rel), "utf8");
    if (!/INSERT\s+INTO\s+catalogs\.account_role_bindings/i.test(src)) continue;
    if (/ON CONFLICT \(role_key\)/.test(src)) {
      f.push(`${rel}: still ON CONFLICT (role_key) — global unique is dropped`);
    }
    if (/ON CONFLICT \(operating_company_id, role_key\)(?!\s+WHERE)/.test(src)) {
      f.push(
        `${rel}: ON CONFLICT (operating_company_id, role_key) missing WHERE (operating_company_id IS NOT NULL) — partial unique index inference`,
      );
    }
    if (!PARTIAL_CONFLICT.test(src) && /INSERT\s+INTO\s+catalogs\.account_role_bindings/i.test(src)) {
      // Must have at least one correct partial conflict upsert
      f.push(`${rel}: must upsert via ${PARTIAL_CONFLICT}`);
    }
  }
  return f;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const tmp = fs.mkdtempSync("/tmp/verify-drop-unique-");
    for (const rel of [MIG, HELD, ...COMPANIONS]) {
      fs.mkdirSync(path.join(tmp, path.dirname(rel)), { recursive: true });
    }
    fs.writeFileSync(path.join(tmp, MIG), "ALTER TABLE x DROP CONSTRAINT IF EXISTS other;");
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [] }));
    for (const rel of COMPANIONS) {
      fs.writeFileSync(
        path.join(tmp, rel),
        `INSERT INTO catalogs.account_role_bindings (role_key) VALUES ('x') ON CONFLICT (role_key) DO UPDATE SET role_key = EXCLUDED.role_key`,
      );
    }
    if (!run(tmp).length) throw new Error("bug shape must FAIL");

    fs.writeFileSync(
      path.join(tmp, MIG),
      "-- DO NOT RUN ON PROD\nALTER TABLE catalogs.account_role_bindings DROP CONSTRAINT IF EXISTS account_role_bindings_role_key_key;",
    );
    fs.writeFileSync(path.join(tmp, HELD), JSON.stringify({ held: [{ file: path.basename(MIG) }] }));
    for (const rel of COMPANIONS) {
      fs.writeFileSync(
        path.join(tmp, rel),
        `INSERT INTO catalogs.account_role_bindings (role_key, account_id, operating_company_id)
         VALUES ($1,$2,$3)
         ON CONFLICT (operating_company_id, role_key) WHERE (operating_company_id IS NOT NULL)
         DO UPDATE SET account_id = EXCLUDED.account_id`,
      );
    }
    const good = run(tmp);
    if (good.length) throw new Error("good must PASS: " + good.join("; "));
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log("verify-drop-account-role-bindings-global-unique --selftest OK");
  } else {
    const r = run();
    if (r.length) {
      console.error(r.join("\n"));
      process.exit(1);
    }
    console.log("verify-drop-account-role-bindings-global-unique — OK");
  }
}
