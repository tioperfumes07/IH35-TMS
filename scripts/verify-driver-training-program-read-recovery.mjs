#!/usr/bin/env node
import fs from "node:fs";

const file = "apps/frontend/src/components/drivers/AddTrainingModal.tsx";

function verify(source) {
  const failures = [];
  const programPicker = source.match(/<Combobox[\s\S]*?\/>/)?.[0] ?? "";
  const rules = [
    [
      /deriveProgramNames\(programsQuery\.isError \? \[\] : programsQuery\.data\?\.training_completions \?\? \[\]\)/,
      "failed program reads must suppress React Query's retained training choices",
    ],
    [
      /if \(programsQuery\.isError\) \{[\s\S]*?Retry the program list before creating a record\.[\s\S]*?return;/,
      "submit must fail closed even if stale form state survived a rejected refetch",
    ],
    [
      /<Button type="submit" loading=\{pending\} disabled=\{programsQuery\.isError\}/,
      "create action must remain disabled until the program catalog recovers",
    ],
    [
      /onRetry=\{\(\) => void programsQuery\.refetch\(\)\}/,
      "read failure must expose an exact Retry for the canonical program query",
    ],
  ];
  for (const [pattern, message] of rules) {
    if (!pattern.test(source)) failures.push(message);
  }
  if (!programPicker.includes('placeholder="Select program"') || !programPicker.includes("disabled={programsQuery.isError}")) {
    failures.push("program picker must be disabled while the canonical scoped read is failed");
  }
  return failures;
}

const source = fs.readFileSync(file, "utf8");
const failures = verify(source);
if (failures.length) {
  console.error(`driver training program read recovery guard failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace("programsQuery.isError ? [] :", "false ? [] :"),
    source.replace(
      'placeholder="Select program"\n            loading={programsQuery.isLoading}\n            disabled={programsQuery.isError}',
      'placeholder="Select program"\n            loading={programsQuery.isLoading}\n            disabled={false}',
    ),
    source.replace("if (programsQuery.isError) {", "if (false) {"),
    source.replace('loading={pending} disabled={programsQuery.isError}', 'loading={pending} disabled={false}'),
    source.replace("onRetry={() => void programsQuery.refetch()}", "onRetry={() => undefined}"),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === source || verify(mutation).length === 0) {
      console.error(`driver training program guard selftest mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`driver training program read recovery guard selftest PASS (${mutations.length}/5)`);
}

console.log("driver training program read recovery guard PASS");
