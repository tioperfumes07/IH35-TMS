#!/usr/bin/env node
// BANK-RECON-ALREADY-MATCHED-500: POST /api/v1/bank-recon/accept-match and /manual-match's catch
// blocks only mapped variance_account_id_required to a 400 -- the deliberate idempotency guard
// bank_transaction_already_matched (thrown by match.service.ts when the same bank line is accepted
// twice) fell through to `throw error`, surfacing as a raw 500 instead of the 409 this file's own
// close-period handler already uses for the equivalent "already in that state" case
// (period_not_100pct_reconciled). Guard requires both catch blocks to map this error to 409.
import fs from "node:fs";

const FILE = "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts";

function inspect(source) {
  const failures = [];
  const occurrences = (source.match(/if \(message === "bank_transaction_already_matched"\) \{\s*\n\s*return reply\.code\(409\)\.send\(\{ error: message \}\);\s*\n\s*\}/g) ?? []).length;
  if (occurrences < 2) {
    failures.push(`expected 2 catch blocks (accept-match + manual-match) to map bank_transaction_already_matched -> 409, found ${occurrences}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(FILE, "utf8");
  const realFailures = inspect(real);
  if (realFailures.length !== 0) {
    console.error("verify-bank-recon-already-matched-conflict-status --selftest FAILED: real source itself fails:", realFailures);
    process.exit(1);
  }
  const mutated = real.replace(
    'if (message === "bank_transaction_already_matched") {\n        return reply.code(409).send({ error: message });\n      }\n      throw error;\n    }\n  });\n\n  app.post("/api/v1/bank-recon/reject-match"',
    'throw error;\n    }\n  });\n\n  app.post("/api/v1/bank-recon/reject-match"'
  );
  if (mutated === real) {
    console.error("verify-bank-recon-already-matched-conflict-status --selftest: mutation did not match live source — update the test");
    process.exit(1);
  }
  const mutatedFailures = inspect(mutated);
  if (mutatedFailures.length === 0) {
    console.error("verify-bank-recon-already-matched-conflict-status --selftest FAILED: mutation was not caught");
    process.exit(1);
  }
  console.log("verify-bank-recon-already-matched-conflict-status --selftest: OK (mutation caught, real source clean)");
  process.exit(0);
}

const source = fs.readFileSync(FILE, "utf8");
const failures = inspect(source);
if (failures.length > 0) {
  console.error("verify-bank-recon-already-matched-conflict-status FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}
console.log("verify-bank-recon-already-matched-conflict-status: OK — both accept-match and manual-match map bank_transaction_already_matched to 409");
