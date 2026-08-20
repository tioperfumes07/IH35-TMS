#!/usr/bin/env node
/**
 * ACCT-F5621 — dedicated guard for the bank-transaction notes PATCH route itself
 * (PATCH /api/v1/banking/transactions/:id/notes, link.routes.ts). Distinct from
 * verify-banking-attachments-notes-honesty.mjs (which checks the FRONTEND is honestly wired):
 * this one checks the BACKEND route's own invariants —
 *   1. role-gated (Owner/Administrator only, matching every other banking mutation route)
 *   2. append-only (concat onto existing notes, never overwrite)
 *   3. NOT restricted to source='manual' (unlike the sibling date-edit route) — a note is
 *      operator metadata, not an edit to the bank's reported facts, so it must work on
 *      Plaid-fed rows too
 *   4. audit-logged via appendCrudAudit
 *   5. company-scoped (operating_company_id in both the WHERE and the withCompanyScope call)
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/integrations/plaid/link.routes.ts`, "utf8");

  const routeMatch = src.match(
    /app\.patch\(\s*"\/api\/v1\/banking\/transactions\/:id\/notes"[\s\S]{0,2500}?\n\s*\}\s*\n\s*\);/
  );
  if (!routeMatch) {
    failures.push("PATCH /api/v1/banking/transactions/:id/notes route not found in link.routes.ts");
    return failures;
  }
  const routeBody = routeMatch[0];

  if (!routeBody.includes("ensureRole(reply, user.role, ownerAdminRoles)")) {
    failures.push("notes PATCH route must be gated by ensureRole(..., ownerAdminRoles)");
  }
  if (!/ELSE\s+concat\(notes,\s*E'\\\\n',\s*\$3::text\)/.test(routeBody)) {
    failures.push("notes PATCH must append via concat(notes, E'\\n', $3::text), not overwrite the column");
  }
  if (routeBody.includes("source = 'manual'") || routeBody.includes('source === "manual"')) {
    failures.push("notes PATCH must NOT be restricted to source='manual' — notes work on any bank-fed row too");
  }
  if (!routeBody.includes("appendCrudAudit")) {
    failures.push("notes PATCH must call appendCrudAudit to log the change");
  }
  if (!routeBody.includes("withCompanyScope")) {
    failures.push("notes PATCH must run inside withCompanyScope (RLS company scoping)");
  }
  if (!routeBody.includes("operating_company_id = $2::uuid")) {
    failures.push("notes PATCH's UPDATE must scope on operating_company_id");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-notes-route-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
    app.patch(
      "/api/v1/banking/transactions/:id/notes",
      { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
      async (req, reply) => {
        if (!ensureRole(reply, user.role, ownerAdminRoles)) return;
        const outcome = await withCompanyScope(user.uuid, body.data.operating_company_id, async (client) => {
          const updated = await client.query(
            \`UPDATE banking.bank_transactions
                SET notes = CASE
                      WHEN notes IS NULL OR notes = '' THEN $3::text
                      ELSE concat(notes, E'\\\\n', $3::text)
                    END
              WHERE id = $1
                AND operating_company_id = $2::uuid
              RETURNING id, notes\`,
            [params.data.id, body.data.operating_company_id, body.data.note]
          );
          await appendCrudAudit(client, user.uuid, "banking.transaction.note_added", {}, "info", "ACCT-F5621");
          return { status: "ok" };
        });
      }
    );
  `;
  mk("apps/backend/src/integrations/plaid/link.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  mk(
    "apps/backend/src/integrations/plaid/link.routes.ts",
    good.replace("if (!ensureRole(reply, user.role, ownerAdminRoles)) return;", "")
  );
  if (!run(tmp).length) throw new Error("FAIL fail: missing role gate should be caught");

  mk("apps/backend/src/integrations/plaid/link.routes.ts", good.replace("appendCrudAudit", "// no audit"));
  if (!run(tmp).length) throw new Error("FAIL fail: missing audit call should be caught");

  mk(
    "apps/backend/src/integrations/plaid/link.routes.ts",
    good.replace("WHEN notes IS NULL OR notes = '' THEN $3::text", "").replace(
      "ELSE concat(notes, E'\\\\n', $3::text)",
      "SET notes = $3::text"
    )
  );
  if (!run(tmp).length) throw new Error("FAIL fail: overwrite instead of append should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-transaction-notes-patch-route --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-transaction-notes-patch-route — OK");
}
