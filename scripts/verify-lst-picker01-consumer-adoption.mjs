#!/usr/bin/env node
/**
 * LST-PICKER-01 close — every catalogPickerRegistry entry with consumerPath MUST wire
 * ReferenceSelect createKind={key} in each documented consumer file.
 *
 *   node scripts/verify-lst-picker01-consumer-adoption.mjs
 *   node scripts/verify-lst-picker01-consumer-adoption.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRegistryEntries } from "./verify-catalog-picker-registry-parity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-consumer-adoption";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const REFERENCE_SELECT = "apps/frontend/src/components/parity/ReferenceSelect.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** @param {{ registry?: string, referenceSelect?: string }} [overrides] */
export function collectProblems(overrides = {}) {
  const problems = [];
  const registrySrc = overrides.registry ?? read(REGISTRY);
  const code = stripComments(registrySrc);
  const referenceSelect = stripComments(overrides.referenceSelect ?? read(REFERENCE_SELECT));

  // P23 / QB-STD-1..5: consumer adoption is not enough. The shared primitive must keep the
  // complete create-return-reload contract or every adopted consumer regresses at once.
  const primitiveContracts = [
    [/allowAddNew=\{\{[\s\S]*?onAdd:\s*\(\)\s*=>\s*setCreateOpen\(true\)/, "must keep + Add new inside the Combobox dropdown"],
    [/const comboOptions[^;]*\[\.\.\.options,\s*\.\.\.created\]/, "must retain newly-created options while the canonical list refetches"],
    [/setCreated\(\(prev\)\s*=>\s*\[\.\.\.prev,\s*opt\]\)/, "must append the created canonical row to the picker options"],
    [/onOptionCreated\?\.\(opt\)/, "must notify the consumer so its canonical query can refetch"],
    [/onChange\(selected\)/, "must return with the created row selected"],
    [/createdValueField\s*===\s*["']code["'][\s\S]*?rec\.code[\s\S]*?rec\.id/, "must select by code when the reloaded canonical options are code-keyed"],
    [/operatingCompanyId=\{operatingCompanyId\}/, "must pass entity scope into the inline creator"],
  ];
  for (const [pattern, message] of primitiveContracts) {
    if (!pattern.test(referenceSelect)) problems.push(`${REFERENCE_SELECT}: ${message} (P23 picker-law contract)`);
  }

  for (const { key, block } of parseRegistryEntries(code)) {
    const consumerMatch = block.match(/consumerPath:\s*(?:\[([\s\S]*?)\]|"([^"]+)")/);
    if (!consumerMatch) continue;

    const paths = consumerMatch[1]
      ? [...consumerMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1])
      : [consumerMatch[2]];

    const kindPattern = new RegExp(`createKind=["']${key}["']`);

    for (const rel of paths) {
      const abs = path.join(ROOT, rel);
      if (!fs.existsSync(abs)) {
        problems.push(`${REGISTRY}[${key}]: consumerPath missing on disk: ${rel}`);
        continue;
      }
      const consumerCode = stripComments(read(rel));
      if (!/ReferenceSelect/.test(consumerCode)) {
        problems.push(`${rel}: must use ReferenceSelect for createKind=${key}`);
      }
      if (!kindPattern.test(consumerCode)) {
        problems.push(`${rel}: missing ReferenceSelect createKind="${key}" (LST-PICKER-01 consumer adoption)`);
      }
    }
  }

  const withConsumer = parseRegistryEntries(code).filter((e) => /consumerPath:/.test(e.block)).length;
  if (withConsumer < 20) {
    problems.push(`${REGISTRY}: expected >=20 consumerPath entries, found ${withConsumer}`);
  }

  return problems;
}

const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (IS_MAIN && process.argv.includes("--selftest")) {
  const broken = `${read(REGISTRY).slice(0, 800)}\n  fake_key: catalogEntry({ key: "fake_key", label: "x", table: "catalogs.x", endpoint: "/x", evidence: "apps/x.ts:1", consumerPath: "apps/frontend/src/pages/Home.tsx" }),\n`;
  if (collectProblems({ registry: broken }).length === 0) {
    console.error(`${LABEL} --selftest FAIL: broken fixture not flagged`);
    process.exit(1);
  }
  const referenceSelect = read(REFERENCE_SELECT);
  const mutations = [
    ["first-row create", referenceSelect.replace("allowAddNew={{", "externalAddButton={{")],
    ["create-return selection", referenceSelect.replace("onChange(selected);", "onChange(null);")],
    ["reload/refetch retention", referenceSelect.replace("[...options, ...created]", "[...options]")],
    ["canonical refetch notification", referenceSelect.replace("onOptionCreated?.(opt);", "")],
    ["entity scope", referenceSelect.replaceAll("operatingCompanyId={operatingCompanyId}", "operatingCompanyId={undefined}")],
  ];
  for (const [name, mutated] of mutations) {
    if (collectProblems({ referenceSelect: mutated }).length === 0) {
      console.error(`${LABEL} --selftest FAIL: ${name} mutation was not flagged`);
      process.exit(1);
    }
  }
  const real = collectProblems();
  if (real.length) {
    console.error(`${LABEL} --selftest FAIL on real tree:`, real);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} P23 primitive mutations caught`);
  process.exit(0);
}

if (IS_MAIN) {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — all consumerPath entries wire createKind and the shared picker preserves first-row create → selected → canonical refetch/reload`);
}
