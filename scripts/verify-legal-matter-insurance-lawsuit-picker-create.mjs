#!/usr/bin/env node
/**
 * verify-legal-matter-insurance-lawsuit-picker-create.mjs
 * LV-LEGAL-MATTER-INSURANCE-LINK-PICKERS-NO-INLINE-CREATE
 *
 * Legal matter insurance_lawsuit picker must offer inline create that writes
 * insurance.lawsuits via LawsuitCreateModal (same R=W as claim path).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-legal-matter-insurance-lawsuit-picker-create";

const FILES = {
  form: "apps/frontend/src/pages/legal/matters/LegalMatterFormFields.tsx",
  registry: "apps/frontend/src/components/parity/entityPickerRegistry.ts",
  picker: "apps/frontend/src/components/parity/EntityPicker.tsx",
  modal: "apps/frontend/src/components/insurance/LawsuitCreateModal.tsx",
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
  else if (/allowCreate=\{false\}/.test(lawsuit) || !/\ballowCreate\b/.test(lawsuit)) {
    failures.push("LegalMatterFormFields insurance_lawsuit must allowCreate");
  }

  if (
    !/insurance_lawsuit:\s*\{[\s\S]*?inlineCreate:\s*\{\s*available:\s*true/.test(s.registry)
  ) {
    failures.push("entityPickerRegistry insurance_lawsuit.inlineCreate.available must be true");
  }
  if (
    !/readTable:\s*"insurance\.lawsuits"[\s\S]*?writeTable:\s*"insurance\.lawsuits"/.test(
      s.registry.match(/insurance_lawsuit:\s*\{[\s\S]*?\n  \},/)?.[0] ?? "",
    )
  ) {
    // softer check on full registry block
    const block = s.registry.match(/insurance_lawsuit:\s*\{[\s\S]*?\n  \},\n\n  legal_matter:/)?.[0] ?? "";
    if (!/readTable:\s*"insurance\.lawsuits"/.test(block) || !/writeTable:\s*"insurance\.lawsuits"/.test(block)) {
      failures.push("insurance_lawsuit registry must declare read/write insurance.lawsuits");
    }
  }

  if (!/import \{ LawsuitCreateModal \}/.test(s.picker)) {
    failures.push("EntityPicker must import LawsuitCreateModal");
  }
  if (
    !/kind === "insurance_lawsuit"[\s\S]{0,320}<LawsuitCreateModal[\s\S]{0,280}handleCreated\(id, label\)/.test(
      s.picker,
    )
  ) {
    failures.push("EntityPicker must mount LawsuitCreateModal and auto-select id/label");
  }

  if (
    !/onSuccess:\s*\(lawsuit(?:,\s*input)?\)[\s\S]{0,260}onCreated\(lawsuit\.id, lawsuit\.case_number\)/.test(s.modal)
  ) {
    failures.push("LawsuitCreateModal must return persisted id + case_number to onCreated");
  }

  return failures;
}

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const good = {
    form: `<EntityPicker kind="insurance_lawsuit" allowCreate />`,
    registry: `insurance_lawsuit: {
    kind: "insurance_lawsuit",
    readTable: "insurance.lawsuits",
    writeTable: "insurance.lawsuits",
    inlineCreate: {
      available: true,
    },
  },

  legal_matter: {`,
    picker: `import { LawsuitCreateModal } from "../insurance/LawsuitCreateModal";
      {createOffered && kind === "insurance_lawsuit" ? (
        <LawsuitCreateModal
          onCreated={(id, label) => (id ? handleCreated(id, label) : setCreateOpen(false))}
        />
      ) : null}`,
    modal: `onSuccess: (lawsuit) => {
      onCreated(lawsuit.id, lawsuit.case_number);
    },`,
  };
  const badForm = {
    ...good,
    form: `<EntityPicker kind="insurance_lawsuit" allowCreate={false} />`,
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
if (failures.length) fail(failures.join("; "));
console.log(`${LABEL} PASS — lawsuit picker inline create wired`);
