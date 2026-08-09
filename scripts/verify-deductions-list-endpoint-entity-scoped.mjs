#!/usr/bin/env node
/**
 * ACCT-F291 / FAIL-DD2 — the deductions LIST endpoint must stay entity-scoped BOTH ways.
 *
 * driver_finance.driver_settlement_deductions had NO list endpoint at all, so a pending deduction
 * could not appear on any screen (verified live: one $100.00 pending row, unservable). The endpoint
 * added by ACCT-F291 reads a money table across drivers, which makes its scoping load-bearing.
 *
 * WHY THE GUC IS NOT ENOUGH, and why this guard exists at all:
 * `withCompany` sets app.operating_company_id, and it is tempting to treat that as the backstop. It
 * is NOT one here. Per the entity law, org.user_accessible_company_ids() returns EVERY active company
 * when the session role is Owner — so for an Owner session an unscoped read does not fail, it QUIETLY
 * BLENDS ENTITIES. Every unscoped read is load-bearing on its own predicate. This guard therefore
 * requires the explicit operating_company_id predicate in the SQL, not merely the withCompany wrapper.
 *
 * It also pins the JOINs: each must be LEFT (an INNER join silently DROPS deductions whose driver or
 * load was archived, shrinking a money list without saying so) and each must carry its own
 * operating_company_id equality (a join that does not pin the entity can reach across companies even
 * when the base table is scoped).
 *
 * Selftest asserts every mutation APPLIED before reading the verdict; a probe that silently fails to
 * apply produces a green that means nothing.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/driver-finance/deductions.routes.ts";
const PATH = "/api/v1/driver-finance/deductions";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*(--|\/\/).*$/gm, "");

function check(src) {
  const clean = strip(src);
  const failures = [];

  const at = clean.indexOf(`"${PATH}"`);
  if (at === -1) {
    failures.push(`${ROUTES}: GET ${PATH} not found — the FAIL-DD2 list endpoint is missing (ACCT-F291)`);
    return { failures, joins: 0 };
  }
  const body = clean.slice(at, at + 4200);

  if (!/rateLimit\s*:\s*\{/.test(body)) {
    failures.push(`${ROUTES}: ${PATH} declares no rateLimit (CodeQL js/missing-rate-limiting) (ACCT-F291)`);
  }
  if (!/withCompany\s*\(/.test(body)) {
    failures.push(`${ROUTES}: ${PATH} does not run inside withCompany, so app.operating_company_id is never set (ACCT-F291)`);
  }
  // THE LOAD-BEARING ASSERTION: an explicit predicate, not just the GUC.
  if (!/d\.operating_company_id\s*=\s*\$1/.test(body)) {
    failures.push(
      `${ROUTES}: ${PATH} has no explicit d.operating_company_id predicate — it relies on the GUC alone, ` +
        `and org.user_accessible_company_ids() returns EVERY active company for an Owner session, so ` +
        `this would quietly BLEND ENTITIES rather than fail (ACCT-F291)`
    );
  }

  // Every join must be LEFT and entity-pinned.
  const joins = [...body.matchAll(/\b(LEFT\s+JOIN|JOIN)\s+([a-z_]+\.[a-z_]+)\s+(\w+)/gi)];
  for (const [, kind, table, alias] of joins) {
    if (!/^LEFT/i.test(kind)) {
      failures.push(
        `${ROUTES}: ${PATH} INNER-joins ${table} — that silently DROPS deductions whose ${alias} row was ` +
          `archived, shrinking a money list without saying so (ACCT-F291)`
      );
    }
    const pinned = new RegExp(`${alias}\\.operating_company_id\\s*=\\s*d\\.operating_company_id`).test(body);
    if (!pinned) {
      failures.push(
        `${ROUTES}: ${PATH} joins ${table} AS ${alias} without pinning ${alias}.operating_company_id = ` +
          `d.operating_company_id — the join can reach across companies even though the base table is scoped (ACCT-F291)`
      );
    }
  }
  return { failures, joins: joins.length };
}

function selftest() {
  const src = readFileSync(join(ROOT, ROUTES), "utf8");
  let probes = 0;
  const mutations = [
    {
      name: "explicit operating_company_id predicate removed (GUC-only)",
      apply: (s) => s.replace('const where = ["d.operating_company_id = $1"];', 'const where = ["1=1"];'),
    },
    {
      name: "a LEFT JOIN downgraded to INNER",
      apply: (s) => s.replace("LEFT JOIN mdata.drivers dr", "JOIN mdata.drivers dr"),
    },
    {
      name: "a join's entity pin removed",
      apply: (s) => s.replace("AND dr.operating_company_id = d.operating_company_id", ""),
    },
    { name: "rateLimit removed", apply: (s) => s.replace(/\{ config: \{ rateLimit: \{ max: 120, timeWindow: "1 minute" \} \} \},\n\s*/, "") },
  ];
  for (const m of mutations) {
    const mutated = m.apply(src);
    if (mutated === src) {
      console.error(`SELFTEST INERT: mutation "${m.name}" did not apply — the guard proves nothing.`);
      process.exit(1);
    }
    if (check(mutated).failures.length === 0) {
      console.error(`SELFTEST FAILED: guard stayed green with ${m.name}.`);
      process.exit(1);
    }
    probes++;
  }
  return probes;
}

const probes = selftest();
const { failures, joins } = check(readFileSync(join(ROOT, ROUTES), "utf8"));

if (failures.length > 0) {
  console.error("ACCT-F291 FAIL — the deductions list endpoint is not entity-safe:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `ACCT-F291 PASS — GET ${PATH}: rateLimit declared, withCompany wrapper present, EXPLICIT ` +
    `d.operating_company_id predicate present (the GUC is not trusted as a backstop), and all ${joins} ` +
    `joins are LEFT and entity-pinned. Mutation probes proven non-inert: ${probes}.`
);
