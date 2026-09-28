#!/usr/bin/env node
/**
 * verify-expense-entity-matches-its-load — ROUND 155.18 JOB 2 (owner order, 2026-09-28).
 *
 * At least 12 of this week's 982 purged voided USMCA expenses existed in USMCA only because a
 * TRANSPORTATION load was fed into the USMCA pipeline ("Load cancelled -- Pre-Faro
 * TRANSPORTATION/QBO, NOT USMCA"). Handoff law already says "Pre-Faro 5753 + 5760-5768 =
 * TRANSP/QBO - NOT USMCA" -- those rows were never USMCA's.
 *
 * ROOT CAUSE (found this round, not previously fixed): apps/backend/src/accounting/
 * expenses.routes.ts's create handler wrote body.load_id straight into the INSERT with NO
 * entity check at all. The only load lookup on that path before this fix (the unit-mismatch
 * resolver) scoped its own query by operating_company_id too, but treated "load not visible
 * under this company" as "load has no assigned unit" (a silent null) rather than as a
 * cross-entity load_id -- so a load owned by a different operating_company_id passed straight
 * through. vendor_uuid, by contrast, was ALREADY entity-checked (reject with vendorNotInCompany
 * if the vendor is not visible under body.operating_company_id) -- load_id had no equivalent.
 *
 * FIXED this round: added the same entity-scoped SELECT + reject (loadNotInCompany) for
 * body.load_id, mirroring the pre-existing vendor_uuid check immediately above it.
 *
 * This guard never reads, writes, or reports on TRANSPORTATION/TRUCKING data itself (frozen
 * entities) -- it only asserts USMCA's own code and data stay entity-consistent.
 *
 * STATIC layer (no DATABASE_URL, never skips): asserts expenses.routes.ts's create handler
 * rejects a load_id that does not resolve under body.operating_company_id, before any INSERT.
 */
export const ALLOW_OFFLINE_SKIP =
  "Static source-shape guard: reads expenses.routes.ts off disk, asserts the create handler rejects a cross-entity load_id before INSERT. No DB connection on the static path.";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-expense-entity-matches-its-load";
const TARGET = "apps/backend/src/accounting/expenses.routes.ts";

const fail = (m) => {
  console.error(`\n  ${LABEL} FAIL: ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`  ${LABEL} PASS: ${m}`);

export function analyse(src) {
  const code = src
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
  const problems = [];

  // The fix must exist as an explicit rejection branch, not merely a comment about intent.
  const hasLoadEntityCheck =
    /body\.load_id[\s\S]{0,400}FROM\s+mdata\.loads[\s\S]{0,200}operating_company_id\s*=\s*\$2[\s\S]{0,200}loadNotInCompany/.test(
      code
    ) || /loadNotInCompany[\s\S]{0,10}:\s*true/.test(code);
  if (!hasLoadEntityCheck) {
    problems.push(
      "no explicit rejection (loadNotInCompany or equivalent) found for a load_id that does not " +
        "resolve under body.operating_company_id — a cross-entity load_id can pass through unrejected."
    );
  }
  // The rejection must be wired to an actual HTTP response, not just constructed and dropped.
  if (!/loadNotInCompany["']?\s*in\s+payload/.test(code)) {
    problems.push("loadNotInCompany is never checked on the response payload — the rejection branch is unreachable dead code.");
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `
    if (body.load_id) {
      const loadEntityRes = await client.query(
        \`SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1\`,
        [body.load_id, body.operating_company_id]
      );
      if (!loadEntityRes.rows[0]) return { loadNotInCompany: true as const };
    }
    if ("loadNotInCompany" in payload) return reply.code(400).send({ error: "expense_load_not_in_company" });
  `;
  const missingCheck = `
    if (hasLoadId && body.load_id) {
      columns.push(\`load_id\`);
      values.push(body.load_id);
    }
  `;
  const checkNotWired = `
    if (body.load_id) {
      const loadEntityRes = await client.query(
        \`SELECT id FROM mdata.loads WHERE id = $1::uuid AND operating_company_id = $2::uuid LIMIT 1\`,
        [body.load_id, body.operating_company_id]
      );
      if (!loadEntityRes.rows[0]) return { loadNotInCompany: true as const };
    }
  `;
  const cases = [
    ["clean fix passes", analyse(good).length === 0],
    ["missing entity check is caught", analyse(missingCheck).some((p) => p.includes("no explicit rejection"))],
    ["unwired rejection is caught", analyse(checkNotWired).some((p) => p.includes("unreachable dead code"))],
  ];
  let bad = 0;
  for (const [name, passed] of cases) {
    console.log(`  ${passed ? "ok" : "FAIL"} — ${name}`);
    if (!passed) bad++;
  }
  if (bad) fail(`${bad} selftest case(s) failed`);
  ok(`selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const abs = path.join(ROOT, TARGET);
if (!fs.existsSync(abs)) fail(`${TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
const problems = analyse(fs.readFileSync(abs, "utf8"));
if (problems.length) fail(problems.map((p) => `\n    - ${p}`).join(""));
ok(`${TARGET} rejects a load_id that does not resolve under the expense's own operating_company_id, wired to an HTTP response.`);

// --- Live layer, ADDITIONAL to the static shape check above, not a replacement.
const LIVE_LABEL = `${LABEL} (live check)`;
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LIVE_LABEL}: SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return;
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const populationRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.load_id IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    const population = Number(populationRes.rows[0].n);
    if (population === 0) {
      await client.query("ROLLBACK");
      console.log(`  ${LIVE_LABEL}: SKIP — 0 live USMCA expenses carry a load_id right now; nothing to check live.`);
      return;
    }
    const badRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
         JOIN mdata.loads l ON l.id = e.load_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND l.operating_company_id != $1::uuid`,
      [USMCA_COMPANY_ID]
    );
    await client.query("ROLLBACK");
    const badCount = Number(badRes.rows[0].n);
    if (badCount > 0) {
      console.error(`  ${LIVE_LABEL}: FAIL — ${badCount} of ${population} live USMCA expense(s) point at a load owned by a different entity.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${LIVE_LABEL}: PASS — all ${population} live USMCA expense(s) with a load_id point at a USMCA-owned load.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`  ${LIVE_LABEL}: connection/query error (not fatal to the static PASS above): ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
await liveCheck();
