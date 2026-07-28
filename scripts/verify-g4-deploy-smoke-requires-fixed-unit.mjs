#!/usr/bin/env node
/**
 * ACCT-R-04: production aggregate smoke must fail closed unless both fixed UUIDs are configured.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-g4-deploy-smoke-requires-fixed-unit";
const RENDER = path.join(ROOT, "render.yaml");
const SMOKE = path.join(ROOT, "scripts/ci-boot-aggregate-smoke.mjs");
const DOC = path.join(ROOT, "docs/testing/boot-aggregate-smoke-env.md");

function backendService(render) {
  const start = render.indexOf("name: ih35-tms-backend");
  if (start < 0) return "";
  const end = render.indexOf("\n  - type:", start);
  return end < 0 ? render.slice(start) : render.slice(start, end);
}

function validate({ render, smoke, doc }) {
  const errors = [];
  const backend = backendService(render);
  if (
    !/-\s*key:\s*IH35_SMOKE_REQUIRE_FIXED_UNIT\s*\n\s*value:\s*["']?true["']?\s*(?:\n|$)/.test(
      backend,
    )
  ) {
    errors.push("render.yaml must set IH35_SMOKE_REQUIRE_FIXED_UNIT=true on ih35-tms-backend");
  }

  const requirement = smoke.indexOf("const requireFixedUnit =");
  const failClosed = smoke.indexOf("if (requireFixedUnit)");
  const fallback = smoke.indexOf("const url = process.env.DATABASE_URL");
  if (requirement < 0 || !smoke.includes("IH35_SMOKE_REQUIRE_FIXED_UNIT")) {
    errors.push("aggregate smoke must derive requireFixedUnit from IH35_SMOKE_REQUIRE_FIXED_UNIT");
  }
  if (
    failClosed < 0 ||
    fallback < 0 ||
    failClosed > fallback ||
    !smoke.includes("fixed_smoke_target_required")
  ) {
    errors.push("aggregate smoke must fail closed before database unit discovery");
  }

  for (const token of [
    "IH35_SMOKE_REQUIRE_FIXED_UNIT=true",
    "IH35_SMOKE_UNIT_ID",
    "IH35_SMOKE_OPERATING_COMPANY_ID",
  ]) {
    if (!doc.includes(token)) errors.push(`smoke env doc must include ${token}`);
  }
  return errors;
}

function sources() {
  return {
    render: fs.readFileSync(RENDER, "utf8"),
    smoke: fs.readFileSync(SMOKE, "utf8"),
    doc: fs.readFileSync(DOC, "utf8"),
  };
}

function selftest() {
  const real = sources();
  const baseline = validate(real);
  if (baseline.length) throw new Error(`real source is invalid: ${baseline.join("; ")}`);

  const mutations = [
    {
      name: "Render requirement disabled",
      value: { ...real, render: real.render.replace('value: "true"', 'value: "false"') },
    },
    {
      name: "runtime fail-closed branch removed",
      value: { ...real, smoke: real.smoke.replace("if (requireFixedUnit)", "if (false)") },
    },
    {
      name: "operator contract removed",
      value: {
        ...real,
        doc: real.doc.replace("IH35_SMOKE_REQUIRE_FIXED_UNIT=true", "fixed target requirement"),
      },
    },
  ];
  for (const mutation of mutations) {
    if (validate(mutation.value).length === 0) {
      throw new Error(`selftest mutation did not fail: ${mutation.name}`);
    }
  }
  console.log(`${LABEL} --selftest PASS (${mutations.length} real-source mutations rejected)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const errors = validate(sources());
  if (errors.length) {
    console.error(`FAIL ${LABEL}:`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exit(1);
  }
  console.log(`OK ${LABEL}: production smoke requires the fixed unit/company pair.`);
}

main();
