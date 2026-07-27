#!/usr/bin/env node
/**
 * Intercompany COA 8000-block seed (BANK-DOM-05 foundation).
 * Static: migration present. --live: all 3 entities have both counterparty accounts.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202609210000_intercompany_coa_8000_block_seed.sql";

const REQUIRED = [
  ["TRANSP", "8001", "intercompany_trk"],
  ["TRANSP", "8002", "intercompany_usmca"],
  ["TRK", "8000", "intercompany_transp"],
  ["TRK", "8002", "intercompany_usmca"],
  ["USMCA", "8000", "intercompany_ih35"],
  ["USMCA", "8001", "intercompany_trk"],
];

export function assertMigration(root = ROOT) {
  const problems = [];
  const p = path.join(root, MIG);
  if (!fs.existsSync(p)) return [`missing ${MIG}`];
  const src = fs.readFileSync(p, "utf8");
  for (const needle of ["Inter-company", "intercompany_trk", "8000", "8001", "8002", "Due-to"]) {
    if (needle === "Due-to") {
      if (!/NEVER invent Due-to|Do NOT introduce.*Due to/i.test(src) && !src.includes("Due-to/Due-from")) {
        problems.push("migration must forbid Due-to/Due-from split-brain");
      }
      continue;
    }
    if (!src.includes(needle)) problems.push(`migration missing ${needle}`);
  }
  return problems;
}

function selftest() {
  const p = assertMigration();
  if (p.length) throw new Error(p.join("; "));
  console.log("[verify-intercompany-coa-8000-block] --selftest PASS");
}

async function live() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("--live requires DATABASE_URL");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const { rows } = await client.query(`
      SELECT o.code AS co, a.account_number, a.system_purpose, a.account_type
      FROM catalogs.accounts a
      JOIN org.companies o ON o.id = a.operating_company_id
      WHERE a.deactivated_at IS NULL
        AND a.account_number IN ('8000','8001','8002')
        AND o.code IN ('TRANSP','TRK','USMCA')
    `);
    const key = (co, num) => `${co}|${num}`;
    const map = new Map(rows.map((r) => [key(r.co, r.account_number), r]));
    const problems = [];
    for (const [co, num, purpose] of REQUIRED) {
      const row = map.get(key(co, num));
      if (!row) {
        problems.push(`${co} missing account ${num}`);
        continue;
      }
      if (row.system_purpose !== purpose) {
        problems.push(`${co} ${num}: system_purpose=${row.system_purpose} expected ${purpose}`);
      }
      if (String(row.account_type) !== "Asset") {
        problems.push(`${co} ${num}: account_type=${row.account_type} expected Asset`);
      }
    }
    if (problems.length) {
      console.error("[verify-intercompany-coa-8000-block] LIVE FAIL:");
      for (const x of problems) console.error(`  - ${x}`);
      process.exit(1);
    }
    console.log("[verify-intercompany-coa-8000-block] LIVE PASS — 6 intercompany accounts present");
  } finally {
    await client.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) return selftest();
  const problems = assertMigration();
  if (problems.length) {
    console.error("[verify-intercompany-coa-8000-block] FAIL:");
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes("--live")) return live();
  console.log("[verify-intercompany-coa-8000-block] PASS — migration present");
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
