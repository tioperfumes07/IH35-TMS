#!/usr/bin/env node
/**
 * verify-step 12085 -- double-encoded API bodies (ROUND 316 systemic sweep).
 * apps/frontend/src/api/client.ts apiRequest() already sends `JSON.stringify(options.body)`. A caller that passes
 * `body: JSON.stringify(x)` sends a JSON *string*; the server's JSON parser (config/empty-json-body-parser.ts)
 * JSON.parse()s it once into a string, and every zod object schema rejects it (400). Measured 2026-10-01: 7 call
 * sites did this — bank deposit create + void, batch settlements, settlement creator preview + post, maintenance
 * idle event, fleet roster void — each action failed on prod.
 * FAILS IF any frontend file passes `body: JSON.stringify(` inside an apiRequest(...) call. Raw fetch() keeps
 * its JSON.stringify (it has no wrapper doing it).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const LABEL = "verify-no-double-encoded-api-body";
function files(dir = "apps/frontend/src", out = []) {
  for (const n of readdirSync(resolve(ROOT, dir))) {
    const rel = `${dir}/${n}`;
    if (n === "node_modules") continue;
    if (statSync(resolve(ROOT, rel)).isDirectory()) files(rel, out);
    else if (/\.(ts|tsx)$/.test(n) && !/\.test\.(ts|tsx)$/.test(n)) out.push(rel);
  }
  return out;
}
/** Pure: offending apiRequest calls in one source. */
export function offenders(src) {
  const out = [];
  let i = 0;
  while ((i = src.indexOf("apiRequest", i)) >= 0) {
    const open = src.indexOf("(", i);
    if (open < 0) break;
    let depth = 0, j = open;
    for (; j < src.length; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") { depth--; if (depth === 0) break; }
    }
    const call = src.slice(open, j + 1);
    if (/\bbody:\s*JSON\.stringify\(/.test(call)) out.push(src.slice(0, i).split("\n").length);
    i = j + 1;
  }
  return out;
}
if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("double-encoded call caught", offenders(`return apiRequest<X>("/a", { method: "POST", body: JSON.stringify(body) });`).length === 1);
  ex("plain body passes", offenders(`return apiRequest<X>("/a", { method: "POST", body });`).length === 0);
  ex("raw fetch untouched", offenders(`await fetch("/a", { method: "POST", body: JSON.stringify(x) });`).length === 0);
  ex("nested generic call caught", offenders(`apiRequest<{ a: Array<{ b: string }> }>(withCompany("/x", c), { method: "POST", body: JSON.stringify({ a: f(1) }) })`).length === 1);
  console.log(ok ? `${LABEL} --selftest PASS (4/4)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}
const problems = [];
for (const f of files()) for (const line of offenders(readFileSync(resolve(ROOT, f), "utf8"))) problems.push(`${f}:${line} passes body: JSON.stringify(...) to apiRequest (double-encoded; server 400s).`);
if (problems.length) { console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
console.log(`${LABEL}: OK -- no apiRequest call double-encodes its body.`);
