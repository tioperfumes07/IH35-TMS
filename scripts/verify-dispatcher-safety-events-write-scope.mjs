#!/usr/bin/env node
/**
 * GUARD: mdata/dispatcher-safety-events.routes.ts's void and PATCH-edit routes must resolve real
 * company scope (scopeToRelatedEntity) before mutating a row — never mutate by id +
 * dispatcher_user_id alone, gated only on the global isOwner() role check.
 *
 * ROOT CAUSE this freezes shut: both mutation routes checked only isOwner() (a global role, not
 * company membership) then wrote by id+dispatcher_user_id with zero entity scope — the exact
 * same defect class already fixed on the sibling driver-safety-events.routes.ts void/edit routes
 * (MDATA-F12). The file's own GET/POST routes already resolve scope via scopeToRelatedEntity
 * (load > driver > customer priority) or scopeToCallerCompany; the void/PATCH-edit routes were
 * the two outliers that skipped it entirely.
 *
 * Static-only (text-pattern) check against the real route file: within each mutation route's own
 * block (bounded by the next route declaration, or a generous slice for the last route — routes
 * are ~2000-2500 chars, too wide for one safe fixed regex window per this session's earlier
 * near-misses), scopeToRelatedEntity must be called BEFORE the route's own UPDATE statement.
 *
 * Run:  node scripts/verify-dispatcher-safety-events-write-scope.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_PATH = path.join(root, "apps/backend/src/mdata/dispatcher-safety-events.routes.ts");
const LABEL = "verify-dispatcher-safety-events-write-scope";

const VOID_MARKER = '/safety-events/:event_id/void"';
const EDIT_MARKER = 'app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id"';
const UPDATE_MARKER = "UPDATE mdata.dispatcher_safety_events";

export function checkDispatcherSafetyEventWriteScope(src) {
  const problems = [];

  const voidStart = src.indexOf(VOID_MARKER);
  const editStart = src.indexOf(EDIT_MARKER);

  if (voidStart === -1 || editStart === -1) {
    problems.push("void or PATCH-edit route marker not found — file structure changed unexpectedly");
    return problems;
  }

  // The void route's own block ends where the edit route begins (routes declared in file order).
  const voidBlock = src.slice(voidStart, editStart);
  const voidScopeIdx = voidBlock.indexOf("scopeToRelatedEntity");
  const voidUpdateIdx = voidBlock.indexOf(UPDATE_MARKER);
  if (voidScopeIdx === -1 || voidUpdateIdx === -1 || voidScopeIdx >= voidUpdateIdx) {
    problems.push(
      "void route does not call scopeToRelatedEntity before its UPDATE — an Owner of any company could void another company's dispatcher safety-file record"
    );
  }
  if (!/const voidScopedCompanyId = await scopeToRelatedEntity[\s\S]*if \(!voidScopedCompanyId\) return \{ error: "dispatcher_safety_event_scope_unresolved" as const \};/.test(voidBlock)) {
    problems.push("void route must fail closed when the related entity cannot resolve a company");
  }

  // The edit route is the last route in the file touching this table — a generous bounded slice
  // avoids matching into unrelated later code while staying well clear of the real ~2400-char span.
  const editBlock = src.slice(editStart, editStart + 3000);
  const editScopeIdx = editBlock.indexOf("scopeToRelatedEntity");
  const editUpdateIdx = editBlock.indexOf(UPDATE_MARKER);
  if (editScopeIdx === -1 || editUpdateIdx === -1 || editScopeIdx >= editUpdateIdx) {
    problems.push(
      "PATCH-edit route does not call scopeToRelatedEntity before its UPDATE — an Owner of any company could silently edit another company's dispatcher safety-file record"
    );
  }
  if (!/const editScopedCompanyId = await scopeToRelatedEntity[\s\S]*if \(!editScopedCompanyId\) return \{ error: "dispatcher_safety_event_scope_unresolved" as const \};/.test(editBlock)) {
    problems.push("PATCH-edit route must fail closed when the related entity cannot resolve a company");
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];

  const bad = `
    app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id/void", RL_WRITE, async (req, reply) => {
      const result = await withCurrentUser(authUser.uuid, async (client) => {
        const currentRes = await client.query(
          \`SELECT id, voided_at FROM mdata.dispatcher_safety_events WHERE id = $1 AND dispatcher_user_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.user_id]
        );
        const current = currentRes.rows[0];
        if (!current) return { error: "dispatcher_safety_event_not_found" };
        if (current.voided_at) return { error: "already_voided" };
        const updateRes = await client.query(
          \`UPDATE mdata.dispatcher_safety_events SET voided_at = now() WHERE id = $1 AND dispatcher_user_id = $2 RETURNING *\`,
          [parsedParams.data.event_id, parsedParams.data.user_id]
        );
        return updateRes.rows[0];
      });
    });

    app.patch("/api/v1/identity/users/:user_id/safety-events/:event_id", RL_WRITE, async (req, reply) => {
      const updated = await withCurrentUser(authUser.uuid, async (client) => {
        const currentRes = await client.query(
          \`SELECT id FROM mdata.dispatcher_safety_events WHERE id = $1 AND dispatcher_user_id = $2 LIMIT 1\`,
          [parsedParams.data.event_id, parsedParams.data.user_id]
        );
        if (!currentRes.rows[0]) return null;
        const updateRes = await client.query(
          \`UPDATE mdata.dispatcher_safety_events SET details = $3 WHERE id = $1 AND dispatcher_user_id = $2 RETURNING *\`,
          values
        );
        return updateRes.rows[0] ?? null;
      });
    });
  `;
  const badProblems = checkDispatcherSafetyEventWriteScope(bad);
  if (badProblems.length !== 4) {
    failures.push(
      `the real pre-fix defect verbatim expected 4 problems, got ${badProblems.length}: ${badProblems.join("; ")}`
    );
  }

  const good = fs.readFileSync(FILE_PATH, "utf8");
  const goodProblems = checkDispatcherSafetyEventWriteScope(good);
  if (goodProblems.length !== 0) {
    failures.push(`the real fixed file was flagged: ${goodProblems.join("; ")}`);
  }

  // Partial regression: only the edit route is fixed, void route remains unscoped — proves the two
  // routes are checked independently, not one flag covering both.
  const partialEditOnly = bad.replace(
    "if (!currentRes.rows[0]) return null;\n        const updateRes",
    "if (!currentRes.rows[0]) return null;\n        const editScopedCompanyId = await scopeToRelatedEntity(client, authUser.uuid, {});\n        if (!editScopedCompanyId) return { error: \"dispatcher_safety_event_scope_unresolved\" as const };\n        const updateRes"
  );
  const partialEditOnlyProblems = checkDispatcherSafetyEventWriteScope(partialEditOnly);
  if (partialEditOnlyProblems.length !== 2) {
    failures.push(
      `a partial fix (edit route scoped, void route still not) expected 2 problems, got ${partialEditOnlyProblems.length}: ${partialEditOnlyProblems.join("; ")}`
    );
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — the real pre-fix defect caught (4/4), the real fixed file clears, a ` +
      `partial (only one route scoped) regression caught (2/2).`
  );
  process.exit(0);
}

const src = fs.readFileSync(FILE_PATH, "utf8");
const problems = checkDispatcherSafetyEventWriteScope(src);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(
  `${LABEL} OK — both dispatcher-safety-events void and PATCH-edit routes resolve real company scope before mutating, matching the file's own GET/POST convention and the sibling driver-safety-events.routes.ts fix (MDATA-F12).`
);
