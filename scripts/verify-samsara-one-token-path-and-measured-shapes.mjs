#!/usr/bin/env node
/**
 * ROUND 306 E-10..E-12 — GUARD.
 * FAILS IF:
 *   1. any backend file decrypts the Samsara token itself (decryptSamsaraSecret(readEncryptedToken(...)))
 *      instead of the ONE resolver (integrations/samsara/samsara-token.ts) with its SAMSARA_API_TOKEN fallback;
 *   2. the fault parser stops reading the measured faultCodes.j1939.diagnosticTroubleCodes object shape;
 *   3. /fleet/safety-events is requested with limit > 200 (Samsara 400s every call);
 *   4. the harsh-event label map loses the measured "braking" label, or a harsh event takes the poll time.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC = resolve(ROOT, "apps/backend/src");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") && !p.endsWith(".test.ts") && !p.includes("__tests__")) out.push(p);
  }
  return out;
}

export function check(files) {
  const p = [];
  for (const [path, raw] of Object.entries(files.all)) {
    if (/decryptSamsaraSecret\(readEncryptedToken\(/.test(stripComments(raw))) p.push(`${path.replace(ROOT + "/", "")} decrypts the Samsara token itself -- use resolveSamsaraApiToken.`);
  }
  const tok = stripComments(files.token);
  if (!/process\.env\.SAMSARA_API_TOKEN/.test(tok)) p.push("resolveSamsaraApiToken lost its SAMSARA_API_TOKEN fallback.");
  const fault = stripComments(files.fault);
  if (!/j1939\?\.diagnosticTroubleCodes/.test(fault) || !/`SPN \$\{String\(d\.spnId\)\} FMI \$\{String\(d\.fmiId\)\}`/.test(fault)) p.push("the fault parser no longer reads faultCodes.j1939.diagnosticTroubleCodes.");
  if (!/endpoint === "\/fleet\/safety-events" \? "200" : "512"/.test(stripComments(files.client))) p.push("/fleet/safety-events is requested with limit > 200.");
  const harsh = stripComments(files.harsh);
  if (!/\["braking", "harsh_brake"\]/.test(harsh)) p.push("the measured 'braking' label is no longer mapped.");
  if (/occurred_at \?\? new Date\(\)\.toISOString\(\)/.test(harsh)) p.push("a harsh event can take the poll time.");
  return p;
}

function load() {
  const all = {};
  for (const f of walk(SRC)) all[f] = readFileSync(f, "utf8");
  const r = (x) => readFileSync(resolve(SRC, x), "utf8");
  return { all, token: r("integrations/samsara/samsara-token.ts"), fault: r("integrations/samsara/fault-code-processor.service.ts"), client: r("integrations/samsara/samsara-client.ts"), harsh: r("safety/harsh-events-poll.cron.ts") };
}

function selftest() {
  const g = load();
  const cases = [
    [g, false],
    [{ ...g, all: { ...g.all, x: "const t = decryptSamsaraSecret(readEncryptedToken(cfg));" } }, true],
    [{ ...g, fault: g.fault.replace("j1939?.diagnosticTroubleCodes", "j1939?.x") }, true],
    [{ ...g, client: g.client.replace('endpoint === "/fleet/safety-events" ? "200" : "512"', '"512"') }, true],
    [{ ...g, harsh: g.harsh.replace('["braking", "harsh_brake"]', '["x", "harsh_brake"]') }, true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-one-token-path-and-measured-shapes selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(load());
  console.log(p.length ? `verify-samsara-one-token-path-and-measured-shapes FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-one-token-path-and-measured-shapes: OK -- one token resolver, measured fault + safety-event shapes.");
  process.exit(p.length ? 1 : 0);
}
