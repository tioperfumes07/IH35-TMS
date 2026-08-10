#!/usr/bin/env node
/**
 * verify-user-detail-tabs-url-sync.mjs — Ops F: User Detail tabs use ?tab=.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-user-detail-tabs-url-sync";
const PAGE = "apps/frontend/src/pages/UserDetail.tsx";

function audit(source) {
  const failures = [];
  for (const needle of ["useSearchParams", 'searchParams.get("tab")', "parseUserDetailTab", 'params.set("tab", next)']) {
    if (!source.includes(needle)) failures.push(`${LABEL}: missing ${JSON.stringify(needle)} in ${PAGE}`);
  }
  if (source.includes('useState<Tab>("profile")')) {
    failures.push(`${LABEL}: local tab useState still present in ${PAGE}`);
  }
  if (!/userDetailQuery\.isError[\s\S]{0,420}<ListErrorState[\s\S]{0,420}userDetailQuery\.refetch\(\)/.test(source)) {
    failures.push(`${LABEL}: user detail failure must render retryable ListErrorState`);
  }
  if (source.includes('{targetUser.default_company_id ?? "—"}')) failures.push(`${LABEL}: default company must not paint raw UUID`);
  return failures;
}

function run() {
  const failures = audit(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (failures.length) throw new Error(failures.join("\n"));
  console.log(`${LABEL}: PASS`);
}

if (process.argv.includes("--selftest")) {
  const source = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const broken = source.replace("userDetailQuery.refetch()", "noop()");
  if (!audit(broken).some((failure) => failure.includes("retryable ListErrorState"))) throw new Error(`${LABEL}: selftest missed retry removal`);
  if (audit(source).length) throw new Error(`${LABEL}: selftest live source rejected`);
  console.log(`${LABEL}: selftest PASS`);
}
else run();
