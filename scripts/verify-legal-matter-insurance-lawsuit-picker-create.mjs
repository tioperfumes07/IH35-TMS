#!/usr/bin/env node
/**
 * verify-legal-matter-insurance-lawsuit-picker-create.mjs
 *
 * ENG-60: insurance.lawsuit is retired (0 rows). The insurance_lawsuit EntityPicker kind now
 * reads/writes legal.matters type=lawsuit and must NOT offer inline create into the dead table.
 * Create lawsuits in Legal › Lawsuits (legal.matters).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-matter-insurance-lawsuit-picker-create";

const FILES = {
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
};

function read(rel) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

function extractPicker(src, kind) {
  const re = new RegExp(`<EntityPicker[\\s\\S]*?kind="${kind}"[\\s\\S]*?\\/>`, "m");
  const m = src.match(re);
  return m ? m[0] : null;
}

function analyze(s) {
  const failures = [];
  const lawsuit = extractPicker(s.form, "insurance_lawsuit");
  if (!lawsuit) failures.push("LegalMatterFormFields missing insurance_lawsuit EntityPicker");
  else if (!/allowCreate=\{false\}/.test(lawsuit)) {
    failures.push("LegalMatterFormFields insurance_lawsuit must allowCreate={false} (ENG-60; create in Legal)");
  }

  const block = s.registry.match(/insurance_lawsuit:\s*\{[\s\S]*?\n  \},\n\n  legal_matter:/)?.[0] ?? "";
  if (!/readTable:\s*"legal\.matters"/.test(block) || !/writeTable:\s*"legal\.matters"/.test(block)) {
    failures.push("insurance_lawsuit registry must declare read/write legal.matters (ENG-60)");
  }
  if (!/inlineCreate:\s*\{\s*available:\s*false/.test(block)) {
    failures.push("entityPickerRegistry insurance_lawsuit.inlineCreate.available must be false (ENG-60)");
  }
  if (!/type:\s*"lawsuit"/.test(block)) {
    failures.push("insurance_lawsuit registry list must filter type=lawsuit");
  }

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = {
    form: `<EntityPicker kind="insurance_lawsuit" allowCreate={false} />`,
    registry: `insurance_lawsuit: {
    kind: "insurance_lawsuit",
    readTable: "legal.matters",
    writeTable: "legal.matters",
    inlineCreate: {
      available: false,
      reason: "Create in Legal",
    },
    async list(operatingCompanyId) {
      await legalMattersApi.list(operatingCompanyId, { type: "lawsuit" });
    },
  },

  legal_matter: {`,
  };
  const badForm = {
    ...good,
    form: `<EntityPicker kind="insurance_lawsuit" allowCreate />`,
  };
  if (analyze(good).length) fail(`selftest GOOD unexpected: ${analyze(good).join("; ")}`);
  if (!analyze(badForm).length) fail("selftest expected BAD form to fail");
  console.log(`${LABEL} selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const sources = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, read(f)]));
const failures = analyze(sources);
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — insurance_lawsuit picker → legal.matters type=lawsuit; no inline create (ENG-60)`);
