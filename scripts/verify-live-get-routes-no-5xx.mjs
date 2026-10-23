#!/usr/bin/env node
/**
 * LEAD 443.268-A item 7 — PERMANENT: no parameter-free GET route may answer 5xx on prod.
 * The Lead's 12:55 UTC sweep (696 routes, Owner, USMCA) found 13 live 500s the static guards could not see
 * (columns that do not exist, text = uuid, an alias inside ORDER BY, comma + JOIN, one bad polygon failing a list).
 *
 *   1. Enumerate every parameter-free GET route literal in apps/backend/src (app.get("/api/v1/…") without ":param").
 *   2. Call each on prod (IH35_LIVE_API_BASE, default https://api.ih35dispatch.com) with ?operating_company_id=USMCA,
 *      authenticated by the operator session in IH35_LIVE_SESSION_COOKIE (a read-only Owner/service session — never a
 *      password; nothing here logs or writes the cookie). GET only: nothing is written.
 *   3. FAIL on ANY 5xx (listed with the response body's error). 4xx is reported, not failed (validation is CC-2's 443.268-B).
 *
 * Without IH35_LIVE_SESSION_COOKIE the live arm is NOT RUN (said so, exit 0 — the static sweep must not go red for a
 * missing credential); the live gate sets it. --selftest plants a route that throws (500) and requires a FAIL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const LABEL = "verify-live-get-routes-no-5xx";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e.name) && !/\.test\.ts$/.test(e.name) && !p.includes(`${path.sep}__tests__${path.sep}`)) out.push(p);
  }
  return out;
}

/** Parameter-free GET route literals (the shape the Lead's sweep called). */
export function enumerateGetRoutes(files) {
  const routes = new Set();
  for (const [, src] of files) {
    for (const m of src.matchAll(/\bapp\.get\(\s*["'`](\/api\/v1\/[^"'`]+)["'`]/g)) {
      const p = m[1];
      if (p.includes(":") || p.includes("*") || p.includes("${")) continue;
      routes.add(p);
    }
  }
  return [...routes].sort();
}

/** Calls every route through `fetcher`; returns { fivexx: [{route,status,error}], fourxx, ok }. */
export async function sweep(routes, fetcher, { concurrency = 6 } = {}) {
  const fivexx = [];
  const fourxx = [];
  let ok = 0;
  let i = 0;
  async function worker() {
    while (i < routes.length) {
      const route = routes[i++];
      let status = 0;
      let error = "";
      try {
        const r = await fetcher(route);
        status = r.status;
        if (status >= 400) error = String(r.error ?? "").slice(0, 160);
      } catch (e) {
        status = 599;
        error = e instanceof Error ? e.message : String(e);
      }
      if (status >= 500) fivexx.push({ route, status, error });
      else if (status >= 400) fourxx.push({ route, status, error });
      else ok += 1;
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  fivexx.sort((a, b) => a.route.localeCompare(b.route));
  return { fivexx, fourxx, ok };
}

function httpFetcher(base, cookie) {
  return async (route) => {
    const url = `${base}${route}?operating_company_id=${USMCA}`;
    const res = await fetch(url, { method: "GET", headers: { cookie, accept: "application/json" }, signal: AbortSignal.timeout(30000) });
    let error = "";
    if (res.status >= 400) {
      const text = await res.text();
      try {
        const j = JSON.parse(text);
        error = j.message ?? j.error ?? text;
      } catch {
        error = text;
      }
    }
    return { status: res.status, error };
  };
}

async function selftest() {
  const routes = ["/api/v1/ok", "/api/v1/throws", "/api/v1/needs-a-date"];
  const fake = async (r) => (r === "/api/v1/throws" ? { status: 500, error: "column x does not exist" } : r === "/api/v1/needs-a-date" ? { status: 400, error: "from_date" } : { status: 200 });
  const res = await sweep(routes, fake);
  const enumerated = enumerateGetRoutes([["a.ts", 'app.get("/api/v1/a", h); app.get("/api/v1/b/:id", h); app.get(`/api/v1/c`, h)']]);
  const checks = [
    ["a route that throws (500) FAILS", res.fivexx.length === 1 && res.fivexx[0].route === "/api/v1/throws"],
    ["a 400 is reported, not failed", res.fourxx.length === 1 && res.ok === 1],
    ["a network error counts as 5xx", (await sweep(["/api/v1/x"], async () => { throw new Error("ECONNRESET"); })).fivexx.length === 1],
    ["enumeration skips :param routes", JSON.stringify(enumerated) === JSON.stringify(["/api/v1/a", "/api/v1/c"])],
  ];
  let bad = 0;
  for (const [n, ok] of checks) {
    console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    if (!ok) bad += 1;
  }
  console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${checks.length}/${checks.length})`);
  process.exit(bad ? 1 : 0);
}

async function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = walk(SRC).map((f) => [f, fs.readFileSync(f, "utf8")]);
  const routes = enumerateGetRoutes(files);
  const cookie = process.env.IH35_LIVE_SESSION_COOKIE ?? "";
  if (!cookie) {
    console.log(`${LABEL}: NOT RUN — ${routes.length} parameter-free GET routes enumerated; set IH35_LIVE_SESSION_COOKIE (read-only Owner/service session) to run the live arm. The live gate sets it.`);
    return;
  }
  const base = (process.env.IH35_LIVE_API_BASE ?? "https://api.ih35dispatch.com").replace(/\/$/, "");
  const res = await sweep(routes, httpFetcher(base, cookie));
  if (res.fivexx.length) {
    console.error(`${LABEL}: FAIL — ${res.fivexx.length} of ${routes.length} GET routes answer 5xx on ${base}:`);
    for (const x of res.fivexx) console.error(`  ✗ ${x.status} ${x.route} — ${x.error}`);
    if (res.fourxx.length) console.error(`  (also ${res.fourxx.length} answered 4xx — reported, not failed)`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — ${routes.length} GET routes, 0 answered 5xx (${res.ok} 2xx/3xx, ${res.fourxx.length} 4xx reported) on ${base}`);
}

await main();
