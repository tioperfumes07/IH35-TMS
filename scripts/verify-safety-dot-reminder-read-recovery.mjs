#!/usr/bin/env node
import fs from "node:fs";

const LABEL = "SAF-F6991 DOT reminder read recovery";
const REL = "apps/frontend/src/pages/safety/tabs/DOTComplianceTab.tsx";
const source = fs.readFileSync(new URL(`../${REL}`, import.meta.url), "utf8");

function audit(text) {
  const failures = [];
  const need = (pattern, message) => { if (!pattern.test(text)) failures.push(message); };
  need(/const reminders = remindersQ\.isError \? \[\] : remindersQ\.data \?\? \[\]/, "retained reminder rows must be suppressed on read failure");
  need(/disabled=\{acknowledgeMutation\.isPending \|\| remindersQ\.isLoading \|\| remindersQ\.isError\}/, "Dismiss must fail closed while the reminder read is failed");
  need(/\{remindersQ\.isError \? \([\s\S]*?<ListErrorState[\s\S]*?onRetry=\{\(\) => void remindersQ\.refetch\(\)\}[\s\S]*?\) : \([\s\S]*?<ParityTable<SafetyReminderRow>/, "failed reminder read must replace the retained table with exact Retry");
  need(/const sourceCounters = useMemo\([\s\S]*?for \(const row of orderedReminders\)/, "source counters must derive from the fail-closed reminder range");
  need(/Open \{orderedReminders\.length\}/, "Open count must derive from the fail-closed reminder range");
  return failures;
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["rows", source.replace("remindersQ.isError ? [] : remindersQ.data ?? []", "remindersQ.data ?? []")],
    ["dismiss", source.replace(" || remindersQ.isError}", "}")],
    ["retry", source.replace("onRetry={() => void remindersQ.refetch()}", "onRetry={undefined}")],
    ["table-gate", source.replace("{remindersQ.isError ? (", "{false ? (")],
    ["count", source.replace("Open {orderedReminders.length}", "Open {remindersQ.data?.length ?? 0}")],
  ];
  for (const [name, mutated] of mutations) {
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation escaped: ${name}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — failed reminder reads suppress retained rows, counts, actions and expose exact Retry`);
