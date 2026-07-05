#!/usr/bin/env node
/**
 * verify-bills-money-membership-assert
 *
 * G1-2 (Security/Money) regression lock.
 *
 * ROOT CAUSE THIS GUARD LOCKS IN
 * ------------------------------
 * The bill money-mutation handlers in apps/backend/src/accounting/bills.routes.ts
 * called their service functions (`payBill`, `voidBill`, `voidBillPayment`) with a
 * caller-supplied `operating_company_id` (only UUID-validated) WITHOUT first proving
 * the authenticated user belongs to that company. Those services run under
 * `withCurrentUser` (RLS identity) but do NOT set the `app.operating_company_id`
 * GUC and do NOT assert membership — so the existing count-based
 * verify-company-membership-assert guard (which pairs asserts to GUC-sets) could not
 * see them. An authed user in company A could pay/void a bill under company B.
 *
 * The fix routes each handler through `assertCompanyMembership(userId,
 * operating_company_id)` BEFORE the money mutation, mirroring the already-correct
 * `/bills/:id/allocate` handler in the same file.
 *
 * WHAT THIS GUARD CHECKS
 * ----------------------
 * For each money-mutation route handler in bills.routes.ts that calls one of the
 * MONEY_MUTATIONS below, an `assertCompanyMembership(` call MUST appear inside the
 * same handler body and BEFORE that mutation call. Removing any assert turns this red.
 *
 * Static guard — no DB required. Runs in CI on every push.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
const TARGET = join(ROOT, "apps/backend/src/accounting/bills.routes.ts");

// Service calls that MUTATE money on a caller-supplied operating company.
const MONEY_MUTATIONS = ["payBill(", "voidBill(", "voidBillPayment("];
const ASSERT_CALL = "assertCompanyMembership(";
// Handler boundaries in a Fastify route file.
const HANDLER_START_RE = /app\.(post|patch|put|delete)\s*\(/g;

const failures = [];

if (!existsSync(TARGET)) {
  console.error(
    "verify-bills-money-membership-assert FAILED:\n" +
      "  ✗ apps/backend/src/accounting/bills.routes.ts is missing (moved/renamed? update this guard)."
  );
  process.exit(1);
}

const src = readFileSync(TARGET, "utf8");

// Split the file into per-handler segments at each app.<verb>( boundary so an assert
// in one handler cannot satisfy a mutation in a different handler.
const starts = [];
let m;
while ((m = HANDLER_START_RE.exec(src)) !== null) starts.push(m.index);
starts.push(src.length);

let mutationHandlersSeen = 0;
for (let i = 0; i < starts.length - 1; i++) {
  const segment = src.slice(starts[i], starts[i + 1]);
  for (const mut of MONEY_MUTATIONS) {
    // `voidBill(` is a substring of `voidBillPayment(`, so match on the exact token
    // followed by a non-word char to avoid double counting.
    const mutIdx = findMutation(segment, mut);
    if (mutIdx === -1) continue;
    mutationHandlersSeen++;
    const assertIdx = segment.indexOf(ASSERT_CALL);
    if (assertIdx === -1) {
      failures.push(
        `handler calling ${mut.replace("(", "")} does not call assertCompanyMembership() — a money mutation runs on a caller-supplied operating_company_id without proving membership (G1-2 cross-tenant authz).`
      );
    } else if (assertIdx > mutIdx) {
      failures.push(
        `handler calling ${mut.replace("(", "")} calls assertCompanyMembership() AFTER the mutation — the assert must precede the money mutation.`
      );
    }
  }
}

/** Find the first occurrence of `token` (e.g. "voidBill(") that is a real call,
 *  not a longer identifier prefix (e.g. "voidBillPayment(" for token "voidBill("). */
function findMutation(segment, token) {
  const base = token.slice(0, -1); // strip trailing "("
  let from = 0;
  for (;;) {
    const idx = segment.indexOf(token, from);
    if (idx === -1) return -1;
    // char immediately after the base identifier must be "(" (already guaranteed by token)
    // and the char before the identifier must not be a word char (avoid substrings).
    const before = idx > 0 ? segment[idx - 1] : " ";
    if (!/[A-Za-z0-9_$]/.test(before)) return idx;
    from = idx + base.length;
  }
}

if (failures.length > 0) {
  console.error("verify-bills-money-membership-assert FAILED:");
  for (const f of [...new Set(failures)].sort()) console.error(`  ✗ ${f}`);
  console.error(
    "\nG1-2: a bill money-mutation handler in accounting/bills.routes.ts calls payBill/voidBill/\n" +
      "voidBillPayment on a caller-supplied operating_company_id without first calling\n" +
      "assertCompanyMembership(userId, operating_company_id). Add the assert immediately before the\n" +
      "mutation, mirroring the /bills/:id/allocate handler in the same file."
  );
  process.exit(1);
}

// Defense-in-depth: make sure the guard actually found the money handlers (so a file
// refactor that renames the service calls does not silently make this a no-op pass).
if (mutationHandlersSeen < MONEY_MUTATIONS.length) {
  console.error(
    "verify-bills-money-membership-assert FAILED:\n" +
      `  ✗ expected to find at least ${MONEY_MUTATIONS.length} money-mutation handlers (payBill/voidBill/voidBillPayment)\n` +
      `    but found ${mutationHandlersSeen} — the handler shape changed; re-verify membership asserts and update this guard.`
  );
  process.exit(1);
}

console.log(
  `verify-bills-money-membership-assert OK — ${mutationHandlersSeen} bill money-mutation handler(s) each call ` +
    "assertCompanyMembership() before the mutation (G1-2 cross-tenant authz)."
);
