#!/usr/bin/env node
/**
 * verify-audit-append-event-source-not-uuid-cast.mjs
 *
 * ROOT CAUSE (live-pinned 2026-08-22): audit.append_event's real signature (db/migrations/
 * 0001_audit_init.sql) is (p_event_class TEXT, p_severity TEXT, p_payload JSONB, p_actor_user_uuid
 * UUID, p_source TEXT) -- the 5th parameter is a free-text source/module label, never a UUID. Every
 * one of the ~45 other call sites in this codebase correctly leaves the 5th positional argument
 * untyped or casts it `::text`. apps/backend/src/accounting/expense-category-map/routes.ts's
 * appendExpenseCategoryMapAudit() alone cast it `$5::uuid` (and, compounding the bug, put
 * operating_company_id in the $4 actor slot and the real actor UUID in $5) -- Postgres has no
 * matching overload for that signature shape, so every create/update/deactivate on
 * /api/v1/accounting/expense-category-map threw a real 500, `code 42883`, "function
 * audit.append_event(text, text, jsonb, uuid, uuid) does not exist". Live-reproduced via the real
 * "Create Mapping" form (USMCA, category_kind=fuel) before fixing.
 *
 * INVARIANT (static -- no database): no `audit.append_event(...)` call anywhere in
 * apps/backend/src may cast its 5th positional SQL argument to `::uuid`.
 *
 * Self-test: node scripts/verify-audit-append-event-source-not-uuid-cast.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-audit-append-event-source-not-uuid-cast";
const SRC_DIR = path.join(ROOT, "apps/backend/src");

// Matches a SQL string containing `append_event($1 ... $5::uuid` (5th positional arg cast to uuid),
// tolerant of whitespace/newlines between arguments the way the real call sites are written.
const BAD_FIFTH_ARG_RE =
  /append_event\s*\(\s*\$1[\s\S]{0,200}?\$5\s*::\s*uuid\b/i;

export function findBadFifthArgCalls(text) {
  const masked = maskComments(text);
  return BAD_FIFTH_ARG_RE.test(masked);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "__tests__") continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(abs, out);
    } else if (/\.(ts|mjs)$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

function staticCheck() {
  const failures = [];
  for (const file of walk(SRC_DIR)) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("append_event")) continue;
    if (findBadFifthArgCalls(src)) {
      failures.push(
        `${path.relative(ROOT, file)}: audit.append_event(...) casts its 5th argument (p_source) to ` +
          `::uuid -- the real function signature (0001_audit_init.sql) has p_source as TEXT. This ` +
          `causes a live 42883 "function does not exist" error on every call.`
      );
    }
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const bad = `
    await client.query(
      \`SELECT audit.append_event(
        $1::text,
        $2::text,
        $3::jsonb,
        $4::uuid,
        $5::uuid
      )\`,
      [a, b, c, d, e]
    );
  `;
  if (!findBadFifthArgCalls(bad)) {
    console.error(`${LABEL} SELFTEST FAIL -- 5th-arg ::uuid cast was not caught`);
    process.exit(1);
  }

  const good = `
    await client.query(
      \`SELECT audit.append_event($1::text, $2::text, $3::jsonb, $4::uuid, $5::text)\`,
      [a, b, c, d, e]
    );
  `;
  if (findBadFifthArgCalls(good)) {
    console.error(`${LABEL} SELFTEST FAIL -- correct ::text 5th-arg cast was wrongly flagged`);
    process.exit(1);
  }

  const untyped = `
    await client.query(\`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)\`, [a, b, c, d, e]);
  `;
  if (findBadFifthArgCalls(untyped)) {
    console.error(`${LABEL} SELFTEST FAIL -- untyped 5th arg (the majority convention) was wrongly flagged`);
    process.exit(1);
  }

  // A string mentioning "$5::uuid" only inside a comment must not trip the guard.
  const commented = `
    // old broken shape: audit.append_event($1::text, $2::text, $3::jsonb, $4::uuid, $5::uuid)
    await client.query(\`SELECT audit.append_event($1, $2, $3::jsonb, $4::uuid, $5)\`, [a, b, c, d, e]);
  `;
  if (findBadFifthArgCalls(commented)) {
    console.error(`${LABEL} SELFTEST FAIL -- comment-only mention was wrongly flagged`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS -- bad cast caught, correct/untyped/commented shapes accepted`);
  process.exit(0);
}

const failures = staticCheck();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK -- no audit.append_event call casts its 5th (p_source) argument to ::uuid`);
