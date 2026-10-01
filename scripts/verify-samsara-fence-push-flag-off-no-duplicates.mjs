#!/usr/bin/env node
/**
 * ROUND 306 E-07 addition — GUARD. Pushing our fences to Samsara:
 *   1. only with SAMSARA_FENCE_PUSH_ENABLED=true and explicitly named kinds;
 *   2. looks up ih35Site:<fence> before creating (never a duplicate Samsara address);
 *   3. excludes load-stop fences (the E-25 outbox owns those).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const FILE = resolve(ROOT, "apps/backend/src/integrations/samsara/geofences/fence-push.service.ts");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

export function check(raw) {
  const s = stripComments(raw);
  const p = [];
  if (!/process\.env\.SAMSARA_FENCE_PUSH_ENABLED === "true"/.test(s) || !/if \(!samsaraFencePushEnabled\(\)\) throw/.test(s)) p.push("fences can be pushed without SAMSARA_FENCE_PUSH_ENABLED.");
  if (!/if \(kinds\.length === 0\) throw/.test(s)) p.push("a push without explicit kinds is allowed.");
  const loop = s.slice(s.indexOf("for (const f of candidates)"));
  if (loop.indexOf("findAddressByExternalId(\"ih35Site\"") < 0 || loop.indexOf("findAddressByExternalId") > loop.indexOf("createAddress(")) p.push("an address is created without first looking up ih35Site (duplicates).");
  if (!/label !~ '\^load-\[0-9a-f-\]\{36\}-stop-\[0-9\]\+\$'/.test(s)) p.push("load-stop fences are no longer excluded.");
  return p;
}

function selftest() {
  const g = readFileSync(FILE, "utf8");
  const cases = [
    [g, false],
    [g.replace('process.env.SAMSARA_FENCE_PUSH_ENABLED === "true"', 'process.env.SAMSARA_FENCE_PUSH_ENABLED !== "false"'), true],
    [g.replace('const existing = await api.findAddressByExternalId("ih35Site", f.id);', "const existing = null;"), true],
    [g.replace("if (kinds.length === 0) throw", "if (false) throw"), true],
  ];
  return cases.every(([s, f]) => (check(s).length > 0) === f);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-samsara-fence-push-flag-off-no-duplicates selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const p = check(readFileSync(FILE, "utf8"));
  console.log(p.length ? `verify-samsara-fence-push-flag-off-no-duplicates FAILED:\n  - ${p.join("\n  - ")}` : "verify-samsara-fence-push-flag-off-no-duplicates: OK -- flag-OFF, explicit kinds, lookup before create, load-stop fences excluded.");
  process.exit(p.length ? 1 : 0);
}
