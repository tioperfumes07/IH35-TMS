#!/usr/bin/env node
/**
 * Cash-Advance maker <> checker guard (Phase 4 GUARDS, Settlement Pay-Run I4).
 *
 * Maker != checker must be enforced at BOTH layers:
 *   (1) DB — db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql carries the CHECK
 *       constraint cash_advance_requests_maker_ne_checker (submitted_by_user_id <> reviewed_by_user_id).
 *   (2) Service/route layer — the cash-advance approval path returns a 409 with the literal error code
 *       'maker_checker_violation' when the approver (checker) equals the submitter (maker), via an
 *       explicit equality comparison of the submitted-by (maker) id against the acting approver/reviewer
 *       id. Owner/Admin retain a self-approve path (role IS the authority — no distinct checker required).
 *
 * All checks run against COMMENT-STRIPPED text so a guard-describing comment (e.g. "// 409
 * maker_checker_violation") can never satisfy a check in place of real code.
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + each failure mode), including the
 * real-world style actually used in this repo: a role-Set-based authority check (not an inline `role ===
 * 'Owner'`) and a generic `reply.code(409).send({ error: result.error })` catch-all route (not a literal
 * inline next to 409).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-cash-advance-maker-checker";
const MIGRATION_REL = "db/migrations/202607380000_settlement_payrun_catalog_and_extends.sql";
const SERVICE_FILES = [
  "apps/backend/src/driver-finance/cash-advance-requests.service.ts",
  "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
  "apps/backend/src/driver-finance/cash-advance-requests.routes.ts",
];

const DB_CHECK_RE =
  /ADD CONSTRAINT\s+cash_advance_requests_maker_ne_checker[\s\S]{0,400}?submitted_by_user_id\s*<>\s*reviewed_by_user_id/i;

// (2a) the literal error CODE the service must return when maker === checker.
const VIOLATION_LITERAL_RE = /["']maker_checker_violation["']/;
// (2b) a 409 response that can carry that error — either a direct literal adjacency, OR a generic
// pass-through (`reply.code(409).send({ error: result.error })` / `{ error: err }` / `{ error: error }`)
// which is the correct, non-brittle way to wire a service-returned error code to an HTTP status.
const SPECIFIC_409_RE = /code\(\s*409\s*\)[\s\S]{0,150}?maker_checker_violation/i;
const GENERIC_409_PASSTHROUGH_RE = /code\(\s*409\s*\)\.send\(\s*\{\s*error:\s*(?:result\.error|err\.?\w*|error)\s*[,}]/i;

// (2c) an explicit equality comparison of the maker (a "submitted...by" identifier — literal column name
// OR a local var derived from it, e.g. `submittedBy`) against the approver/reviewer/actor id.
const MAKER_CHECKER_COMPARISON_RE =
  /submitted[_a-zA-Z]*\s*(===|==)\s*(?:args\.)?(actorUserId|approverId|reviewerId)\b|(?:args\.)?(actorUserId|approverId|reviewerId)\s*(===|==)\s*submitted[_a-zA-Z]*/i;

// (2d) an Owner/Admin(istrator) self-approve bypass — either an inline `role === 'Owner'` comparison, OR
// a role-allowlist (Set/array) literal containing both 'Owner' and 'Admin'/'Administrator' (the repo's
// actual style: `new Set(["Owner", "Administrator"])`).
const OWNER_ADMIN_INLINE_RE = /role\s*(===|==)\s*['"](Owner|Admin(?:istrator)?)['"]/i;
const OWNER_ADMIN_ALLOWLIST_RE =
  /["']Owner["'][\s\S]{0,80}?["']Admin(?:istrator)?["']|["']Admin(?:istrator)?["'][\s\S]{0,80}?["']Owner["']/;

/** Strip // line comments and /* *\/ block comments so a guard-describing COMMENT can never satisfy — or
 * accidentally trip — a code-shape check. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Pure evaluation.
 * @param {{ migrationText: string, serviceText: string }} args
 * @returns {string[]} errors
 */
export function assertGuard({ migrationText, serviceText }) {
  const errors = [];
  const code = stripComments(serviceText);

  if (!DB_CHECK_RE.test(migrationText)) {
    errors.push(
      `${MIGRATION_REL}: missing CHECK constraint cash_advance_requests_maker_ne_checker ` +
        "(submitted_by_user_id <> reviewed_by_user_id)"
    );
  }
  if (!VIOLATION_LITERAL_RE.test(code)) {
    errors.push("service layer: no code path returns the literal error code 'maker_checker_violation'");
  }
  if (!(SPECIFIC_409_RE.test(code) || GENERIC_409_PASSTHROUGH_RE.test(code))) {
    errors.push(
      "route layer: no 409 response wired to carry the service-returned error (neither a literal " +
        "maker_checker_violation next to code(409) nor a generic error passthrough)"
    );
  }
  if (!MAKER_CHECKER_COMPARISON_RE.test(code)) {
    errors.push(
      "service layer: missing an explicit submitted-by (maker) vs approver/reviewer (checker) equality comparison"
    );
  }
  if (!(OWNER_ADMIN_INLINE_RE.test(code) || OWNER_ADMIN_ALLOWLIST_RE.test(code))) {
    errors.push("service layer: missing an Owner/Admin self-approve bypass (role IS the authority)");
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const goodMigration = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cash_advance_requests_maker_ne_checker') THEN
    ALTER TABLE driver_finance.cash_advance_requests
      ADD CONSTRAINT cash_advance_requests_maker_ne_checker
      CHECK (
        submitted_by_user_id IS NULL
        OR reviewed_by_user_id IS NULL
        OR submitted_by_user_id <> reviewed_by_user_id
      );
  END IF;
END $$;
`;
  // Mirrors the ACTUAL repo style: role-Set authority check, a local `submittedBy` var compared to
  // args.actorUserId, and a generic 409 passthrough route (not a literal inline next to 409).
  const goodService = `
const AUTHORITY_ROLES = new Set(["Owner", "Administrator"]);
export function isCashAdvanceAuthorityRole(role) { return AUTHORITY_ROLES.has(String(role ?? "")); }

export async function approveCashAdvanceRequest(client, args) {
  const row = await loadRequest(client, args.requestId);
  const submittedBy = row.submitted_by_user_id ? String(row.submitted_by_user_id) : null;
  const isAuthority = isCashAdvanceAuthorityRole(args.actorRole);
  const reviewerToRecord = isAuthority && submittedBy && submittedBy === args.actorUserId ? null : args.actorUserId;
  if (reviewerToRecord && submittedBy && reviewerToRecord === submittedBy) {
    return { error: "maker_checker_violation" };
  }
  return doApprove(client, args);
}
`;
  const goodRoute = `
if ("error" in result) {
  if (result.error === "not_found") return reply.code(404).send({ error: result.error });
  return reply.code(409).send({ error: result.error });
}
`;

  const cases = [
    {
      name: "well-formed (real-world style: role-Set authority + local submittedBy var + generic 409 passthrough) → 0 errors",
      in: { migrationText: goodMigration, serviceText: goodService + goodRoute },
      want: 0,
    },
    {
      name: "migration missing the maker-ne-checker CHECK",
      in: { migrationText: goodMigration.replace("submitted_by_user_id <> reviewed_by_user_id", "true"), serviceText: goodService + goodRoute },
      wantMin: 1,
    },
    {
      name: "service never returns the maker_checker_violation literal anywhere",
      in: { migrationText: goodMigration, serviceText: goodService.replace(`return { error: "maker_checker_violation" };`, "return doApprove(client, args);") + goodRoute },
      wantMin: 1,
    },
    {
      name: "route has no 409 at all (only 404/400) — the violation would never surface as 409",
      in: {
        migrationText: goodMigration,
        serviceText: goodService + `\nif ("error" in result) { return reply.code(400).send({ error: result.error }); }\n`,
      },
      wantMin: 1,
    },
    {
      name: "service missing the maker vs checker comparison",
      in: {
        migrationText: goodMigration,
        serviceText:
          goodService.replace(
            `const reviewerToRecord = isAuthority && submittedBy && submittedBy === args.actorUserId ? null : args.actorUserId;\n  if (reviewerToRecord && submittedBy && reviewerToRecord === submittedBy) {\n    return { error: "maker_checker_violation" };\n  }\n`,
            `return { error: "maker_checker_violation" };\n`
          ) + goodRoute,
      },
      wantMin: 1,
    },
    {
      name: "service missing Owner/Admin self-approve bypass (no allowlist, no inline check)",
      in: {
        migrationText: goodMigration,
        serviceText: goodService.replace(`const AUTHORITY_ROLES = new Set(["Owner", "Administrator"]);`, `const AUTHORITY_ROLES = new Set([]);`) + goodRoute,
      },
      wantMin: 1,
    },
    {
      name: "false-positive check: a COMMENT claiming '409 maker_checker_violation' with no real code is never enough",
      in: {
        migrationText: goodMigration,
        serviceText: `// I4: a non-checker approver -> 403; maker==checker -> 409 maker_checker_violation.\nexport function noop() { return null; }`,
      },
      wantMin: 3,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const migrationText = read(MIGRATION_REL);
if (migrationText == null) {
  console.error(`[${LABEL}] FAILED — missing ${MIGRATION_REL}`);
  process.exit(1);
}
let serviceText = "";
let anyServiceFileFound = false;
for (const rel of SERVICE_FILES) {
  const t = read(rel);
  if (t != null) { serviceText += t + "\n"; anyServiceFileFound = true; }
}
if (!anyServiceFileFound) {
  console.error(`[${LABEL}] FAILED — none of the cash-advance service/route files found: ${SERVICE_FILES.join(", ")}`);
  process.exit(1);
}
const errors = assertGuard({ migrationText, serviceText });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — maker<>checker enforced at both the DB CHECK and the service/route layer (with Owner/Admin self-approve bypass).`);
