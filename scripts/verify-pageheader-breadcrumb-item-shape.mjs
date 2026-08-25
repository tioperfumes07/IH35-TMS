#!/usr/bin/env node
/**
 * MAINT-F-BREADCRUMB-STRING-TYPE-BLOCKING-CI (systemic) — `components/forms/shared/PageHeader`
 * (the smart-back-capable variant adopted across ~24 pages by several concurrent back-button PRs
 * this session -- #15871 for 11 maintenance leaf pages, plus 13 more independently-introduced
 * occurrences across admin/alerts/dispatch/reports/safety) types its `breadcrumb` prop as
 * `BreadcrumbItem[]` (`{ label: string; href?: string }[]`), NOT `string[]` -- the sibling
 * `components/layout/PageHeader` and `components/layout/BackArrowHeader` both use `string[]` for
 * the same-named prop, so a caller that "graduates" to the smart-back variant to gain `backHref`
 * support can pass the exact same-looking `breadcrumb={["A", "B"]}` array it always used and get a
 * silent TS2322 at compile time -- a hard, repo-wide `build-typecheck`/`typecheck-merge-result`
 * blocker (confirmed twice this session, 22 errors across 11 files then 26 more across 13 more
 * files, each from a different concurrent author making the identical mistake independently).
 *
 * This guard statically scans every file that imports `forms/shared/PageHeader` and fails if any
 * `breadcrumb={[` value is a raw string-array literal (`["..."`) instead of an object-array
 * literal (`[{`) -- the exact shape mismatch, before it ever reaches `tsc`.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const IMPORT_MARKER = 'forms/shared/PageHeader"';
const BAD_PATTERN = /breadcrumb=\{\[\s*"/;

function listCandidateFiles() {
  const out = execSync(
    `grep -rl '${IMPORT_MARKER}' apps/frontend/src --include='*.tsx'`,
    { encoding: "utf8" },
  );
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

export function auditFile(text) {
  return BAD_PATTERN.test(text);
}

export function run() {
  const files = listCandidateFiles();
  const failures = [];
  for (const f of files) {
    const text = fs.readFileSync(f, "utf8");
    if (auditFile(text)) failures.push(f);
  }
  return { files, failures };
}

if (process.argv.includes("--selftest")) {
  const good = 'import { PageHeader } from "../../components/forms/shared/PageHeader";\nbreadcrumb={[{ label: "A" }, { label: "B" }]}';
  const bad = 'import { PageHeader } from "../../components/forms/shared/PageHeader";\nbreadcrumb={["A", "B"]}';
  if (auditFile(bad) !== true) throw new Error("selftest FAIL: known-bad string[] literal was not detected");
  if (auditFile(good) !== false) throw new Error("selftest FAIL: known-good BreadcrumbItem[] literal was flagged");
  console.log("verify-pageheader-breadcrumb-item-shape SELFTEST PASS — 2/2 fixtures correctly classified");
}

const { files, failures } = run();
if (failures.length) {
  console.error(
    `verify-pageheader-breadcrumb-item-shape FAIL — ${failures.length}/${files.length} forms/shared/PageHeader ` +
      `caller(s) pass a raw string[] to breadcrumb (must be BreadcrumbItem[] = { label, href? }[]):\n` +
      failures.map((f) => `  - ${f}`).join("\n"),
  );
  process.exit(1);
}
console.log(`verify-pageheader-breadcrumb-item-shape PASS — ${files.length} forms/shared/PageHeader caller(s), all breadcrumb props are BreadcrumbItem[]`);
