#!/usr/bin/env node
/**
 * A migration must never RAISE EXCEPTION because a chart-of-accounts ROLE BINDING is absent.
 *
 * Migrations run against a FRESH, EMPTY database in CI — that is the point of them. Chart-of-accounts
 * role bindings (accounting.chart_of_accounts_roles) are OPERATIONAL DATA, not migration output: the
 * migrations that seed them are themselves conditional on chart-of-accounts rows a fresh database does
 * not have, so on a fresh DB some roles are bound and others — ar_control among them — are simply
 * absent. A migration that treats that absence as an error takes down every fresh-DB run.
 *
 * This is not hypothetical. 202610110000_enable_qbo_projection_flags_transp.sql shipped exactly this
 * bug and CI caught it TWICE: once with a bare role check, and again after a first fix that wrongly
 * assumed a fresh database would have ZERO role bindings and used "no roles at all" as its
 * unprovisioned discriminator. It has some. The correct shape is to RAISE NOTICE and RETURN — skip,
 * changing nothing — which is also the safe direction for anything gated on the missing role.
 *
 * Note the distinction this guard is careful NOT to blur: raising on an absent org.companies row is
 * fine, because migrations do seed companies. The defect is specific to role bindings.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "db", "migrations");
const ROLE_TABLE = /chart_of_accounts_roles/i;

/** Strip SQL line comments so prose describing the rule cannot trip it. */
function stripComments(sql) {
  return sql
    .split("\n")
    .map((l) => {
      const i = l.indexOf("--");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

/**
 * Find `IF <cond> THEN … RAISE EXCEPTION` blocks whose condition tests chart_of_accounts_roles.
 * The window runs from the IF to its matching THEN-body RAISE, bounded by the next `END IF`, so a
 * later unrelated RAISE cannot be misattributed to this condition.
 */
export function offendingBlocks(sql) {
  const clean = stripComments(sql);
  const out = [];
  // Only `IF NOT EXISTS ( … ) THEN` — raising on ABSENCE. `IF EXISTS ( … ) THEN RAISE` is the opposite
  // shape: a data-integrity assertion that fires when something bad IS present, which is legitimate and
  // must not be flagged. Conflating the two produced six false positives on migrations that are correct.
  const re = /\bIF\s+NOT\s+EXISTS\s*\(/gi;
  let m;
  while ((m = re.exec(clean)) !== null) {
    // Walk the condition's parens to their real close, not to the first ')'.
    let depth = 1;
    let i = re.lastIndex;
    while (i < clean.length && depth > 0) {
      if (clean[i] === "(") depth += 1;
      else if (clean[i] === ")") depth -= 1;
      i += 1;
    }
    const condition = clean.slice(re.lastIndex, i - 1);
    if (!ROLE_TABLE.test(condition)) continue;

    // Body runs from THEN to the matching END IF, tracking nesting so an inner IF's END IF
    // does not truncate the body early.
    const thenIdx = clean.toUpperCase().indexOf("THEN", i - 1);
    if (thenIdx === -1) continue;
    let j = thenIdx + 4;
    let ifDepth = 1;
    const upper = clean.toUpperCase();
    while (j < clean.length && ifDepth > 0) {
      if (upper.startsWith("END IF", j)) {
        ifDepth -= 1;
        j += 6;
        continue;
      }
      if (upper.startsWith("IF ", j) && (j === 0 || /[^A-Z_]/.test(upper[j - 1]))) {
        ifDepth += 1;
      }
      j += 1;
    }
    const body = clean.slice(thenIdx, j);
    if (/RAISE\s+EXCEPTION/i.test(body)) {
      out.push(`${condition.replace(/\s+/g, " ").slice(0, 120)} => ${body.replace(/\s+/g, " ").slice(0, 100)}`);
    }
  }
  return out;
}

function selftest() {
  const cases = [
    {
      name: "RAISE on absent role binding is caught",
      sql: `IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE role='ar_control') THEN RAISE EXCEPTION 'nope'; END IF;`,
      expect: 1,
    },
    {
      name: "NOTICE + RETURN on absent role binding passes",
      sql: `IF NOT EXISTS (SELECT 1 FROM accounting.chart_of_accounts_roles WHERE role='ar_control') THEN RAISE NOTICE 'skipping'; RETURN; END IF;`,
      expect: 0,
    },
    {
      name: "RAISE on absent org.companies is NOT this defect",
      sql: `IF v_primary IS NULL THEN RAISE EXCEPTION 'no active org.companies row'; END IF;`,
      expect: 0,
    },
    {
      name: "comment prose naming the pattern does not trip it",
      sql: `-- do not RAISE EXCEPTION when chart_of_accounts_roles is missing\nSELECT 1;`,
      expect: 0,
    },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = offendingBlocks(c.sql).length;
    if (got !== c.expect) {
      console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`);
      bad += 1;
    } else {
      console.log(`  selftest OK — ${c.name}`);
    }
  }
  if (bad) {
    console.error(`verify-migration-no-raise-on-role-binding SELFTEST FAIL — ${bad}/${cases.length}`);
    process.exit(1);
  }
  console.log(`verify-migration-no-raise-on-role-binding SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    console.error(`verify-migration-no-raise-on-role-binding FAIL — cannot read ${MIGRATIONS_DIR}`);
    process.exit(1);
  }
  if (files.length === 0) {
    console.error("verify-migration-no-raise-on-role-binding FAIL — scanned 0 migrations; refusing to report green");
    process.exit(1);
  }

  const violations = [];
  for (const f of files) {
    for (const block of offendingBlocks(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))) {
      violations.push({ file: f, block });
    }
  }

  if (violations.length) {
    console.error("verify-migration-no-raise-on-role-binding FAIL — a migration raises on an absent role binding:");
    for (const v of violations) console.error(`\n  ${v.file}\n    ${v.block}`);
    console.error(
      "\nRole bindings are operational data and are ABSENT on a fresh database, so this breaks every" +
        "\nfresh-DB migration run. Use RAISE NOTICE + RETURN (skip, change nothing) instead."
    );
    process.exit(1);
  }

  console.log(
    `verify-migration-no-raise-on-role-binding OK — ${files.length} migrations scanned, none raise on an absent role binding`
  );
}

main();
