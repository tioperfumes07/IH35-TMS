#!/usr/bin/env node
import fs from "node:fs";

const target = "apps/frontend/src/pages/safety/TrainingRecordsPage.tsx";
const source = fs.readFileSync(target, "utf8");
const controls = [
  ["Completed date", "training-record-completed-date"],
  ["Expiry date (optional)", "training-record-expiry-date"],
];

function failures(candidate) {
  const found = [];
  for (const [label, id] of controls) {
    if (!candidate.includes(`<label htmlFor="${id}">${label}</label>`)) {
      found.push(`${label} label must target ${id}`);
    }
    if (!new RegExp(`<DatePicker\\s+[\\s\\S]*?id="${id}"[\\s\\S]*?data-testid="training-record-(?:completed|expiry)"`).test(candidate)) {
      found.push(`${label} DatePicker must expose ${id}`);
    }
  }
  if (/<span>Completed date<\/span>|<span>Expiry date \(optional\)<\/span>/.test(candidate)) {
    found.push("calendar labels must not remain unassociated spans");
  }
  return found;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    source.replace('htmlFor="training-record-completed-date"', 'htmlFor="training-record-completed-date-broken"'),
    source.replace('id="training-record-expiry-date"', 'id="training-record-expiry-date-broken"'),
  ];
  const caught = mutations.filter((candidate) => failures(candidate).length > 0).length;
  if (caught !== mutations.length) {
    console.error(`FAIL: caught ${caught}/${mutations.length} planted label defects`);
    process.exit(1);
  }
  console.log(`PASS: ${caught}/${mutations.length} planted Training Records label defects caught`);
}

const problems = failures(source);
if (problems.length) {
  console.error(problems.map((problem) => `FAIL: ${problem}`).join("\n"));
  process.exit(1);
}
console.log("PASS: Training Records calendar labels target their canonical DatePickers");
