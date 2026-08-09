#!/usr/bin/env node
/** LST-F139 / CU-09 — shared userFacingApiError; DispatchBoard + CancelLoad + ApiError never bare E_*. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cu09-user-facing-api-error";
const SELFTEST = process.argv.includes("--selftest");

const HELPER = "apps/frontend/src/lib/api-error-message.ts";
const CLIENT = "apps/frontend/src/api/client.ts";
const BOARD = "apps/frontend/src/pages/dispatch/DispatchBoard.tsx";
const CANCEL = "apps/frontend/src/components/dispatch/CancelLoadModal.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function assertSources(srcs) {
  const problems = [];
  if (!/export function userFacingApiError/.test(srcs[HELPER])) problems.push(`${HELPER}: missing userFacingApiError`);
  if (!/BARE_E_CODE/.test(srcs[HELPER])) problems.push(`${HELPER}: missing E_* ratchet`);
  if (!/CU-09: never leave a bare E_\*/.test(srcs[CLIENT])) {
    problems.push(`${CLIENT}: messageFromApiPayload not humanizing E_*`);
  }
  if (!/userFacingApiError\(error,\s*"Quick assign failed"\)/.test(srcs[BOARD])) {
    problems.push(`${BOARD}: quick-assign not using userFacingApiError`);
  }
  if (/data\.message \?\? data\.blocker \?\? data\.error/.test(srcs[BOARD])) {
    problems.push(`${BOARD}: still falls through to raw data.error`);
  }
  if (!/userFacingApiError\(err,\s*"Cancel failed"\)/.test(srcs[CANCEL])) {
    problems.push(`${CANCEL}: extractCancelError not delegated`);
  }
  return problems;
}

const load = () => Object.fromEntries([HELPER, CLIENT, BOARD, CANCEL].map((f) => [f, read(f)]));

if (SELFTEST) {
  const srcs = load();
  const planted = { ...srcs };
  planted[BOARD] = planted[BOARD].replace(
    /userFacingApiError\(error,\s*"Quick assign failed"\)/,
    'String((error as any).data?.error ?? "Quick assign failed")',
  );
  if (!assertSources(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted board defect not caught`);
    process.exit(1);
  }
  const live = assertSources(srcs);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertSources(load());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
