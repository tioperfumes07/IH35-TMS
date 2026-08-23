#!/usr/bin/env node
/**
 * verify-customer-contract-file-company-scope.mjs  (CUST-F5999)
 *
 * Root cause: apps/backend/src/customer-contracts/customer-contract.routes.ts POST create validated
 * an incoming file_id by existence/undeleted-state ONLY (`WHERE id = $1 AND deleted_at IS NULL`, no
 * company predicate), and POST supersede accepted file_id WITHOUT VALIDATING IT AT ALL. Both mutation
 * paths could therefore persist a cross-company docs.files reference onto customer.contract.file_id —
 * CUST-F5998 fixed the GET routes' joined-metadata disclosure but left both writers unrepaired.
 *
 * This guard makes the regression impossible to re-ship: create and supersede must each validate
 * file_id against docs.files scoped to the resolved operating_company_id BEFORE the INSERT.
 *
 * Usage:
 *   node scripts/verify-customer-contract-file-company-scope.mjs            # scan
 *   node scripts/verify-customer-contract-file-company-scope.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/customer-contracts/customer-contract.routes.ts";

const ROUTE_MARKERS = [
  { name: "POST create", marker: 'app.post("/api/v1/customer-contracts",' },
  { name: "POST supersede", marker: 'app.post("/api/v1/customer-contracts/:id/supersede",' },
];

const SCOPED_FILE_CHECK =
  /SELECT id FROM docs\.files WHERE id = \$1 AND operating_company_id = \$2::uuid AND deleted_at IS NULL/;

export function checkFileIdIsCompanyScoped(src) {
  const offenders = [];
  const markerIndexes = ROUTE_MARKERS.map((r) => ({ ...r, idx: src.indexOf(r.marker) }));
  for (const { name, marker, idx } of markerIndexes) {
    if (idx === -1) {
      offenders.push(`${ROUTES_FILE}: route marker not found — ${marker} (has this route moved or been renamed?)`);
      continue;
    }
    const nextIdx = Math.min(...markerIndexes.filter((m) => m.idx > idx).map((m) => m.idx), src.length);
    const slice = src.slice(idx, nextIdx);
    if (!/if \(body\.data\.file_id\)/.test(slice)) {
      offenders.push(`${ROUTES_FILE}: ${name} never validates file_id at all — CUST-F5999 regression shape (unvalidated cross-company FK write)`);
      continue;
    }
    if (!SCOPED_FILE_CHECK.test(slice)) {
      offenders.push(`${ROUTES_FILE}: ${name} validates file_id without an operating_company_id predicate — can persist another entity's document`);
    }
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkFileIdIsCompanyScoped(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    app.post("/api/v1/customer-contracts", async (req, reply) => {
      if (body.data.file_id) {
        const fileCheck = await client.query(
          \`SELECT id FROM docs.files WHERE id = $1 AND deleted_at IS NULL LIMIT 1\`,
          [body.data.file_id]
        );
      }
    });
    app.post("/api/v1/customer-contracts/:id/supersede", async (req, reply) => {
      const res = await client.query(
        \`INSERT INTO customer.contract (operating_company_id, customer_id, file_id) VALUES ($1,$2,$3)\`,
        [body.data.operating_company_id, prev.customer_id, body.data.file_id ?? null]
      );
    });
  `;
  const fixed = `
    app.post("/api/v1/customer-contracts", async (req, reply) => {
      if (body.data.file_id) {
        const fileCheck = await client.query(
          \`SELECT id FROM docs.files WHERE id = $1 AND operating_company_id = $2::uuid AND deleted_at IS NULL LIMIT 1\`,
          [body.data.file_id, body.data.operating_company_id]
        );
      }
    });
    app.post("/api/v1/customer-contracts/:id/supersede", async (req, reply) => {
      if (body.data.file_id) {
        const fileCheck = await client.query(
          \`SELECT id FROM docs.files WHERE id = $1 AND operating_company_id = $2::uuid AND deleted_at IS NULL LIMIT 1\`,
          [body.data.file_id, body.data.operating_company_id]
        );
      }
      const res = await client.query(
        \`INSERT INTO customer.contract (operating_company_id, customer_id, file_id) VALUES ($1,$2,$3)\`,
        [body.data.operating_company_id, prev.customer_id, body.data.file_id ?? null]
      );
    });
  `;

  const buggyFails = checkFileIdIsCompanyScoped(buggy).length > 0;
  const fixedPasses = checkFileIdIsCompanyScoped(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:customer-contract-file-company-scope selftest OK");
    process.exit(0);
  }
  console.error("verify:customer-contract-file-company-scope selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:customer-contract-file-company-scope FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:customer-contract-file-company-scope OK — create and supersede both validate file_id against the resolved operating company");
}
