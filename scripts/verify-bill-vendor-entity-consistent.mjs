#!/usr/bin/env node
/**
 * verify-bill-vendor-entity-consistent.mjs — ACCT-F158. A bill's vendor must resolve inside the
 * bill's OWN entity, and an unresolvable vendor must be an error rather than a null FK.
 *
 * WHY THIS EXISTS. ACCT-F142 (#4614) added a partial unique index to stop the TMS entering the same
 * vendor bill twice. It is live on prod and it works. But it is PARTIAL on
 * `mdata_vendor_id IS NOT NULL`, so it binds only bills whose vendor FK is actually populated —
 * and `resolveBillVendorWriteColumns` in bills.service.ts was free to leave that column NULL.
 * Verified on prod 2026-08-07 (RLS-bypassed, completeness discriminator on the same table:
 * visible 16,258 == n_live_tup 16,258, current_user neondb_owner), 4 of the 13 TMS-native bills
 * carry `mdata_vendor_id IS NULL` — every one of them outside the duplicate guard entirely.
 *
 * The function failed OPEN in two directions, and the second is worse than the first:
 *
 *   1. vendor unresolved + non-uuid input -> mdataVendorId = null. The bill is written with no
 *      vendor FK, so ACCT-F142's index does not apply and the same bill can be entered without
 *      limit. The control exists and simply does not engage.
 *
 *   2. vendor unresolved + uuid-shaped input -> mdataVendorId = that uuid, written straight through.
 *      The lookup it just failed was ALREADY entity-scoped, so a uuid that resolves at all resolves
 *      to ANOTHER ENTITY'S vendor. `bills_mdata_vendor_id_fkey` REFERENCES mdata.vendors(id) with no
 *      entity predicate (verified on prod, pg_constraint), so the database accepts it: TRANSP can
 *      carry a USMCA vendor on a bill and every referential check in the system passes.
 *
 * Zero cross-entity bills exist on prod today (measured, same discriminator) — this is a structural
 * hole, not a realised loss, and it is closed now for the same reason ACCT-F142 §4 closed
 * bill_payments before it happened rather than after.
 *
 * THE REAL FIX IS THE DATABASE. Migration 202612270000 adds
 * `bills_mdata_vendor_entity_consistent_fkey` — a COMPOSITE FK on
 * (operating_company_id, mdata_vendor_id) -> mdata.vendors (operating_company_id, id), VALIDATEd —
 * which makes a cross-entity vendor impossible rather than merely detected (PERMANENT LAW §4: a DB
 * constraint beats a guard). This guard is the shrink-only ratchet over that fix: it fails if the
 * service regresses to a fail-open fallback, if the route stops mapping the error, or if the
 * composite FK is ever dropped from the migration set.
 *
 * WHAT IT ASSERTS
 *   A. bills.service.ts `resolveBillVendorWriteColumns` THROWS on an unresolved vendor and contains
 *      no fallback that returns a vendor id it did not resolve.
 *   B. bills.routes.ts maps `bill_vendor_not_in_company` to a 400 (a client error, not a 500).
 *   C. some migration installs the composite entity-consistent vendor FK on accounting.bills.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bill-vendor-entity-consistent";

const SERVICE = path.join("apps", "backend", "src", "accounting", "bills.service.ts");
const ROUTES = path.join("apps", "backend", "src", "accounting", "bills.routes.ts");
const MIGRATIONS = path.join("db", "migrations");

const ERROR_CODE = "bill_vendor_not_in_company";
const FK_NAME = "bills_mdata_vendor_entity_consistent_fkey";

/** Strip line and block comments so prose describing the defect never reads as the defect itself. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

/**
 * Extract `resolveBillVendorWriteColumns`'s body by brace matching.
 *
 * The parameter list must be skipped by PAREN matching first. Taking the first `{` after the
 * declaration is wrong on the real signature, whose first parameter is an inline TypeScript object
 * type — `client: { query: (...) => ... }` — so the naive scan brace-matched the TYPE and returned
 * it as the body. The guard then reported the fixed tree as unfixed. Found by running this guard
 * against the very commit that fixes the defect.
 */
export function extractResolver(src) {
  const start = src.search(/async\s+function\s+resolveBillVendorWriteColumns\b/);
  if (start === -1) return null;
  const lparen = src.indexOf("(", start);
  if (lparen === -1) return null;
  let parens = 0;
  let afterParams = -1;
  for (let i = lparen; i < src.length; i += 1) {
    if (src[i] === "(") parens += 1;
    else if (src[i] === ")") {
      parens -= 1;
      if (parens === 0) {
        afterParams = i + 1;
        break;
      }
    }
  }
  if (afterParams === -1) return null;
  const open = src.indexOf("{", afterParams);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  return null;
}

export function findViolations(root = ROOT) {
  const problems = [];

  // ── A. the service must fail closed ────────────────────────────────────────────────────────────
  const servicePath = path.join(root, SERVICE);
  if (!fs.existsSync(servicePath)) {
    problems.push({ where: SERVICE, why: "file missing — the bill vendor write path cannot be verified" });
  } else {
    const body = extractResolver(stripComments(fs.readFileSync(servicePath, "utf8")));
    if (body === null) {
      problems.push({ where: SERVICE, why: "resolveBillVendorWriteColumns not found — renamed or removed" });
    } else {
      if (!new RegExp(`throw[\\s\\S]{0,200}${ERROR_CODE}`).test(body)) {
        problems.push({
          where: SERVICE,
          why: `resolveBillVendorWriteColumns does not throw ${ERROR_CODE} when the vendor does not resolve`,
        });
      }
      // The fail-open signature: handing back an id the entity-scoped lookup did NOT return.
      if (/mdataVendorId\s*:\s*(?!row\.id\b)[^,}]*\b(?:isUuid|trimmed|vendorId|null)\b/.test(body)) {
        problems.push({
          where: SERVICE,
          why: "resolveBillVendorWriteColumns returns a mdataVendorId it did not resolve (fail-open fallback)",
        });
      }
    }
  }

  // ── B. the route must surface it as a client error ─────────────────────────────────────────────
  const routesPath = path.join(root, ROUTES);
  if (!fs.existsSync(routesPath)) {
    problems.push({ where: ROUTES, why: "file missing — the bill create error mapping cannot be verified" });
  } else if (!stripComments(fs.readFileSync(routesPath, "utf8")).includes(ERROR_CODE)) {
    problems.push({
      where: ROUTES,
      why: `${ERROR_CODE} is not mapped to a 400 — an unresolvable vendor would surface as a 500`,
    });
  }

  // ── C. the composite FK must exist in the migration set ────────────────────────────────────────
  const migDir = path.join(root, MIGRATIONS);
  const hasFk =
    fs.existsSync(migDir) &&
    fs
      .readdirSync(migDir)
      .filter((f) => f.endsWith(".sql"))
      .some((f) => {
        const sql = fs.readFileSync(path.join(migDir, f), "utf8");
        return (
          sql.includes(FK_NAME) &&
          /FOREIGN\s+KEY\s*\(\s*operating_company_id\s*,\s*mdata_vendor_id\s*\)/i.test(sql)
        );
      });
  if (!hasFk) {
    problems.push({
      where: MIGRATIONS,
      why: `no migration installs ${FK_NAME} over (operating_company_id, mdata_vendor_id) — the entity guarantee is gone`,
    });
  }

  return problems;
}

function report(problems) {
  if (!problems.length) {
    console.log(`${LABEL} OK — bill vendor resolution fails closed and the entity-consistent FK is installed`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):\n`);
  for (const p of problems) console.error(`  - ${p.where}: ${p.why}`);
  console.error(
    `\nA bill's vendor must resolve inside the bill's OWN entity. Returning null instead lets the bill\n` +
      `escape the ACCT-F142 duplicate index (which is partial on mdata_vendor_id IS NOT NULL); returning\n` +
      `an unresolved uuid stamps ANOTHER entity's vendor onto the bill, which the single-column FK\n` +
      `accepts. Fix: throw ${ERROR_CODE} in resolveBillVendorWriteColumns, map it to 400 in\n` +
      `bills.routes.ts, and keep the composite FK ${FK_NAME} in db/migrations.\n`
  );
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bill-vendor-"));
  const failures = [];

  const svcDir = path.join(tmp, "apps", "backend", "src", "accounting");
  const migDir = path.join(tmp, "db", "migrations");
  fs.mkdirSync(svcDir, { recursive: true });
  fs.mkdirSync(migDir, { recursive: true });

  // The signature deliberately carries the real file's inline object-type parameter. An extractor
  // that brace-matches from the declaration instead of paren-matching the parameter list returns
  // that TYPE as the body and reports the FIXED tree as broken — which is exactly what happened.
  const GOOD_SVC = `
async function resolveBillVendorWriteColumns(
  client: { query: (sql: string, values?: unknown[]) => Promise<{ rows: Array<{ id: string }> }> },
  operatingCompanyId: string,
  vendorId: string
): Promise<BillVendorWriteColumns> {
  const res = await client.query(\`SELECT v.id FROM mdata.vendors v WHERE v.operating_company_id = $1\`);
  const row = res.rows[0];
  if (row) { return { vendorIdText: row.qbo_vendor_id ?? trimmed, vendorUuidText: row.id, mdataVendorId: row.id }; }
  throw Object.assign(new Error("${ERROR_CODE}"), { code: "${ERROR_CODE}" });
}`;
  const GOOD_ROUTES = `if (message === "${ERROR_CODE}") return reply.code(400).send({ error: message });`;
  const GOOD_MIG = `ALTER TABLE accounting.bills ADD CONSTRAINT ${FK_NAME}
      FOREIGN KEY (operating_company_id, mdata_vendor_id)
      REFERENCES mdata.vendors (operating_company_id, id) NOT VALID;`;

  const writeAll = (svc, routes, mig) => {
    fs.writeFileSync(path.join(svcDir, "bills.service.ts"), svc);
    fs.writeFileSync(path.join(svcDir, "bills.routes.ts"), routes);
    fs.writeFileSync(path.join(migDir, "202612270000_fk.sql"), mig);
  };

  writeAll(GOOD_SVC, GOOD_ROUTES, GOOD_MIG);
  if (findViolations(tmp).length !== 0) failures.push("case1 FAIL — the fixed tree must be GREEN.");

  // Mutation 1 — the exact fail-open branch this finding is about (uuid passthrough).
  writeAll(
    GOOD_SVC.replace(
      `throw Object.assign(new Error("${ERROR_CODE}"), { code: "${ERROR_CODE}" });`,
      "return { vendorIdText: trimmed, vendorUuidText: isUuid ? trimmed : null, mdataVendorId: isUuid ? trimmed : null };"
    ),
    GOOD_ROUTES,
    GOOD_MIG
  );
  if (findViolations(tmp).length === 0) failures.push("case2 FAIL — the fail-open uuid fallback must go RED.");

  // Mutation 2 — silent null fallback.
  writeAll(
    GOOD_SVC.replace(
      `throw Object.assign(new Error("${ERROR_CODE}"), { code: "${ERROR_CODE}" });`,
      "return { vendorIdText: trimmed, vendorUuidText: null, mdataVendorId: null };"
    ),
    GOOD_ROUTES,
    GOOD_MIG
  );
  if (findViolations(tmp).length === 0) failures.push("case3 FAIL — the null fallback must go RED.");

  // Mutation 3 — route stops mapping the error, so it surfaces as a 500.
  writeAll(GOOD_SVC, "if (message === \"bill_lines_required\") return reply.code(400).send({});", GOOD_MIG);
  if (findViolations(tmp).length === 0) failures.push("case4 FAIL — unmapped route error must go RED.");

  // Mutation 4 — the composite FK is dropped from the migration set (shrink-only).
  writeAll(GOOD_SVC, GOOD_ROUTES, "-- unrelated migration\nSELECT 1;");
  if (findViolations(tmp).length === 0) failures.push("case5 FAIL — a missing composite FK must go RED.");

  // Mutation 5 — a SINGLE-column FK must not satisfy the entity requirement.
  writeAll(
    GOOD_SVC,
    GOOD_ROUTES,
    `ALTER TABLE accounting.bills ADD CONSTRAINT ${FK_NAME} FOREIGN KEY (mdata_vendor_id) REFERENCES mdata.vendors (id);`
  );
  if (findViolations(tmp).length === 0) failures.push("case6 FAIL — a single-column FK must not pass as entity-consistent.");

  // Mutation 6 — the fix described only in a COMMENT must not read as the fix.
  writeAll(
    `// resolveBillVendorWriteColumns throws ${ERROR_CODE} when the vendor is not in the company\n` +
      GOOD_SVC.replace(
        `throw Object.assign(new Error("${ERROR_CODE}"), { code: "${ERROR_CODE}" });`,
        "return { vendorIdText: trimmed, vendorUuidText: null, mdataVendorId: null };"
      ),
    GOOD_ROUTES,
    GOOD_MIG
  );
  if (findViolations(tmp).length === 0) failures.push("case7 FAIL — a fix written only in a comment must go RED.");

  writeAll(GOOD_SVC, GOOD_ROUTES, GOOD_MIG);
  if (findViolations(tmp).length !== 0) failures.push("case8 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — fixed GREEN; uuid-passthrough, null-fallback, unmapped route, dropped FK, ` +
      `single-column FK and comment-only "fix" each RED; restore GREEN`
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findViolations()));
}
