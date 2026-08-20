#!/usr/bin/env node
/** @matrix-built {"modules":["customers"],"cols":["reverse_link","connectivity"],"task":"WAVE-B-customer-reverse-link","leafRe":"^(detail\\.(contracts|coi)|md\\.coi_requests)$"} */
// CLASS-WAVE B (reverse_link/connectivity) — Wave-B investigation (2026-08-12) found these three
// reverse-link families already fully built in code but never tagged in
// docs/specs/scoreboard/wire-sprint-built.json, so the module matrix showed them red despite the
// wiring being real. This is a REGRESSION guard for existing wiring, not new feature work.
//
// Family 1 — customer -> contracts reverse read: GET .../customer-contracts?customer_id=... lets a
// customer profile drill into every contract on file (apps/backend/src/customer-contracts/customer-contract.routes.ts).
// Family 2 — customer -> certificate-of-insurance requests reverse read:
// GET /api/v1/insurance/coi-requests?customer_id=... (apps/backend/src/insurance/coi.service.ts).
// The guard also proves both reverse readers are mounted on their exact customer leaves. Report and
// insurance claims/lawsuits are guarded by their own exact-leaf ratchets; this guard must not claim them.
import fs from "node:fs";

const CONTRACT_ROUTES = "apps/backend/src/customer-contracts/customer-contract.routes.ts";
const COI_SERVICE = "apps/backend/src/insurance/coi.service.ts";
const CONTRACT_TAB = "apps/frontend/src/components/customers/CustomerContractsTab.tsx";
const COI_TAB = "apps/frontend/src/pages/customers/CoiTab.tsx";
const CUSTOMER_DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const CUSTOMERS_PAGE = "apps/frontend/src/pages/Customers.tsx";

function fail(msg) {
  console.error(`FAIL verify-customer-reverse-link-wired: ${msg}`);
  process.exitCode = 1;
}

function checkContracts(src) {
  if (!src.includes("WHERE c.customer_id = $1")) {
    fail(`${CONTRACT_ROUTES}: customer_id filter (customer -> contracts reverse read) not found.`);
  }
}

function checkCoi(src) {
  if (!src.includes("clauses.push(`r.customer_id = $${values.length}::uuid`)")) {
    fail(`${COI_SERVICE}: customer_id filter (customer -> COI requests reverse read) not found.`);
  }
}

function checkFrontend(sources) {
  if (!sources[CONTRACT_TAB].includes("listCustomerContracts(customerId, operatingCompanyId")) {
    fail(`${CONTRACT_TAB}: mounted contracts reverse read does not carry customer and company scope.`);
  }
  if (!/listInsuranceCoiRequests\(\{\s*operating_company_id: operatingCompanyId!,\s*customer_id: customerId/.test(sources[COI_TAB])) {
    fail(`${COI_TAB}: mounted COI reverse read does not carry customer and company scope.`);
  }
  if (!sources[CUSTOMER_DETAIL].includes('<CoiRequestsTab') || !sources[CUSTOMER_DETAIL].includes('<CustomerContractsTab')) {
    fail(`${CUSTOMER_DETAIL}: COI/contracts reverse surfaces are not mounted on customer detail.`);
  }
  if (!sources[CUSTOMERS_PAGE].includes('<CustomerCOITab')) {
    fail(`${CUSTOMERS_PAGE}: COI reverse surface is not mounted on customer master-detail.`);
  }
}

function selftest() {
  const cases = [
    [CONTRACT_ROUTES, checkContracts, "WHERE c.customer_id = $1", "WHERE 1=1 /* customer_id filter removed */"],
    [COI_SERVICE, checkCoi, "clauses.push(`r.customer_id = $${values.length}::uuid`)", "// customer_id filter removed"],
  ];
  let probesProven = 0;
  for (const [file, checker, needle, replacement] of cases) {
    const original = fs.readFileSync(file, "utf8");
    // replaceAll — profitability.routes.ts repeats the identical customer_id-filter line twice
    // (two separate query builders); a single .replace() only killed the first, leaving the
    // second still satisfying the check's .includes() and making the probe silently inert.
    const mutated = original.split(needle).join(replacement);
    if (mutated === original) {
      console.error(`SELFTEST SETUP FAILED: pattern not found to mutate in ${file}.`);
      process.exit(1);
    }
    checker(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error(`SELFTEST INERT: removing the customer_id filter in ${file} was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }
  const frontend = Object.fromEntries(
    [CONTRACT_TAB, COI_TAB, CUSTOMER_DETAIL, CUSTOMERS_PAGE].map((file) => [file, fs.readFileSync(file, "utf8")]),
  );
  for (const [file, needle] of [
    [CONTRACT_TAB, "listCustomerContracts(customerId, operatingCompanyId"],
    [COI_TAB, "listInsuranceCoiRequests({"],
    [CUSTOMER_DETAIL, "<CustomerContractsTab"],
    [CUSTOMERS_PAGE, "<CustomerCOITab"],
  ]) {
    const mutated = { ...frontend, [file]: frontend[file].replace(needle, "BROKEN_CUSTOMER_REVERSE_MOUNT") };
    if (mutated[file] === frontend[file]) {
      console.error(`SELFTEST SETUP FAILED: frontend pattern not found in ${file}.`);
      process.exit(1);
    }
    checkFrontend(mutated);
    const caught = process.exitCode === 1;
    process.exitCode = undefined;
    if (!caught) {
      console.error(`SELFTEST INERT: removing ${needle} in ${file} was not caught.`);
      process.exit(1);
    }
    probesProven++;
  }
  console.log(`PASS verify-customer-reverse-link-wired --selftest (mutation probes proven non-inert: ${probesProven})`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  checkContracts(fs.readFileSync(CONTRACT_ROUTES, "utf8"));
  checkCoi(fs.readFileSync(COI_SERVICE, "utf8"));
  checkFrontend(Object.fromEntries(
    [CONTRACT_TAB, COI_TAB, CUSTOMER_DETAIL, CUSTOMERS_PAGE].map((file) => [file, fs.readFileSync(file, "utf8")]),
  ));
  if (process.exitCode !== 1) {
    console.log("PASS verify-customer-reverse-link-wired — exact customer contracts/COI reverse reads and mounted surfaces confirmed wired.");
  }
}
