#!/usr/bin/env node
/**
 * MAINT-MONEY-F6750A-WARRANTY-REIMBURSE-UPDATE-FALSE-SUCCESS
 *
 * POST /api/v1/maintenance/warranty/claims/:id/reimburse pre-reads an active claim, then fires the
 * company-scoped, archived_at-guarded UPDATE that transitions it to 'reimbursed' — but used to
 * discard the UPDATE's result entirely. fetchClaimById (the re-read used both for the pre-check and
 * the response) carries NO archived_at filter of its own, so a concurrent archive between the
 * pre-read and the UPDATE (making the UPDATE match zero rows) would still let the handler fall
 * through to audit "reimbursed" and invoke postWarrantyReimbursement (a real GL hop) for a
 * transition that changed zero canonical claim rows. This guard locks the fix: the reimburse
 * UPDATE must RETURN an identity and that result must be checked for exactly one row before either
 * the audit call or the GL poster runs.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/maintenance/warranty.routes.ts";
const ROUTE_MARKER = 'app.post("/api/v1/maintenance/warranty/claims/:id/reimburse"';

export function run(root = process.cwd()) {
  const failures = [];
  let routes;
  try {
    routes = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  const postIdx = routes.indexOf(ROUTE_MARKER);
  if (postIdx < 0) {
    failures.push("POST .../claims/:id/reimburse handler not found");
    return failures;
  }
  const nextRouteIdx = routes.indexOf("\n  app.", postIdx + 1);
  const handler = routes.slice(postIdx, nextRouteIdx > 0 ? nextRouteIdx : undefined);

  if (!handler.includes("postWarrantyReimbursement")) {
    failures.push("handler slice does not look like the reimburse POST body (missing postWarrantyReimbursement call) — marker/scoping broken");
  }

  const updateIdx = handler.indexOf("SET status = 'reimbursed'");
  if (updateIdx < 0) {
    failures.push("handler is missing the reimburse UPDATE statement — marker/scoping broken");
    return failures;
  }
  // Scope to the UPDATE statement + its immediately-following result check, not the whole handler.
  const updateSlice = handler.slice(Math.max(0, updateIdx - 200), updateIdx + 900);

  if (!/RETURNING\s+id/i.test(updateSlice)) {
    failures.push("reimburse UPDATE must RETURN an identity so its match can be checked");
  }
  if (!/\.rows\[0\]/.test(updateSlice)) {
    failures.push("reimburse UPDATE result must be checked (e.g. !result.rows[0]) before the audit/GL-post proceeds");
  }
  if (!/return null/.test(updateSlice)) {
    failures.push("a zero-row reimburse UPDATE must return null (→ 404), not silently continue");
  }

  // The audit call and the GL post must both be textually AFTER the result check, not before it.
  const checkIdx = handler.search(/if\s*\(!\w+\.rows\[0\]\)\s*return null;/);
  const auditIdx = handler.indexOf('"maintenance.warranty_claim.reimbursed"');
  if (checkIdx < 0) {
    failures.push("could not locate the zero-row guard (if (!<result>.rows[0]) return null;)");
  } else if (auditIdx >= 0 && auditIdx < checkIdx) {
    failures.push("the reimbursed audit call must run AFTER the UPDATE's row-count guard, not before it");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-warranty-reimburse-");
  const dir = `${tmp}/apps/backend/src/maintenance`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
  app.post("/api/v1/maintenance/warranty/claims/:id/reimburse", async (req, reply) => {
    const row = await withCompany(user.uuid, parsed.data.operating_company_id, async (client) => {
      const existing = await fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
      if (!existing || existing.archived_at) return null;
      const reimbursed = await client.query(
        \`UPDATE maintenance.warranty_claims
         SET status = 'reimbursed'
         WHERE id = $1 AND operating_company_id = $2::uuid AND archived_at IS NULL
         RETURNING id::text\`,
        [params.data.id, parsed.data.operating_company_id]
      );
      if (!reimbursed.rows[0]) return null;
      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.reimbursed", {});
      return fetchClaimById(client, parsed.data.operating_company_id, params.data.id);
    });
    if (!row) return reply.code(404).send({ error: "not_found" });
    const gl = await postWarrantyReimbursement({ operating_company_id: parsed.data.operating_company_id });
    return reply.send({ ...mapWarrantyClaimRow(row), gl_posting: gl });
  });
  app.post("/api/v1/maintenance/warranty/claims/:id/archive", async (req, reply) => {});
`;
  fs.writeFileSync(`${dir}/warranty.routes.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — no RETURNING, result discarded, unconditional continue.
  const broken1 = fixed
    .replace(
      /const reimbursed = await client\.query\(\s*`UPDATE maintenance\.warranty_claims\s*SET status = 'reimbursed'\s*WHERE id = \$1 AND operating_company_id = \$2::uuid AND archived_at IS NULL\s*RETURNING id::text`,\s*\[params\.data\.id, parsed\.data\.operating_company_id\]\s*\);\s*if \(!reimbursed\.rows\[0\]\) return null;/,
      `await client.query(
        \`UPDATE maintenance.warranty_claims
         SET status = 'reimbursed'
         WHERE id = $1 AND operating_company_id = $2::uuid AND archived_at IS NULL\`,
        [params.data.id, parsed.data.operating_company_id]
      );`
    );
  fs.writeFileSync(`${dir}/warranty.routes.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: discarded/unchecked reimburse UPDATE went undetected");

  // Mutation 2: RETURNING present but the audit call moved BEFORE the row-count guard.
  const broken2 = fixed.replace(
    'if (!reimbursed.rows[0]) return null;\n      await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.reimbursed", {});',
    'await appendCrudAudit(client, user.uuid, "maintenance.warranty_claim.reimbursed", {});\n      if (!reimbursed.rows[0]) return null;'
  );
  fs.writeFileSync(`${dir}/warranty.routes.ts`, broken2);
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: audit-before-guard ordering went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-warranty-reimburse-update-checked SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-warranty-reimburse-update-checked FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-warranty-reimburse-update-checked OK — reimburse UPDATE result is checked before audit/GL-post");
