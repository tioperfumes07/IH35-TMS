#!/usr/bin/env node
// P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN) — REWRITTEN IN PLACE (fix, don't delete). This
// guard used to assert the TTL-reservation-on-mount design (reserveDispatchLoadId /
// releaseDispatchLoadReservation, "● Reserved" countdown). That design was root-caused as the
// burn: opening the wizard called reserveDispatchLoadId on mount, which spent a real, permanent
// load number via lib.next_trace_no() whether or not a load was ever saved (live-proven
// 13611 -> open wizard -> close unsaved -> 13612; 16 numbers burned in 90 minutes, zero loads
// created). It is now replaced by a PEEK-only design: LiveLoadIdBar shows a non-consuming preview
// (peekNextLoadNumber, a pure read) and the real allocation happens exactly once, atomically, at
// save (book-load.service.ts's existing `if (!loadNumber) { reserveNextLoadId(...) }` fallback).
// This file's job stays the same — prove the load-id lifecycle design holds — just against the
// new shape.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/LiveLoadIdBar.tsx";
const API_FILE = "apps/frontend/src/api/dispatch.ts";
const SERVICE_FILE = "apps/backend/src/dispatch/load-id-reservation.service.ts";
const BOOK_FILE = "apps/backend/src/dispatch/book-load.service.ts";
const SELFTEST = process.argv.includes("--selftest");

function assert(source) {
  const problems = [];
  if (/reserveDispatchLoadId\(/.test(source) || /releaseDispatchLoadReservation\(/.test(source))
    problems.push("mount must never call a reserving/releasing endpoint again — that is the burn");
  if (!/void doPeek\(\)/.test(source)) problems.push("mount must peek, not reserve");
  if (!/if \(!hasUserEditedRef\.current\)/.test(source))
    problems.push("an unedited preview must be distinguished from an operator-typed number");
  const unedited = source.split("if (!hasUserEditedRef.current) {")[1]?.split("} else {")[0] ?? "";
  if (!/load_number: "",/.test(unedited) || /load_number: r\.next_number/.test(unedited))
    problems.push("an unedited preview must publish an EMPTY load_number, never the preview text — " +
      "otherwise book-load.service.ts treats it as a manually-typed claim instead of routing through " +
      "the atomic save-time allocator, reintroducing the exact race this fix eliminated");
  if (!/scopeGenerationRef\.current !== submittedGeneration\) return/.test(source))
    problems.push("a late peek response from a stale company/mount generation must be discarded");
  if (!/hasUserEditedRef\.current = true/.test(source))
    problems.push("a typed edit must be remembered so a slow peek can never clobber it");
  return problems;
}

function assertApi(source) {
  const problems = [];
  if (!/export function peekNextLoadNumber/.test(source)) problems.push("api client must export peekNextLoadNumber");
  return problems;
}

function assertBackend(service, book) {
  const problems = [];
  if (!/export async function peekNextLoadNumber/.test(service))
    problems.push("service must export a pure-read peekNextLoadNumber");
  if (/lib\.next_trace_no/.test(service.split("export async function peekNextLoadNumber")[1]?.split(/^export /m)[0] ?? ""))
    problems.push("peekNextLoadNumber must never call the irreversible increment");
  if (!/const MAX_COLLISION_SKIPS/.test(service) || !/WHERE operating_company_id = \$1::uuid AND load_number = \$2/.test(service))
    problems.push("allocateNextLoadNumber must skip past any load_number a live row already holds " +
      "(evidenced 2026-09-14: cancelled ghost loads permanently occupy their number under the plain " +
      "UNIQUE(operating_company_id, load_number) constraint — a blind increment will eventually re-mint one)");
  if (!/if \(!loadNumber\) \{/.test(book) || !/reserveNextLoadId\(/.test(book))
    problems.push("book-load submit must still fall back to the real atomic allocator when no reservation/typed number was supplied");
  return problems;
}

const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const api = fs.readFileSync(path.join(ROOT, API_FILE), "utf8");
const service = fs.readFileSync(path.join(ROOT, SERVICE_FILE), "utf8");
const book = fs.readFileSync(path.join(ROOT, BOOK_FILE), "utf8");

if (SELFTEST) {
  const mutations = [
    live.replace("void doPeek();", "void reserveDispatchLoadId(operatingCompanyId);"),
    live.replace(
      '          load_number: "",',
      "          load_number: r.next_number,"
    ),
    live.replaceAll("if (scopeGenerationRef.current !== submittedGeneration) return;", ""),
    live.replace("hasUserEditedRef.current = true;", ""),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (!assert(mutation).length) {
      console.error(`verify-live-load-id-reservation-lifecycle SELFTEST FAIL: mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  const apiMutations = [api.replace("export function peekNextLoadNumber", "function peekNextLoadNumber")];
  for (const [index, mutation] of apiMutations.entries()) {
    if (!assertApi(mutation).length) {
      console.error(`verify-live-load-id-reservation-lifecycle SELFTEST FAIL: api mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  const backendMutations = [
    { service: service.replace("const MAX_COLLISION_SKIPS = 1000;", ""), book },
    { service, book: book.replace("if (!loadNumber) {", "if (false) {") },
  ];
  for (const [index, mutation] of backendMutations.entries()) {
    if (!assertBackend(mutation.service, mutation.book).length) {
      console.error(`verify-live-load-id-reservation-lifecycle SELFTEST FAIL: backend mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  console.log(
    `verify-live-load-id-reservation-lifecycle SELFTEST PASS — ${mutations.length + apiMutations.length + backendMutations.length}/${mutations.length + apiMutations.length + backendMutations.length}`
  );
  process.exit(0);
}

const problems = assert(live);
problems.push(...assertApi(api));
problems.push(...assertBackend(service, book));
if (problems.length) {
  console.error("verify-live-load-id-reservation-lifecycle FAIL:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("verify-live-load-id-reservation-lifecycle PASS");
