#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/LiveLoadIdBar.tsx";
const SELFTEST = process.argv.includes("--selftest");

function assert(source) {
  const problems = [];
  if (!/const submittedGeneration = scopeGenerationRef\.current/.test(source) || !/const submittedCompanyId = operatingCompanyId/.test(source))
    problems.push("reserve must snapshot company and generation");
  if (!/scopeGenerationRef\.current !== submittedGeneration/.test(source))
    problems.push("late prior-scope reservation must be rejected");
  if (!/releaseDispatchLoadReservation\(submittedCompanyId, r\.reservation_uuid\)/.test(source))
    problems.push("late reservation must be released under its submitted company");
  if (!/reservationRef\.current = \{ companyId: submittedCompanyId, reservationId: r\.reservation_uuid \}/.test(source))
    problems.push("published reservation must retain its owning company");
  if (!/releaseDispatchLoadReservation\(reservation\.companyId, reservation\.reservationId\)/.test(source))
    problems.push("cleanup must release the exact company-owned reservation");
  if (!/activeGenerationRef\.current === submittedGeneration\) return/.test(source))
    problems.push("concurrent reservation calls must be refused");
  if (!/Load number unavailable: \{error\}/.test(source) || !/>\s*Retry\s*</.test(source))
    problems.push("reservation failure must be honest and recoverable");
  if (!/display \? "● Reserved" : "Reserving…"/.test(source))
    problems.push("pending reservation must not claim Reserved");
  return problems;
}

const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
if (SELFTEST) {
  const mutations = [
    live.replace("const submittedCompanyId = operatingCompanyId", "const submittedCompanyId = currentCompanyId"),
    live.replace("if (scopeGenerationRef.current !== submittedGeneration)", "if (false)"),
    live.replace("releaseDispatchLoadReservation(submittedCompanyId, r.reservation_uuid)", "releaseDispatchLoadReservation(operatingCompanyId, r.reservation_uuid)"),
    live.replace("if (activeGenerationRef.current === submittedGeneration) return;", ""),
    live.replace("Load number unavailable: {error}", "Reserved"),
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (!assert(mutation).length) {
      console.error(`verify-live-load-id-reservation-lifecycle SELFTEST FAIL: mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  console.log(`verify-live-load-id-reservation-lifecycle SELFTEST PASS — ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const problems = assert(live);
if (problems.length) {
  console.error("verify-live-load-id-reservation-lifecycle FAIL:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("verify-live-load-id-reservation-lifecycle PASS");
