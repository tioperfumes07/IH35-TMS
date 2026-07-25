#!/usr/bin/env node
// verify:entity-resolver-membership
//
// apps/backend/src/auth/operating-company-scope.ts decides which operating company every param-omitting
// request runs as, and which explicitly-named company a caller may use. Two defects lived in it at once,
// pulling in OPPOSITE directions — which is why this guard pins both clauses together. Fixing either one
// alone reintroduces the other.
//
// M1 (latent when found) — the default-resolution COALESCE had a membership filter on arm 2 (lowest
//   accessible) but NOT on arm 1 (the user's default). A user whose default_company_id sat outside their
//   accessible set therefore resolved to a company they are not a member of, and at
//   reports/scheduled-report-admin that id goes straight into set_config('app.operating_company_id', …),
//   running the whole request's RLS under it. Prod-verified 0 users matched that shape, but #3480's
//   extraction spread the unfiltered arm to four more call sites.
//
// GRANTLESS-403 (live when found) — the `requested` branch validated membership via
//   org.user_accessible_company_ids(), which returns ALL active companies for role Owner and otherwise the
//   caller's org.user_company_access rows. FOUR non-Owner prod accounts (Administrator, Dispatcher, Manager,
//   Safety) have a default_company_id and ZERO grant rows, so that set is EMPTY and the branch 403'd every
//   named company — including their own default — while the default branch handed them that same company.
//   546 frontend files pass operating_company_id, so this was refusing real surfaces.
//
// THE TRAP THIS GUARD EXISTS TO PREVENT: the obvious M1 fix — "add
// `AND c.id IN (SELECT org.user_accessible_company_ids())` to arm 1" — is correct in isolation and WRONG
// against this data: it resolves those four accounts to NULL and locks them out. Prod simulation of the
// shipped clause, per user across all 13 accounts with a default: the 4 grantless accounts go from
// old_allowed=null to new_allowed=TRANSP (their own default, nothing more) and newly_denied is null for
// every one of the 13. The `NOT EXISTS` escape is LOAD-BEARING. Deleting it is a lockout regression, and
// deleting the membership predicate is a cross-entity regression.
//
// WHAT THIS GUARD PROVES, honestly: static structure. It cannot execute SQL or impersonate a user. The
// per-user allow/deny matrix is a live proof recorded in the PR. What it holds is that neither clause can
// be removed without CI failing.
//
// FAILS on the pre-fix source and PASSES on the fix. `--selftest` mutates REAL source, one case per clause.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify:entity-resolver-membership";
const SELFTEST = process.argv.includes("--selftest");

const SCOPE = "apps/backend/src/auth/operating-company-scope.ts";
const FILES = [SCOPE];

const readDisk = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "").replace(/--[^\n]*/g, "");

const ACCESSIBLE = /c\.id IN \(SELECT org\.user_accessible_company_ids\(\)\)/;
const GRANTLESS_ESCAPE = /NOT EXISTS\s*\(\s*SELECT 1 FROM org\.user_company_access a/;

export function assertEntityResolverMembership(sources) {
  const raw = sources?.[SCOPE] ?? readDisk(SCOPE);
  const src = stripComments(raw);
  const errs = [];

  // Split the file into the `requested` branch and the default-resolution function.
  const requestedBranch = src.match(/if \(requested\)\s*\{[\s\S]*?\n  \}/);
  const defaultFn = src.match(/export async function resolveDefaultOperatingCompanyId[\s\S]*?\n\}/);

  if (!requestedBranch) errs.push(`${SCOPE}: could not locate the \`if (requested)\` membership branch`);
  if (!defaultFn) errs.push(`${SCOPE}: could not locate resolveDefaultOperatingCompanyId`);
  if (!requestedBranch || !defaultFn) return errs;

  // Slice COALESCE arm 1 (the user's DEFAULT) on its own. Testing the whole function is WRONG: arm 2 (the
  // lowest-accessible fallback) legitimately contains the same membership predicate, so a whole-function
  // test is satisfied by arm 2 even when arm 1 has none — which is exactly the M1 defect. My first draft of
  // this guard made that mistake and its own selftest caught it; it is the same shape as the independent
  // review's M4 finding (a guard checking a whole document instead of the section it names).
  const defaultArm = defaultFn[0].match(
    /SELECT c\.id\s*\n\s*FROM identity\.users u\s*\n\s*JOIN org\.companies c ON c\.id = u\.default_company_id[\s\S]*?(?=\n\s*\),)/,
  );
  if (!defaultArm) {
    errs.push(`${SCOPE}: could not isolate the default-company COALESCE arm in resolveDefaultOperatingCompanyId`);
    return errs;
  }

  // ── M1: the DEFAULT arm must filter by membership ─────────────────────────────────────────────────
  if (!ACCESSIBLE.test(defaultArm[0])) {
    errs.push(
      `${SCOPE}: resolveDefaultOperatingCompanyId does not filter the user's DEFAULT company by org.user_accessible_company_ids() — a default outside the accessible set resolves to a company the caller is not a member of, and scheduled-report-admin feeds that id into set_config('app.operating_company_id', …) for the whole request (M1)`,
    );
  }

  // ── LOCKOUT: that filter must carry the grantless escape ──────────────────────────────────────────
  if (ACCESSIBLE.test(defaultArm[0]) && !GRANTLESS_ESCAPE.test(defaultArm[0])) {
    errs.push(
      `${SCOPE}: the default arm filters by membership with NO "NOT EXISTS org.user_company_access" escape — four non-Owner prod accounts (Administrator/Dispatcher/Manager/Safety) have a default but ZERO grant rows, so a bare membership predicate resolves them to NULL and locks them out. The escape is load-bearing.`,
    );
  }

  // ── GRANTLESS-403: the requested branch must admit a grantless caller's OWN default ───────────────
  if (!ACCESSIBLE.test(requestedBranch[0])) {
    errs.push(`${SCOPE}: the \`requested\` branch no longer validates membership at all — a caller could name any company`);
  }
  if (!GRANTLESS_ESCAPE.test(requestedBranch[0])) {
    errs.push(
      `${SCOPE}: the \`requested\` branch has no grantless escape — it will 403 the four non-Owner accounts that have a default but no org.user_company_access rows, for every company INCLUDING their own default, while the default branch hands them that same company (GRANTLESS-403)`,
    );
  }
  // The escape must be scoped to their OWN default, never "any company".
  if (GRANTLESS_ESCAPE.test(requestedBranch[0]) && !/default_company_id FROM identity\.users u WHERE u\.id = \$2/.test(requestedBranch[0])) {
    errs.push(
      `${SCOPE}: the \`requested\` branch's grantless escape is not pinned to the caller's OWN default_company_id — a grantless caller must be able to name their default and NOTHING else, otherwise this widens access instead of making the two paths agree`,
    );
  }

  return errs;
}

if (SELFTEST) {
  const live = Object.fromEntries(FILES.map((r) => [r, readDisk(r)]));
  const failures = [];
  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: inert — the mutation did not change the source`);
      return;
    }
    const problems = assertEntityResolverMembership(mutated);
    if (!problems.some((x) => x.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${problems.join(" | ") || "none"})`);
    }
  };

  // 1. M1 regression: strip the membership filter from the default arm (the pre-#3480-review shape).
  expectCaught(
    "default-arm-loses-membership-filter",
    {
      ...live,
      [SCOPE]: live[SCOPE].replace(
        /\n            AND \(\n              c\.id IN \(SELECT org\.user_accessible_company_ids\(\)\)\n              OR NOT EXISTS \([\s\S]*?\n              \)\n            \)/,
        "",
      ),
    },
    "does not filter the user's DEFAULT company",
  );

  // 2. Lockout regression: the naive fix the review proposed — membership with no grantless escape.
  expectCaught(
    "default-arm-membership-without-grantless-escape",
    {
      ...live,
      [SCOPE]: live[SCOPE].replace(
        /AND \(\n              c\.id IN \(SELECT org\.user_accessible_company_ids\(\)\)\n              OR NOT EXISTS \([\s\S]*?\n              \)\n            \)/,
        "AND c.id IN (SELECT org.user_accessible_company_ids())",
      ),
    },
    "escape is load-bearing",
  );

  // 3. GRANTLESS-403 regression: revert the requested branch to membership-only.
  expectCaught(
    "requested-branch-reverts-to-membership-only",
    {
      ...live,
      [SCOPE]: live[SCOPE].replace(
        /AND \(\n            c\.id IN \(SELECT org\.user_accessible_company_ids\(\)\)\n            OR \([\s\S]*?\n            \)\n          \)/,
        "AND c.id IN (SELECT org.user_accessible_company_ids())",
      ),
    },
    "has no grantless escape",
  );

  const liveProblems = assertEntityResolverMembership(live);
  if (liveProblems.length) failures.push(`live FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 3 planted defects caught (M1 regression, lockout regression, 403 regression), live source clean`);
  process.exit(0);
}

const problems = assertEntityResolverMembership();
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `${LABEL} OK — the default arm filters by membership WITH the grantless escape, and the requested branch admits a grantless caller's own default and nothing else.`,
);
