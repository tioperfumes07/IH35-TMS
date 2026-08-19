#!/usr/bin/env node
/**
 * PreDispatchValidationPanel must expose EntityLinks for selected driver/unit/trailer/customer
 * (Exact Leaves dispatch.panel.pre_dispatch_validation:unit|trailer|customer).
 *
 * FAIL: UUID query params only — no EntityLink strip.
 * PASS: data-testid=pre-dispatch-validation-entitylinks with EntityLink kinds.
 *
 * Self-test: node scripts/verify-pre-dispatch-validation-entitylinks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-pre-dispatch-validation-entitylinks";
const FILE = path.join(ROOT, "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx");

function assert(cond, msg) {
  if (!cond) throw new Error(`${LABEL}: ${msg}`);
}

function checkSource(src) {
  assert(/EntityLinkOrTombstone/.test(src), "must import/use EntityLinkOrTombstone");
  assert(
    /data-testid=["']pre-dispatch-validation-entitylinks["']/.test(src),
    "must expose pre-dispatch-validation-entitylinks"
  );
  for (const [kind, id, name, noun] of [
    ["driver", "driverUuid", "driverLabel", "Driver"],
    ["unit", "unitUuid", "unitLabel", "Unit"],
    ["trailer", "trailerUuid", "trailerLabel", "Trailer"],
    ["customer", "customerId", "customerLabel", "Customer"],
  ]) {
    assert(src.includes(`<EntityLinkOrTombstone kind="${kind}" id={${id}} name={${name}} noun="${noun}"`), `must use unresolved-safe ${kind} drill`);
  }
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const mutations = [
    [/data-testid=["']pre-dispatch-validation-entitylinks["']/, 'data-testid="planted-missing"'],
    [/name=\{driverLabel\}/, "name={null}"],
    [/name=\{unitLabel\}/, "name={null}"],
    [/name=\{trailerLabel\}/, "name={null}"],
    [/name=\{customerLabel\}/, "name={null}"],
  ];
  for (const [pattern, replacement] of mutations) {
    const broken = original.replace(pattern, replacement);
    assert(broken !== original, "--selftest plant must mutate source");
    let failed = false;
    try { checkSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length} mutations)`);
}

const mode = process.argv.includes("--selftest") ? "selftest" : "check";
try {
  if (mode === "selftest") selftest();
  else {
    check();
    console.log(`${LABEL}: OK`);
  }
} catch (e) {
  console.error(String(e?.message || e));
  process.exit(1);
}
