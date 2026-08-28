#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["driver","connectivity"],"leaves":["dispatch.panel.pre_dispatch_validation"],"task":"DSP-F7075-HOS-VALIDATION-FAILURE-VISIBLE","vertical":"class-sweep"} */
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
const SERVICE_FILE = path.join(ROOT, "apps/backend/src/dispatch/validation/pre-dispatch-validator.service.ts");

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

function checkServiceSource(src) {
  const unavailable = src.match(/rule_id: "WF-HOS-UNAVAILABLE"[\s\S]{0,700}?validation_status: "unavailable"[\s\S]{0,80}?\}/)?.[0] ?? "";
  assert(unavailable, "failed HOS reads must emit a bounded WF-HOS-UNAVAILABLE item");
  assert(unavailable.includes('severity: "warn"'), "HOS unavailable must remain visible without inventing a hard block");
  assert(unavailable.includes('validation_status: "unavailable"'), "HOS unavailable evidence must name its status");
  assert(unavailable.includes('driver_id: driverUuid'), "HOS unavailable evidence must retain driver identity");
  assert(unavailable.includes('operating_company_id: operatingCompanyId'), "HOS unavailable evidence must retain company identity");
  assert(!/HOS data unavailable[^\n]*skip silently/.test(src), "HOS failures must never be swallowed as a clean result");
}

function check() {
  checkSource(fs.readFileSync(FILE, "utf8"));
  checkServiceSource(fs.readFileSync(SERVICE_FILE, "utf8"));
}

function selftest() {
  const original = fs.readFileSync(FILE, "utf8");
  const serviceOriginal = fs.readFileSync(SERVICE_FILE, "utf8");
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
  const serviceMutations = [
    [/rule_id: "WF-HOS-UNAVAILABLE"/, 'rule_id: "WF-HOS-VIOLATION"'],
    [/validation_status: "unavailable"/, 'validation_status: "clear"'],
    [/rule_id: "WF-HOS-UNAVAILABLE"([\s\S]{0,500}?)driver_id: driverUuid/, 'rule_id: "WF-HOS-UNAVAILABLE"$1driver_id: null'],
    [/rule_id: "WF-HOS-UNAVAILABLE"([\s\S]{0,500}?)operating_company_id: operatingCompanyId/, 'rule_id: "WF-HOS-UNAVAILABLE"$1operating_company_id: null'],
    [/[\s\S]*?\} catch \(error\) \{[\s\S]*?\n  \}\n\n  return \[\];/, '\n  } catch {\n    // HOS data unavailable — skip silently.\n  }\n\n  return [];'],
  ];
  for (const [pattern, replacement] of serviceMutations) {
    const broken = serviceOriginal.replace(pattern, replacement);
    assert(broken !== serviceOriginal, `--selftest service plant must mutate source: ${pattern}`);
    let failed = false;
    try { checkServiceSource(broken); } catch { failed = true; }
    assert(failed, `--selftest expected service FAIL for ${pattern}`);
  }
  check();
  console.log(`${LABEL}: OK — selftest PASS (${mutations.length + serviceMutations.length} mutations)`);
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
