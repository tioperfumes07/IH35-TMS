#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/LiveLoadIdBar.tsx";
const SERVICE_FILE = "apps/backend/src/dispatch/load-id-reservation.service.ts";
const BOOK_FILE = "apps/backend/src/dispatch/book-load.service.ts";
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

function assertBackend(service, book) {
  const problems = [];
  if (!/consumeLoadNumberReservation[\s\S]{0,700}operating_company_id = \$3::uuid[\s\S]{0,120}reserved_by_user_id = \$4::uuid[\s\S]{0,160}status = 'reserved'[\s\S]{0,100}RETURNING id::text/.test(service))
    problems.push("consume must CAS reservation/company/user/status and return the claimed row");
  if (!/if \(!consumed\.rows\[0\]\?\.id\) throw new Error\("load_id_reservation_consume_conflict"\)/.test(service))
    problems.push("lost reservation consume must abort Book Load");
  if (!/consumeLoadNumberReservation\(client, \{[\s\S]{0,180}operatingCompanyId: input\.operating_company_id[\s\S]{0,180}reservedByUserId: input\.requestingUserUuid/.test(book))
    problems.push("Book Load must forward submitted company and reserving user into consume");
  return problems;
}

const live = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const service = fs.readFileSync(path.join(ROOT, SERVICE_FILE), "utf8");
const book = fs.readFileSync(path.join(ROOT, BOOK_FILE), "utf8");
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
  const backendMutations = [
    service.replace("AND operating_company_id = $3::uuid", ""),
    service.replace("AND reserved_by_user_id = $4::uuid", ""),
    service.replace("RETURNING id::text", ""),
    service.replace('if (!consumed.rows[0]?.id) throw new Error("load_id_reservation_consume_conflict");', ""),
    book.replaceAll("operatingCompanyId: input.operating_company_id,", ""),
    book.replaceAll("reservedByUserId: input.requestingUserUuid,", ""),
  ];
  for (const [index, mutation] of backendMutations.entries()) {
    const serviceMutation = index < 4;
    if (!assertBackend(serviceMutation ? mutation : service, serviceMutation ? book : mutation).length) {
      console.error(`verify-live-load-id-reservation-lifecycle SELFTEST FAIL: backend mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  console.log(`verify-live-load-id-reservation-lifecycle SELFTEST PASS — ${mutations.length + backendMutations.length}/${mutations.length + backendMutations.length}`);
  process.exit(0);
}

const problems = assert(live);
problems.push(...assertBackend(service, book));
if (problems.length) {
  console.error("verify-live-load-id-reservation-lifecycle FAIL:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("verify-live-load-id-reservation-lifecycle PASS");
