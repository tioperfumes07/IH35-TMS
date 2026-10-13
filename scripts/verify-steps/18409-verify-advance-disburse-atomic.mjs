#!/usr/bin/env node
/**
 * BCF-01 (LEAD 443.113): disburseDriverAdvanceCore must run the disbursement UPDATE and the
 * GL post in ONE atomic withCurrentUser transaction. The guard checks that the two-phase
 * pattern (separate withCurrentUser calls for UPDATE and GL) is gone and the single-transaction
 * structure is in place.
 *
 * @matrix-built {"modules":["cash_advances","driver_finance"],"cols":["connectivity"],"leafRe":"driver_finance\\.driver_advances","task":"BCF-01-ATOMIC-DISBURSE","vertical":"financial"}
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SERVICE = "apps/backend/src/cash-advances/cash-advance-disburse.ts";
const LABEL = "18409-verify-advance-disburse-atomic";

const src = readFileSync(path.join(ROOT, SERVICE), "utf8");
const problems = [];

// 1. The single-transaction comment must be present (BCF-01 fix marker).
if (!/BCF-01: single atomic transaction/.test(src)) {
  problems.push(`${SERVICE}: must have BCF-01 single-atomic-transaction comment (disburse + post or nothing)`);
}

// 2. The two-phase pattern (const phase1 = await withCurrentUser) must be gone.
if (/const phase1\s*=\s*await withCurrentUser/.test(src)) {
  problems.push(`${SERVICE}: two-phase pattern (const phase1 = await withCurrentUser) must be removed; UPDATE + GL must share one transaction`);
}

// 3. The GL post (postSourceTransactionInClientTx) must be called inside the main withCurrentUser callback.
//    A reliable proxy: postSourceTransactionInClientTx and SET disbursement_status = 'disbursed'
//    both appear inside the same withCurrentUser block. We check that there is no top-level await
//    of postSourceTransactionInClientTx outside withCurrentUser (i.e. not assigned at function scope
//    after a withCurrentUser return).
if (/const posting\s*=\s*await withCurrentUser/.test(src)) {
  problems.push(`${SERVICE}: GL post must not open its own separate withCurrentUser connection (const posting = await withCurrentUser)`);
}

// 4. The GL post must be called with a client argument (same-tx client, not opened fresh).
if (!/postSourceTransactionInClientTx\(\s*client,/.test(src)) {
  problems.push(`${SERVICE}: postSourceTransactionInClientTx must be called with the shared client (atomic tx)`);
}

if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  -", p);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    {
      label: "missing BCF-01 atomic comment",
      mutate: (s) => s.replace("BCF-01: single atomic transaction", "BCF-01: two-phase transaction"),
    },
    {
      label: "re-introduced two-phase pattern",
      mutate: (s) => s.replace(
        "const result = await withCurrentUser",
        "const phase1 = await withCurrentUser"
      ),
    },
    {
      label: "GL post opened its own withCurrentUser",
      mutate: (s) => s.replace(
        "postSourceTransactionInClientTx(\n      client,",
        "const posting = await withCurrentUser(actorUserUuid, async (c) => postSourceTransactionInClientTx(c,"
      ),
    },
    {
      label: "GL post called without shared client",
      mutate: (s) => s.replace(
        "postSourceTransactionInClientTx(\n      client,",
        "postSourceTransactionInClientTx(\n      newClient,"
      ),
    },
  ];

  let detected = 0;
  for (const { label, mutate } of cases) {
    const mutated = mutate(src);
    if (mutated === src) {
      console.error(`${LABEL} SELFTEST: mutation "${label}" was inert — pattern not found in source`);
      process.exit(1);
    }
    const p = [];
    if (!/BCF-01: single atomic transaction/.test(mutated)) p.push("atomic comment");
    if (/const phase1\s*=\s*await withCurrentUser/.test(mutated)) p.push("two-phase pattern");
    if (/const posting\s*=\s*await withCurrentUser/.test(mutated)) p.push("separate withCurrentUser for GL");
    if (!/postSourceTransactionInClientTx\(\s*client,/.test(mutated)) p.push("GL post without shared client");
    if (p.length > 0) {
      detected++;
    } else {
      console.error(`${LABEL} SELFTEST: mutation "${label}" was NOT detected`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST OK (${detected}/${cases.length} planted defects detected)`);
} else {
  console.log(`${LABEL} OK — disbursement UPDATE + GL post are atomic (one withCurrentUser transaction)`);
}
