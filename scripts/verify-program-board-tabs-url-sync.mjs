#!/usr/bin/env node
/**
 * verify-program-board-tabs-url-sync.mjs — Ops F: Program Board tabs use ?tab=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-program-board-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/program/ProgramBoardPage.tsx";

export function collectNoteSaveProblems(source) {
  const problems = [];
  if (/onSubmit\(body\);\s*setValue\(""\)/.test(source)) {
    problems.push(`${PAGE}: AddNote must not clear the draft before the save resolves`);
  }
  if (!/mutateAsync/.test(source)) {
    problems.push(`${PAGE}: program board notes must save via mutateAsync so a failed POST keeps the draft`);
  }
  if (!/Promise\.resolve\(onSubmit\(body\)\)\.then\(/.test(source)) {
    problems.push(`${PAGE}: AddNote must clear the draft only after onSubmit resolves`);
  }
  if (/onSubmit=\{\(body\) => mutation\.mutateAsync/.test(source)) {
    problems.push(`${PAGE}: onSubmit must return Promise<void> (async/await mutateAsync) — not Promise<BoardNote>`);
  }
  if ((source.match(/onSubmit=\{async \(body\) =>/g) ?? []).length < 3) {
    problems.push(`${PAGE}: all three note onSubmit sites must be async (body) => { await mutateAsync }`);
  }
  return problems;
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  for (const needle of [
    "useSearchParams",
    'searchParams.get("tab")',
    "parseProgramBoardTab",
    'params.set("tab", next)',
  ]) {
    if (!source.includes(needle)) throw new Error(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<TabId>("focus")')) {
    throw new Error(`${LABEL}: local tab useState still present in ${PAGE}`);
  }
  const noteProblems = collectNoteSaveProblems(source);
  if (noteProblems.length) throw new Error(`${LABEL}: ${noteProblems.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const good =
    'onSubmit={async (body) => { await mutation.mutateAsync({ kind: "idea", body }); }}\n' +
    'onSubmit={async (body) => { await mutation.mutateAsync({ kind: "answer", body }); }}\n' +
    'onSubmit={async (body) => { await mutation.mutateAsync({ kind: "note", body }); }}\n' +
    'void Promise.resolve(onSubmit(body)).then(() => setValue(""), () => undefined);';
  const bad =
    'onSubmit={(body) => mutation.mutateAsync({ kind: "idea", body })}\n' +
    'mutation.mutate({ kind: "idea", body });\n            onSubmit(body);\n            setValue("");';
  const goodOk = collectNoteSaveProblems(good).length === 0;
  const badHits = collectNoteSaveProblems(bad);
  if (!goodOk || badHits.length < 3) {
    console.error(`${LABEL}: selftest FAIL good=${goodOk} bad=${JSON.stringify(badHits)}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS`);
} else run();
