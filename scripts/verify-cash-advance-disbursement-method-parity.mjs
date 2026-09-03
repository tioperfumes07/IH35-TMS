#!/usr/bin/env node
/**
 * GO-21 B8 — cash-advance disbursement_method must be the SAME set everywhere. This is the exact
 * class of bug the owner's "not a stub, full vertical" order caught: "comchek" existed nowhere in
 * the codebase — not the create schema, not the mark-disbursed schema, not the create-modal
 * dropdown, not the mark-disbursed-modal dropdown — while "comdata" (a different card network)
 * was fully wired everywhere. A method present on one surface and missing on another either
 * silently rejects a real disbursement method the operator needs, or lets one leg accept a value
 * another leg's Zod schema then 400s on.
 *
 * Guard extracts the literal disbursement_method value set from 5 sources and asserts they're
 * all the SAME set (not a superset/subset — an exact match, since every surface must offer every
 * method):
 *   1) createAdvanceBodySchema's z.enum(...)              apps/backend/.../cash-advances.routes.ts
 *   2) markDisbursedBodySchema's z.enum(...)               apps/backend/.../cash-advances.routes.ts
 *   3) CreateDriverCashAdvanceCoreInput's TS union         apps/backend/.../cash-advance-create.ts
 *   4) CashAdvanceMethod TS union                          apps/frontend/.../api/cashAdvances.ts
 *   5) CreateAdvanceModal's METHOD_OPTIONS values          apps/frontend/.../CreateAdvanceModal.tsx
 *   6) MarkDisbursedModal's <option value="..."> values    apps/frontend/.../MarkDisbursedModal.tsx
 *
 * --selftest removes one value from one source in a scratch copy and expects a mismatch.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advance-disbursement-method-parity";

const SOURCES = [
  {
    file: "apps/backend/src/cash-advances/cash-advances.routes.ts",
    label: "createAdvanceBodySchema z.enum",
    extract: (src) => {
      const m = /disbursement_method:\s*z\.enum\(\[([^\]]+)\]\)(?!\.optional)/.exec(src);
      return m ? m[1] : null;
    },
  },
  {
    file: "apps/backend/src/cash-advances/cash-advances.routes.ts",
    label: "markDisbursedBodySchema z.enum",
    extract: (src) => {
      const m = /disbursement_method:\s*z\.enum\(\[([^\]]+)\]\)\.optional/.exec(src);
      return m ? m[1] : null;
    },
  },
  {
    file: "apps/backend/src/cash-advances/cash-advance-create.ts",
    label: "CreateDriverCashAdvanceCoreInput TS union",
    extract: (src) => {
      const m = /disbursement_method:\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+");/.exec(src);
      return m ? m[1].replace(/\s*\|\s*/g, ", ") : null;
    },
  },
  {
    file: "apps/frontend/src/api/cashAdvances.ts",
    label: "CashAdvanceMethod TS union",
    extract: (src) => {
      const m = /export type CashAdvanceMethod\s*=\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+");/.exec(src);
      return m ? m[1].replace(/\s*\|\s*/g, ", ") : null;
    },
  },
  {
    file: "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx",
    label: "METHOD_OPTIONS",
    extract: (src) => {
      const block = /const METHOD_OPTIONS[\s\S]*?\];/.exec(src);
      if (!block) return null;
      return [...block[0].matchAll(/value:\s*"([a-z_]+)"/g)].map((m) => `"${m[1]}"`).join(", ");
    },
  },
  {
    file: "apps/frontend/src/pages/cash-advances/components/MarkDisbursedModal.tsx",
    label: "<SelectCombobox> disbursement-method <option>s",
    extract: (src) => {
      const block = /<span>Disbursement Method<\/span>[\s\S]*?<\/SelectCombobox>/.exec(src);
      if (!block) return null;
      return [...block[0].matchAll(/<option value="([a-z_]+)">/g)].map((m) => `"${m[1]}"`).join(", ");
    },
  },
];

function parseLiteralSet(literalList) {
  return new Set([...literalList.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

/** @param {string} root */
export function check(root = ROOT) {
  const errors = [];
  const found = [];
  for (const src of SOURCES) {
    const filePath = path.join(root, src.file);
    if (!fs.existsSync(filePath)) {
      errors.push(`${src.file}: not found`);
      continue;
    }
    const text = fs.readFileSync(filePath, "utf8");
    const literalList = src.extract(text);
    if (!literalList) {
      errors.push(`${src.file} (${src.label}): could not locate the disbursement_method value list — pattern drift, update the guard`);
      continue;
    }
    found.push({ ...src, values: parseLiteralSet(literalList) });
  }
  if (errors.length) return errors;

  const reference = found[0];
  for (const s of found.slice(1)) {
    if (!setsEqual(reference.values, s.values)) {
      const missingHere = [...reference.values].filter((v) => !s.values.has(v));
      const extraHere = [...s.values].filter((v) => !reference.values.has(v));
      errors.push(
        `${s.file} (${s.label}) disbursement_method set != ${reference.file} (${reference.label}): ` +
          `missing [${missingHere.join(", ")}], extra [${extraHere.join(", ")}]`
      );
    }
  }
  return errors;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(ROOT, "tmp-disb-method-"));
  let failMsg = null;
  try {
    for (const src of SOURCES) {
      const dest = path.join(tmp, src.file);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(ROOT, src.file), dest);
    }
    // Plant: strip "comchek" from ONLY the frontend METHOD_OPTIONS source.
    const modalPath = path.join(tmp, "apps/frontend/src/pages/cash-advances/components/CreateAdvanceModal.tsx");
    let modalSrc = fs.readFileSync(modalPath, "utf8");
    modalSrc = modalSrc.replace(/\s*\{ value: "comchek"[^}]*\},/, "");
    fs.writeFileSync(modalPath, modalSrc);

    const errs = check(tmp);
    if (!errs.some((e) => e.includes("CreateAdvanceModal.tsx"))) {
      failMsg = `${LABEL} selftest FAIL — planted mismatch (comchek dropped from METHOD_OPTIONS) did not redden`;
    } else {
      console.log(`${LABEL} selftest PASS — planted mismatch correctly reddened`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (failMsg) {
    console.error(failMsg);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = check();
if (errors.length) {
  console.error(`${LABEL} FAIL:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — disbursement_method is the same set across all 6 backend + frontend surfaces`);
