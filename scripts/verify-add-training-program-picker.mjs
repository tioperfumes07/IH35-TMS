#!/usr/bin/env node
/** LST-F156 — AddTrainingModal program field is Combobox with + Add new program (not bare <select>). */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-add-training-program-picker";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/frontend/src/components/drivers/AddTrainingModal.tsx";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function assertSrc(src) {
  const problems = [];
  const code = stripComments(src);
  if (!/data-testid="add-training-program"/.test(code)) {
    problems.push("missing add-training-program testid");
  }
  if (!/allowAddNew=\{\{[\s\S]*label:\s*"\+ Add new program"/.test(code)) {
    problems.push("missing + Add new program allowAddNew");
  }
  const block = code.match(/data-testid="add-training-program"[\s\S]{0,2600}?add-training-completed/)?.[0];
  if (!block) problems.push("could not locate training program picker block");
  else if (/<select[\s>]/.test(block)) problems.push("training program picker still uses bare <select>");
  else if (!/<Combobox[\s\S]{0,500}?allowAddNew=/.test(block)) {
    problems.push("training program field is not Combobox+allowAddNew");
  }
  if (!/programsQuery\.isError[\s\S]{0,500}Couldn't load existing training programs[\s\S]{0,300}programsQuery\.refetch\(\)/.test(code)) {
    problems.push("failed training-program GET must expose exact retry");
  }
  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const live = read();
  const planted = live
    .replace(/allowAddNew=\{\{[\s\S]*?\}\}/, "")
    .replace(
      /data-testid="add-training-program"/,
      'data-testid="add-training-program"><select value={trainingName}',
    );
  if (!assertSrc(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect not caught`);
    process.exit(1);
  }
  const retryRemoved = live.replace("programsQuery.refetch()", "programRetryRemoved()");
  if (retryRemoved === live || !assertSrc(retryRemoved).some((problem) => problem.includes("exact retry"))) {
    console.error(`${LABEL} SELFTEST FAILED: retry-removal mutation not caught`);
    process.exit(1);
  }
  const problems = assertSrc(live);
  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${problems.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — picker and retry mutations caught`);
  process.exit(0);
}

const problems = assertSrc(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
