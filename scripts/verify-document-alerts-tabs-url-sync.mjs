#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-document-alerts-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/alerts/DocumentAlertsPage.tsx";

function failures(source) {
  const errors = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseDocumentAlertsTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  if (source.includes('useState<"inbox" | "rules">("inbox")')) {
    errors.push("local tab useState still present");
  }
  for (const needle of [
    'title="Couldn\'t load document alerts"',
    "onRetry={() => void inboxQuery.refetch()}",
    'title="Couldn\'t load document alert rules"',
    "onRetry={() => void rulesQuery.refetch()}",
    "!inboxQuery.isError",
  ]) {
    if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  }
  return errors;
}

function run() {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const errors = failures(source);
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
if (process.argv.includes("--selftest")) {
  const good = `useSearchParams searchParams.get("tab") parseDocumentAlertsTab params.set("tab", next)
    title="Couldn't load document alerts" onRetry={() => void inboxQuery.refetch()}
    title="Couldn't load document alert rules" onRetry={() => void rulesQuery.refetch()} !inboxQuery.isError`;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed`);
  const mutations = [
    "useSearchParams",
    'title="Couldn\'t load document alerts"',
    "onRetry={() => void inboxQuery.refetch()}",
    'title="Couldn\'t load document alert rules"',
    "onRetry={() => void rulesQuery.refetch()}",
    "!inboxQuery.isError",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  console.log(`${LABEL}: selftest PASS (${mutations.length} mutations caught)`);
} else run();
