#!/usr/bin/env node
/** CLOSURE-23 — monthly row-count checksum baseline. */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "backup-checksum-monthly";
const QUERIES = [
  ["companies", "SELECT COUNT(*)::bigint AS cnt FROM org.companies"],
  ["customers", "SELECT COUNT(*)::bigint AS cnt FROM mdata.customers"],
  ["vendors", "SELECT COUNT(*)::bigint AS cnt FROM mdata.vendors"],
];
function monthKey(d=new Date()) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`; }
async function main() {
  const month = monthKey();
  const out = path.join(ROOT, "docs/audits", `backup-checksums-${month}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let counts = { note: "run with DATABASE_URL for live counts" };
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
    await c.connect();
    counts = {};
    for (const [k, sql] of QUERIES) { const r = await c.query(sql); counts[k] = Number(r.rows[0].cnt); }
    await c.end();
  }
  fs.writeFileSync(out, JSON.stringify({ block: "CLOSURE-23", month, generated_at: new Date().toISOString(), counts }, null, 2) + "\n");
  console.log(`[${LABEL}] PASS wrote ${out}`);
}
main().catch(e => { console.error(e); process.exit(1); });
