import fs from "node:fs";
import path from "node:path";

// LST-RLS-01 — catalogs.account_types and catalogs.wo_cancellation_reasons must carry FORCE RLS with
// role-gated WRITE authz, must NOT be entity-scoped, and must NOT be DELETE-able.
//
// THE DEFECT THIS PINS (proven on a throwaway Postgres before the fix — see the PR body):
//   • 202606080010_account_type_detail_type_catalog.sql:16-27,54 created catalogs.account_types with no
//     operating_company_id, no RLS, no policy, and GRANT SELECT,INSERT,UPDATE to ih35_app.
//   • 202606221200_wo_enhancements_cancel.sql:31-46 created catalogs.wo_cancellation_reasons the same way
//     and additionally GRANTed DELETE outright.
//   • catalogs also carries ALTER DEFAULT PRIVILEGES … GRANT …, DELETE ON TABLES TO ih35_app
//     (0065_p3_cleanup_3_permanent_grants.sql:48, 0116_p6_privilege_reconciliation.sql:45-46), so DELETE
//     reached account_types too even though its own GRANT never named it.
//   With RLS off, a Dispatcher-role session could INSERT a rogue account type, rename the canonical BANK
//   type, and DELETE a work-order cancellation reason that historical cancelled WOs point at.
//
// THE SECOND DEFECT THIS PINS — the one that is easy to "fix" into an outage. Both tables are
// SHARED-CANONICAL: they have no operating_company_id by design (202607011700_detail_types_per_entity_
// custom.sql:5-13 states the account-type taxonomy is GLOBAL and the entity boundary lives on
// catalogs.detail_types.operating_company_id; 202606221200:9-10 records the same for the WO reasons).
// Adding operating_company_id and an `= current_setting('app.operating_company_id')` predicate under
// FORCE RLS would make every existing row invisible and blank both dropdowns. So this guard ALSO fails if
// a future migration company-scopes either table.
//
// Static-only: it reads db/migrations/*.sql. It cannot see prod — the owner Neon-applies the held
// migration. What it does guarantee is that the repo can never regress to the pre-fix shape.

const MIG_DIR = "db/migrations";
const LABEL = "verify-global-catalog-write-authz";

const TABLES = [
  {
    table: "catalogs.account_types",
    creator: "202606080010_account_type_detail_type_catalog.sql",
    why: "the canonical 15-type QBO taxonomy the whole chart of accounts is keyed to",
  },
  {
    table: "catalogs.wo_cancellation_reasons",
    creator: "202606221200_wo_enhancements_cancel.sql",
    why: "the reason labels maintenance.work_orders.cancel_reason_code points at (legal-evidence data)",
  },
];

const ROLE_FN = "identity.current_user_role()";

// Normalise so multi-line / re-indented SQL still matches.
const flat = (s) => s.replace(/\s+/g, " ");

/** Strip `--` line comments so a table named only inside a comment never satisfies an assertion. */
function stripComments(sql) {
  return sql
    .split("\n")
    .map((line) => {
      const i = line.indexOf("--");
      return i === -1 ? line : line.slice(0, i);
    })
    .join("\n");
}

export function assertGlobalCatalogWriteAuthz(sources) {
  const errs = [];

  for (const { table, creator, why } of TABLES) {
    const bare = table.split(".")[1];
    // Every statement in the repo that mentions this table, comments removed.
    const corpus = Object.entries(sources)
      .filter(([, sql]) => sql.includes(table))
      .map(([file, sql]) => ({ file, code: flat(stripComments(sql)) }));

    if (corpus.length === 0) {
      errs.push(`${table} appears in no migration at all — expected at least ${creator}`);
      continue;
    }
    const all = corpus.map((c) => c.code).join("\n");

    // 1. RLS must be ENABLEd and FORCEd.
    if (!new RegExp(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`, "i").test(all)) {
      errs.push(
        `${table}: no ENABLE ROW LEVEL SECURITY in any migration — RLS is OFF, so the GRANT alone authorises every write (${why})`,
      );
    }
    if (!new RegExp(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`, "i").test(all)) {
      errs.push(
        `${table}: no FORCE ROW LEVEL SECURITY — without FORCE the table owner bypasses every policy`,
      );
    }

    // 2. A SELECT policy must exist and must NOT be entity-scoped (shared-canonical class).
    const selectPolicy = new RegExp(
      `CREATE POLICY \\S+ ON ${table} FOR SELECT USING \\( ?true ?\\)`,
      "i",
    );
    if (!selectPolicy.test(all)) {
      errs.push(
        `${table}: no 'FOR SELECT USING (true)' policy. This catalog is SHARED-CANONICAL — it has no ` +
          `operating_company_id, so any narrower read predicate under FORCE RLS returns ZERO rows and blanks its dropdown`,
      );
    }

    // 3. INSERT and UPDATE must be role-gated.
    for (const cmd of ["INSERT", "UPDATE"]) {
      const policyRe = new RegExp(`CREATE POLICY \\S+ ON ${table} FOR ${cmd}\\b([\\s\\S]*?)(?=CREATE POLICY|DROP POLICY|EXECUTE '|COMMENT ON|GRANT |REVOKE |END\\b|$)`, "i");
      const m = all.match(policyRe);
      if (!m) {
        errs.push(`${table}: no FOR ${cmd} policy — ${cmd} is authorised by the GRANT alone, i.e. by ANY role`);
        continue;
      }
      if (!m[1].includes(ROLE_FN)) {
        errs.push(
          `${table}: the FOR ${cmd} policy does not consult ${ROLE_FN} — a write-authz policy that never ` +
            `checks the caller's role does not restrict anything`,
        );
      }
      if (!/'Owner'::identity\.role_enum/.test(m[1])) {
        errs.push(`${table}: the FOR ${cmd} policy does not name the Owner role`);
      }
    }

    // 4. DELETE must be revoked AND unpolicied (void-not-delete, doubly enforced).
    if (!new RegExp(`REVOKE DELETE ON ${table} FROM ih35_app`, "i").test(all)) {
      errs.push(
        `${table}: no 'REVOKE DELETE … FROM ih35_app'. The catalogs schema carries ALTER DEFAULT PRIVILEGES ` +
          `granting DELETE (0065:48, 0116:45-46), so a narrow GRANT does NOT remove it — DELETE must be revoked explicitly`,
      );
    }
    if (new RegExp(`CREATE POLICY \\S+ ON ${table} FOR (DELETE|ALL)\\b`, "i").test(all)) {
      errs.push(
        `${table}: a FOR DELETE (or FOR ALL, which covers DELETE) policy exists — void-not-delete means ` +
          `DELETE must have NO permissive policy, so RLS refuses it even if a future grant sweep re-grants it`,
      );
    }

    // 5. NEVER entity-scope this table (the takes-it-to-zero-rows failure mode).
    const scopeRe = new RegExp(
      `ALTER TABLE ${table}[^;]*ADD COLUMN (IF NOT EXISTS )?operating_company_id`,
      "i",
    );
    if (scopeRe.test(all)) {
      errs.push(
        `${table}: a migration adds operating_company_id. This catalog is SHARED-CANONICAL by locked design ` +
          `(202607011700:5-13 / 202606221200:9-10); company-scoping it makes every existing row (all-NULL ` +
          `operating_company_id) invisible under FORCE RLS and empties the picker`,
      );
    }
    if (new RegExp(`ON ${table}[\\s\\S]{0,400}?current_setting\\('app\\.operating_company_id'`, "i").test(all)) {
      errs.push(
        `${table}: a policy on this table reads app.operating_company_id. It has no operating_company_id ` +
          `column — an entity predicate here evaluates against NULL and returns zero rows`,
      );
    }

    // 6. Nothing may DROP/TRUNCATE it (NEVER-DELETE).
    if (new RegExp(`(DROP TABLE|TRUNCATE)[^;]*${bare}`, "i").test(all)) {
      errs.push(`${table}: a migration DROPs or TRUNCATEs it — ARCHIVE, never DELETE`);
    }
  }

  return errs;
}

function loadMigrations(dir) {
  const out = {};
  for (const f of fs.readdirSync(dir).sort()) {
    if (f.endsWith(".sql")) out[f] = fs.readFileSync(path.join(dir, f), "utf8");
  }
  return out;
}

function selftest(live) {
  const failures = [];
  const expectCaught = (name, mutate, needle) => {
    const copy = { ...live };
    mutate(copy);
    if (JSON.stringify(copy) === JSON.stringify(live)) {
      failures.push(`${name}: INERT — the mutation did not change the source, so the assertion proves nothing`);
      return;
    }
    const errs = assertGlobalCatalogWriteAuthz(copy);
    if (!errs.some((e) => e.includes(needle))) {
      failures.push(`${name}: NOT caught (got: ${errs.join(" | ") || "none"})`);
    }
  };
  const MIG = "202608100000_lst_rls_01_global_catalog_write_authz.sql";
  if (!live[MIG]) {
    console.error(`[${LABEL}] --selftest FAILED — fix migration ${MIG} is absent; the selftest would be vacuous`);
    process.exit(1);
  }

  // Each case reproduces a real way the fix could be undone or faked.
  expectCaught("force-rls removed", (s) => {
    s[MIG] = s[MIG].replaceAll("FORCE ROW LEVEL SECURITY", "-- FORCE ROW LEVEL SECURITY");
  }, "no FORCE ROW LEVEL SECURITY");

  expectCaught("rls never enabled", (s) => {
    s[MIG] = s[MIG].replaceAll("ENABLE ROW LEVEL SECURITY", "-- ENABLE ROW LEVEL SECURITY");
  }, "no ENABLE ROW LEVEL SECURITY");

  expectCaught("write policy stops checking the role", (s) => {
    s[MIG] = s[MIG].replaceAll(ROLE_FN, "TRUE::text::identity.role_enum");
  }, "does not consult");

  expectCaught("DELETE revoke dropped", (s) => {
    s[MIG] = s[MIG].replaceAll("REVOKE DELETE ON", "-- REVOKE DELETE ON");
  }, "no 'REVOKE DELETE");

  expectCaught("a FOR ALL policy re-opens DELETE", (s) => {
    s[MIG] = s[MIG].replace(
      "CREATE POLICY account_types_update_admin ON catalogs.account_types\n      FOR UPDATE",
      "CREATE POLICY account_types_update_admin ON catalogs.account_types\n      FOR ALL",
    );
  }, "which covers DELETE");

  expectCaught("SELECT policy narrowed off USING (true)", (s) => {
    s[MIG] = s[MIG].replace(
      "CREATE POLICY account_types_read_all ON catalogs.account_types\n      FOR SELECT\n      USING (true)",
      "CREATE POLICY account_types_read_all ON catalogs.account_types\n      FOR SELECT\n      USING (is_active)",
    );
  }, "USING (true)");

  expectCaught("a later migration company-scopes the shared catalog", (s) => {
    s["209912310000_bad_entity_scope.sql"] =
      "ALTER TABLE catalogs.account_types ADD COLUMN IF NOT EXISTS operating_company_id uuid;";
  }, "SHARED-CANONICAL by locked design");

  expectCaught("a later migration adds an entity predicate", (s) => {
    s["209912310001_bad_entity_policy.sql"] =
      "CREATE POLICY p ON catalogs.wo_cancellation_reasons FOR SELECT USING (operating_company_id::text = current_setting('app.operating_company_id', true));";
  }, "reads app.operating_company_id");

  expectCaught("the catalog is dropped instead of archived", (s) => {
    s["209912310002_bad_drop.sql"] = "DROP TABLE catalogs.wo_cancellation_reasons;";
  }, "ARCHIVE, never DELETE");

  if (failures.length) {
    console.error(`[${LABEL}] --selftest FAILED — ${failures.length} assertion(s) do not actually assert:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] --selftest OK — 9 mutations, each caught.`);
}

function main() {
  if (!fs.existsSync(MIG_DIR)) {
    console.error(`[${LABEL}] FAILED — ${MIG_DIR} not found (run from the repo root)`);
    process.exit(1);
  }
  const live = loadMigrations(MIG_DIR);
  if (process.argv.includes("--selftest")) {
    selftest(live);
    return;
  }
  const errs = assertGlobalCatalogWriteAuthz(live);
  if (errs.length) {
    console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
    for (const e of errs) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  console.log(
    `[${LABEL}] OK — catalogs.account_types and catalogs.wo_cancellation_reasons both carry FORCE RLS, ` +
      `an open SELECT policy (shared-canonical: NOT entity-scoped), Owner/Administrator-gated INSERT+UPDATE ` +
      `policies, an explicit REVOKE DELETE, and no DELETE/FOR-ALL policy.`,
  );
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]).endsWith("1522-verify-global-catalog-write-authz.mjs");
if (isDirect) main();

export default {
  name: LABEL,
  async run(ctx) {
    // Self-contained (no scripts/verify-*.mjs shim): selftest first so a hollow assertion fails loudly,
    // then the real check. Both run in a child process so a process.exit cannot kill the whole run.
    ctx.run("node", ["scripts/verify-steps/1522-verify-global-catalog-write-authz.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-steps/1522-verify-global-catalog-write-authz.mjs"]);
  },
};
