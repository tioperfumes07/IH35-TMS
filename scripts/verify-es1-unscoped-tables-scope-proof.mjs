#!/usr/bin/env node
// verify-es1-unscoped-tables-scope-proof.mjs — 0519-es1-58 / ACCT-R-12 CI guard (NON-FINANCIAL)

import fs from "node:fs";
import path from "node:path";
import {
  hasEnforcedFk,
  hasForceRls,
  hasOwnScopeColumn,
  hasParentIsolationPolicy,
  loadCorpus,
  ROOT,
} from "./lib/migration-scope-proof.mjs";

const LABEL = "verify:es1-unscoped-tables-scope-proof";
const REGISTRY_PATH = path.join(ROOT, "scripts/lib/es1-unscoped-tables-registry.json");
const ALLOWLIST_PATH = path.join(ROOT, "scripts/entity-isolation-allowlist.json");

export function loadRegistry(sources) {
  const raw = sources?.registry ?? fs.readFileSync(REGISTRY_PATH, "utf8");
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!Array.isArray(parsed.tables) || parsed.tables.length === 0) {
    throw new Error(`${REGISTRY_PATH}: registry must contain a non-empty tables[] array`);
  }
  return parsed;
}

export function loadGlobalAllowlist(sources) {
  const raw = sources?.allowlist ?? fs.readFileSync(ALLOWLIST_PATH, "utf8");
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  return new Set((parsed.global ?? []).map((r) => `${r.schema}.${r.table}`));
}

function assertRatchet(label, declared, actual, failures, table) {
  if (declared === "enforced" && !actual) {
    failures.push(`${table}: ${label} is registry-enforced but MISSING in db/migrations/ (regression)`);
  } else if (declared === "deferred" && actual) {
    failures.push(
      `${table}: ${label} is now present in db/migrations/ but registry still says deferred — PROMOTE to enforced in es1-unscoped-tables-registry.json`,
    );
  }
}

export function verifyEs1UnscopedTablesScopeProof({ corpus, registry, globalSet }) {
  const failures = [];
  const notes = [];
  const seen = new Set();

  for (const entry of registry.tables) {
    const { table } = entry;
    if (seen.has(table)) {
      failures.push(`${table}: duplicate registry row`);
      continue;
    }
    seen.add(table);

    const force = hasForceRls(corpus, table);
    assertRatchet("FORCE RLS", entry.forceRlsStatus, force, failures, table);

    if (entry.disposition === "own_scope_promoted") {
      if (!hasOwnScopeColumn(corpus, table)) {
        failures.push(`${table}: disposition own_scope_promoted but no own scope column in migrations (regression)`);
      } else {
        notes.push(`PROMOTED  ${table} — own scope column present`);
      }
      continue;
    }

    if (entry.disposition === "global_exempt") {
      if (!globalSet.has(table)) {
        failures.push(`${table}: global_exempt but absent from entity-isolation-allowlist.json global[]`);
      }
      continue;
    }

    if (entry.disposition === "inherit_via_parent") {
      const fk = hasEnforcedFk(corpus, table, entry.parentIdCol, entry.parent);
      const iso = hasParentIsolationPolicy(corpus, table, entry.parentIdCol, entry.parent);
      assertRatchet(`FK ${entry.parentIdCol}->${entry.parent}`, entry.fkStatus, fk, failures, table);
      assertRatchet("parent-isolation RLS policy", entry.parentIsolationStatus, iso, failures, table);
      continue;
    }

    if (hasOwnScopeColumn(corpus, table)) {
      failures.push(
        `${table}: gained an own scope column but registry still lists disposition:${entry.disposition} — PROMOTE to own_scope_promoted`,
      );
    }
  }

  return { failures, notes, count: registry.tables.length };
}

if (process.argv.includes("--selftest")) {
  const corpus = `
    ALTER TABLE accounting.bill_lines FORCE ROW LEVEL SECURITY;
    CREATE POLICY bill_lines_company_isolation ON accounting.bill_lines
      FOR ALL TO ih35_app
      USING (
        identity.is_lucia_bypass()
        OR bill_id IN (
          SELECT b.id FROM accounting.bills b
          WHERE b.operating_company_id = NULLIF(current_setting('app.operating_company_id', true), '')::uuid
        )
      );
    ALTER TABLE catalogs.journal_entry_types FORCE ROW LEVEL SECURITY;
  `;
  const good = verifyEs1UnscopedTablesScopeProof({
    corpus,
    registry: {
      tables: [
        {
          table: "accounting.bill_lines",
          disposition: "inherit_via_parent",
          parentIdCol: "bill_id",
          parent: "accounting.bills",
          fkStatus: "deferred",
          parentIsolationStatus: "enforced",
          forceRlsStatus: "enforced",
        },
        {
          table: "catalogs.journal_entry_types",
          disposition: "global_by_design",
          forceRlsStatus: "enforced",
        },
      ],
    },
    globalSet: new Set(),
  });
  if (good.failures.length) {
    console.error(`${LABEL} --selftest FAIL (good case): ${good.failures.join("; ")}`);
    process.exit(1);
  }
  const bad = verifyEs1UnscopedTablesScopeProof({
    corpus,
    registry: {
      tables: [
        {
          table: "accounting.bill_lines",
          disposition: "inherit_via_parent",
          parentIdCol: "bill_id",
          parent: "accounting.bills",
          fkStatus: "deferred",
          parentIsolationStatus: "enforced",
          forceRlsStatus: "deferred",
        },
      ],
    },
    globalSet: new Set(),
  });
  if (!bad.failures.some((f) => f.includes("FORCE RLS"))) {
    console.error(`${LABEL} --selftest FAIL: expected FORCE RLS regression detection`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK`);
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = loadRegistry({});
  const globalSet = loadGlobalAllowlist({});
  const corpus = loadCorpus();
  const { failures, notes, count } = verifyEs1UnscopedTablesScopeProof({ corpus, registry, globalSet });
  for (const n of notes) console.log(`  ${n}`);
  if (failures.length) {
    console.error(`${LABEL} FAIL (${failures.length}):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — ${count} registered ES1 unscoped tables match declared scope-proof + FORCE RLS ratchet (audit claim ${registry.auditClaimCount})`,
  );
}
