#!/usr/bin/env node

/**
 * @matrix-built safety:events.list:{connectivity,reverse_link}
 * SAF-F7531: mounted Safety Events reads fail visibly and expose exact recovery.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const relative = "apps/frontend/src/pages/safety/SafetyEventsPage.tsx";
const original = fs.readFileSync(path.join(process.cwd(), relative), "utf8");

const contracts = [
  ["kpiQuery", "safety-events-kpi-error", "Safety event totals"],
  ["eventsQuery", "safety-events-list-error", "Safety event list"],
  ["detailQuery", "safety-event-detail-error", "list snapshot"],
  ["notesQuery", "safety-event-notes-error", "Event notes"],
];

function failures(source) {
  const found = [];
  for (const [query, testId, context] of contracts) {
    if (!source.includes(`${query}.isError ? (`)) found.push(`${query} failure is not rendered`);
    if (!source.includes(`data-testid="${testId}"`)) found.push(`${query} failure has no stable test id`);
    if (!source.includes(`${query}.refetch()`)) found.push(`${query} failure has no exact Retry`);
    if (!source.includes(context)) found.push(`${query} failure lost consumer-specific context`);
  }
  if (!source.includes("<LoadSuggestionReadError query={suggestionQuery} />")) {
    found.push("load suggestion must retain the shared recoverable read boundary");
  }
  if (!source.includes("detailQuery.data ?? allRows.find")) {
    found.push("exact detail failure must retain the populated list snapshot fallback");
  }
  return found;
}

const baseline = failures(original);
if (baseline.length) {
  console.error(`verify-safety-events-read-recovery: FAIL\n- ${baseline.join("\n- ")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    ...contracts.map(([query]) => ({
      name: `${query} error boundary`,
      from: `${query}.isError ? (`,
      to: `${query}.isPending ? (`,
    })),
    {
      name: "shared suggestion recovery",
      from: "<LoadSuggestionReadError query={suggestionQuery} />",
      to: "<div />",
    },
    {
      name: "detail list snapshot fallback",
      from: "detailQuery.data ?? allRows.find",
      to: "detailQuery.data ?? null ?? allRows.find",
    },
  ];
  const survivors = [];
  for (const mutation of mutations) {
    const mutated = original.replace(mutation.from, mutation.to);
    if (mutated === original || failures(mutated).length === 0) survivors.push(mutation.name);
  }
  if (survivors.length) {
    console.error(`verify-safety-events-read-recovery: SELFTEST FAIL — surviving mutations: ${survivors.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-safety-events-read-recovery: SELFTEST PASS — ${mutations.length}/${mutations.length} read-recovery mutations rejected`);
  process.exit(0);
}

console.log("verify-safety-events-read-recovery: PASS — list, KPIs, exact detail, notes, and load suggestion fail visibly with recovery");
