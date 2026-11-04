#!/usr/bin/env node
/**
 * ACCT-F5622 — accounting.recompute_invoice_paid() and accounting.recompute_payment_applied() must
 * exclude voided (unapplied) accounting.payment_applications rows from their SUM, or voiding a
 * customer payment silently fails to revert the invoice's paid status / the payment's applied total.
 *
 * Scans db/migrations/*.sql for the LAST (highest-numbered) CREATE OR REPLACE FUNCTION of each name —
 * migrations are append-only and a function can be redefined more than once, so only the final
 * definition on the migration timeline is what's actually live.
 */
import fs from "node:fs";
import path from "node:path";

const FUNCTIONS = ["accounting.recompute_invoice_paid", "accounting.recompute_payment_applied"];

function migrationFiles(root) {
  const dir = `${root}/db/migrations`;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort() // filenames are YYYYMMDDHHMM_slug.sql — lexicographic sort is chronological
    .map((f) => path.join(dir, f));
}

/** Extract the body of the LAST "CREATE OR REPLACE FUNCTION <name>()" ... "$function$;" block for `name`. */
function lastFunctionBody(files, name) {
  const escaped = name.replace(/\./g, "\\.");
  const re = new RegExp(
    `CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+${escaped}\\s*\\([^)]*\\)[\\s\\S]*?\\$(?:function\\$|\\$)[\\s\\S]*?\\$(?:function\\$|\\$)\\s*;`,
    "gi"
  );
  let last = null;
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const matches = text.match(re);
    if (matches && matches.length) last = { file, body: matches[matches.length - 1] };
  }
  return last;
}

export function run(root = process.cwd()) {
  const failures = [];
  const files = migrationFiles(root);

  for (const fn of FUNCTIONS) {
    const found = lastFunctionBody(files, fn);
    if (!found) {
      failures.push(`no CREATE OR REPLACE FUNCTION ${fn} found in db/migrations/`);
      continue;
    }
    // The SUM(amount_cents) query specifically must filter on unapplied_at IS NULL — anchored on
    // SUM(amount_cents) rather than the first bare "WHERE" in the function, because both functions
    // have an EARLIER, unrelated WHERE clause (the FOR-loop's "WHERE x.invoice_id IS NOT NULL" /
    // "WHERE x.payment_id IS NOT NULL") that a WHERE-anchored search would find first.
    let hasFilter = /SUM\(amount_cents\)[\s\S]{0,400}?unapplied_at\s+IS\s+NULL/i.test(found.body);
    // ACCT-F11103: recompute_invoice_paid derives v_paid from the ONE applied-amount rule,
    // accounting.invoice_applied_cents_as_of(<invoice>, 'infinity'). That delegation satisfies the requirement only when the
    // rule's own last definition excludes unapplied applications (as of 'infinity' = every unapplied row is excluded).
    if (!hasFilter && fn === "accounting.recompute_invoice_paid" && /v_paid\s*:=\s*accounting\.invoice_applied_cents_as_of\(\s*v_invoice_id\s*,\s*'infinity'::date\s*\)/i.test(found.body)) {
      const rule = lastFunctionBody(files, "accounting.invoice_applied_cents_as_of");
      hasFilter = !!rule && /pa\.unapplied_at\s+IS\s+NULL\s+OR\s+\(pa\.unapplied_at AT TIME ZONE 'UTC'\)::date\s*>\s*p_as_of/i.test(rule.body);
    }
    if (!hasFilter) {
      failures.push(
        `${fn} (last defined in ${path.basename(found.file)}) does not filter on unapplied_at IS NULL — ` +
          `voiding a payment application will not revert the invoice's paid status / the payment's applied total`
      );
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-payment-void-recompute-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodFn = (name, extraWhere = "") => `
CREATE OR REPLACE FUNCTION ${name}()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  SELECT COALESCE(SUM(amount_cents), 0)::bigint
    INTO v
  FROM accounting.payment_applications
  WHERE invoice_id = v_invoice_id${extraWhere}
    AND unapplied_at IS NULL;
  RETURN NULL;
END;
$function$;
`;
  mk(
    "db/migrations/202601010000_seed.sql",
    goodFn("accounting.recompute_invoice_paid") + goodFn("accounting.recompute_payment_applied")
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: a LATER migration redefines the function WITHOUT the filter — must be caught (only
  // the last definition matters, mirroring how Postgres actually applies migrations in order).
  mk(
    "db/migrations/202601020000_regress.sql",
    goodFn("accounting.recompute_invoice_paid").replace("\n    AND unapplied_at IS NULL", "")
  );
  const f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: regressed later redefinition (missing filter) should be caught");
  if (!f.some((m) => m.includes("recompute_invoice_paid"))) {
    throw new Error("FAIL fail: failure message should name recompute_invoice_paid specifically");
  }

  // ACCT-F11103: delegation to accounting.invoice_applied_cents_as_of passes only while that rule filters unapplied rows.
  const delegating = `
CREATE OR REPLACE FUNCTION accounting.recompute_invoice_paid()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    v_paid := accounting.invoice_applied_cents_as_of(v_invoice_id, 'infinity'::date);
  RETURN NULL;
END;
$function$;
`;
  const rule = (filter) => `
CREATE OR REPLACE FUNCTION accounting.invoice_applied_cents_as_of(p_invoice_id uuid, p_as_of date)
RETURNS bigint
LANGUAGE sql
AS $$
  SELECT COALESCE(SUM(pa.amount_cents), 0) FROM accounting.payment_applications pa WHERE pa.invoice_id = p_invoice_id${filter};
$$;
`;
  mk("db/migrations/202601030000_delegate.sql", rule("\n     AND (pa.unapplied_at IS NULL OR (pa.unapplied_at AT TIME ZONE 'UTC')::date > p_as_of)") + delegating);
  if (run(tmp).length) throw new Error("PASS fail (delegation to a filtering rule): " + run(tmp).join("; "));
  mk("db/migrations/202601040000_rule_regress.sql", rule(""));
  if (!run(tmp).some((m) => m.includes("recompute_invoice_paid"))) {
    throw new Error("FAIL fail: delegation to a rule WITHOUT the unapplied filter should be caught");
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-payment-void-recompute-unapplied-filter --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-payment-void-recompute-unapplied-filter — OK");
}
