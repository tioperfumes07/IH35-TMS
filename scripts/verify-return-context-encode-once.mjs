#!/usr/bin/env node
/**
 * verify-return-context-encode-once — LEAD 11-13 (board 21 live certification finding).
 * Live /legal on b444335: ret=%252Flegal on one hop and %2525252F on the next — withReturnContext passed an
 * already-encodeURIComponent'd value into URLSearchParams, so every hop doubled the escaping.
 *   1. withReturnContext stores the plain href (URLSearchParams escapes once);
 *   2. decodeReturnContext returns a value that already starts with "/" as-is (never decodes a nested ret again);
 *   3. legacy "%2F…" values still decode once.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-return-context-encode-once";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/lib/returnContext.ts";

export function check(src) {
  const f = [];
  if (!src) return ["returnContext.ts missing"];
  if (/params\.set\(RETURN_PARAM, encodeReturnContext\(/.test(src)) f.push("withReturnContext double-encodes ret (encodeReturnContext inside URLSearchParams)");
  if (!/params\.set\(RETURN_PARAM, originHref\.startsWith\("\/"\) \? originHref : `\/\$\{originHref\}`\);/.test(src)) f.push("withReturnContext does not store the plain href");
  if (!/if \(value\.startsWith\("\/"\)\) return safeInternalHref\(value\);/.test(src)) f.push("decodeReturnContext decodes an already-plain href again");
  if (!/return safeInternalHref\(decodeURIComponent\(value\)\);/.test(src)) f.push("legacy %2F values no longer decode");
  return f;
}

function selftest(live) {
  const cases = [
    ["double encode back", live.replace('params.set(RETURN_PARAM, originHref.startsWith("/") ? originHref : `/${originHref}`);', "params.set(RETURN_PARAM, encodeReturnContext(originHref));")],
    ["re-decode plain", live.replace('if (value.startsWith("/")) return safeInternalHref(value);', "")],
    ["legacy dropped", live.replace("return safeInternalHref(decodeURIComponent(value));", "return null;")],
    ["file deleted", ""],
  ];
  let pass = check(live).length === 0 ? 1 : 0;
  if (!pass) console.error(`${LABEL} --selftest: live tree fails`, check(live));
  for (const [name, src] of cases) { if (check(src).length > 0) pass += 1; else console.error(`${LABEL} --selftest: did not catch "${name}"`); }
  const total = cases.length + 1;
  if (pass !== total) { console.error(`${LABEL} --selftest FAIL ${pass}/${total}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${pass}/${total}`);
}

const abs = path.join(ROOT, FILE);
const live = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
if (process.argv.includes("--selftest")) selftest(live);
else {
  const f = check(live);
  if (f.length) { for (const x of f) console.error(`${LABEL}: FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ret is escaped once per hop; plain hrefs are never decoded twice; legacy links resolve`);
}
