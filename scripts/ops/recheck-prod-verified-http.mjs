#!/usr/bin/env node
/**
 * Unauthenticated GET of HTTP paths named in unbound prod_verified evidence.
 * 401/403 = route mounted (auth required). 404 = not mounted. Network fail = UNVERIFIED.
 * Does not stamp. Does not prove RLS/entity. GUARD still adjudicates.
 *
 *   node scripts/ops/recheck-prod-verified-http.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const CLASS = path.join(ROOT, "docs/module-completion/PROD-VERIFIED-EVIDENCE-CLASS.json");
const BASE = process.env.IH35_API_BASE || "https://api.ih35dispatch.com";

const doc = JSON.parse(readFileSync(CLASS, "utf8"));
const paths = new Map();
for (const it of doc.items.http || []) {
  for (const p of it.httpPaths || []) {
    if (!paths.has(p)) paths.set(p, []);
    paths.get(p).push(`${it.module}:${it.id}`);
  }
}

const rows = [];
for (const p of [...paths.keys()].sort()) {
  const url = p.startsWith("http") ? p : `${BASE}${p.startsWith("/") ? p : `/${p}`}`;
  let status = "UNREACHABLE";
  let code = 0;
  try {
    const res = await fetch(url, { method: "GET", redirect: "manual" });
    code = res.status;
    if (code === 401 || code === 403) status = "MOUNTED_AUTH";
    else if (code === 404) status = "NOT_FOUND";
    else if (code >= 200 && code < 400) status = "HTTP_OK";
    else status = `HTTP_${code}`;
  } catch (e) {
    status = `ERROR:${e && e.message ? e.message : e}`;
  }
  rows.push({ path: p, code, status, items: paths.get(p) });
}

const tally = {};
for (const r of rows) tally[r.status] = (tally[r.status] || 0) + 1;
console.log(JSON.stringify({ base: BASE, uniquePaths: rows.length, tally, rows }, null, 2));
