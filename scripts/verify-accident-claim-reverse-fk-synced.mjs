#!/usr/bin/env node
/**
 * Guard for P41 (WIRING-PLAN-50-TASKS-LOCKED.md) — safety.accident_reports.insurance_claim_id
 * reverse-FK sync.
 *
 * ROOT: migration 202607250000 added safety.accident_reports.insurance_claim_id (uuid FK to
 * insurance.claim), the forward direction accident->claim. insurance.claim.accident_report_id
 * (the reverse direction, claim->accident) was already written on both POST and PATCH
 * /api/v1/insurance/claims, but nothing ever wrote the accident_reports side back — an accident
 * report that spawned a claim was reachable claim->accident and NOT accident->claim, so any
 * accident-side "Insurance Claim" reverse link/picker/smoke-row FK check would find it NULL even
 * after a real claim existed.
 *
 * Asserts:
 *  1. POST /api/v1/insurance/claims, after the claim INSERT succeeds, UPDATEs
 *     safety.accident_reports SET insurance_claim_id when accident_report_id was supplied.
 *  2. PATCH /api/v1/insurance/claims/:id does the same when accident_report_id is present in the
 *     patch body, AND clears the PRIOR accident's insurance_claim_id on re-link/unlink so a moved
 *     link cannot leave a stale accident->claim pointer.
 *  3. Both writes are scoped by operating_company_id (never a bare `WHERE id = $1`) — an unscoped
 *     UPDATE on this table would let a caller in one entity move another entity's accident's FK.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-accident-claim-reverse-fk-synced";
const ROUTES = "apps/backend/src/insurance/claim.routes.ts";

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1);
}

function extractRouteBlock(src, marker) {
  const idx = src.indexOf(marker);
  if (idx === -1) return null;
  // Balance braces from the route handler's opening `async (req, reply) => {` onward.
  const openIdx = src.indexOf("{", src.indexOf("=>", idx));
  if (openIdx === -1) return null;
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(idx, i + 1);
    }
  }
  return null;
}

const ACCIDENT_UPDATE_SCOPED =
  /UPDATE\s+safety\.accident_reports[\s\S]{0,200}?SET\s+insurance_claim_id[\s\S]{0,200}?WHERE\s+id\s*=\s*\$\d+::uuid\s+AND\s+operating_company_id\s*=\s*\$\d+::uuid/;

export function assertGuard({ routes }) {
  const errs = [];
  const r = stripComments(routes);

  if (!/SELECT\s+id::text,\s*insurance_claim_id::text[\s\S]{0,220}?FROM\s+safety\.accident_reports[\s\S]{0,220}?FOR\s+UPDATE/.test(r)) {
    errs.push(`${ROUTES}: claim mutation must lock the accident and read its canonical insurance_claim_id before linking`);
  }
  if (!r.includes('kind: "accident_report_already_linked"') || !r.includes('error: "accident_report_already_linked"')) {
    errs.push(`${ROUTES}: occupied accident back-pointers must return an explicit conflict before claim mutation`);
  }

  const postBlock = extractRouteBlock(r, 'app.post("/api/v1/insurance/claims"');
  if (!postBlock) {
    errs.push(`${ROUTES}: missing POST /api/v1/insurance/claims handler`);
  } else if (!ACCIDENT_UPDATE_SCOPED.test(postBlock)) {
    errs.push(
      `${ROUTES}: POST claims must UPDATE safety.accident_reports SET insurance_claim_id, scoped by ` +
        `id + operating_company_id, after a claim is created with accident_report_id set`
    );
  }

  const patchBlock = extractRouteBlock(r, 'app.patch("/api/v1/insurance/claims/:id"');
  if (!patchBlock) {
    errs.push(`${ROUTES}: missing PATCH /api/v1/insurance/claims/:id handler`);
  } else {
    if (!ACCIDENT_UPDATE_SCOPED.test(patchBlock)) {
      errs.push(
        `${ROUTES}: PATCH claims must UPDATE safety.accident_reports SET insurance_claim_id, scoped by ` +
          `id + operating_company_id, when accident_report_id is present in the patch body`
      );
    }
    if (!/SET\s+insurance_claim_id\s*=\s*NULL/.test(patchBlock)) {
      errs.push(
        `${ROUTES}: PATCH claims must clear the PRIOR accident's insurance_claim_id on re-link/unlink ` +
          `(SET insurance_claim_id = NULL) — otherwise a moved claim link leaves a stale accident->claim pointer`
      );
    }
  }

  return errs;
}

function selftest() {
  const good = `
    async function lockAccident() {
      const row = await client.query(\`
        SELECT id::text, insurance_claim_id::text
        FROM safety.accident_reports
        WHERE id = $1::uuid AND operating_company_id = $2::uuid
        FOR UPDATE
      \`);
      return { kind: "accident_report_already_linked" };
    }
    const conflict = { error: "accident_report_already_linked" };
    app.post("/api/v1/insurance/claims", async (req, reply) => {
      const createdId = insert.rows[0]?.id;
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, body.operating_company_id, createdId]);
      }
      return { kind: "ok" };
    });
    app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
      if (priorAccidentReportId && priorAccidentReportId !== body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = NULL
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND insurance_claim_id = $3::uuid
        \`, [priorAccidentReportId, query.data.operating_company_id, params.data.id]);
      }
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, query.data.operating_company_id, params.data.id]);
      }
      return { kind: "ok" };
    });
  `;
  const missingPost = `
    app.post("/api/v1/insurance/claims", async (req, reply) => {
      const createdId = insert.rows[0]?.id;
      return { kind: "ok" };
    });
    app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
      if (priorAccidentReportId && priorAccidentReportId !== body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = NULL
          WHERE id = $1::uuid AND operating_company_id = $2::uuid AND insurance_claim_id = $3::uuid
        \`, [priorAccidentReportId, query.data.operating_company_id, params.data.id]);
      }
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, query.data.operating_company_id, params.data.id]);
      }
      return { kind: "ok" };
    });
  `;
  const unscopedPost = `
    app.post("/api/v1/insurance/claims", async (req, reply) => {
      const createdId = insert.rows[0]?.id;
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $2::uuid
          WHERE id = $1::uuid
        \`, [body.accident_report_id, createdId]);
      }
      return { kind: "ok" };
    });
    app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, query.data.operating_company_id, params.data.id]);
      }
      return { kind: "ok" };
    });
  `;
  const noClearOnPatch = `
    app.post("/api/v1/insurance/claims", async (req, reply) => {
      const createdId = insert.rows[0]?.id;
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, body.operating_company_id, createdId]);
      }
      return { kind: "ok" };
    });
    app.patch("/api/v1/insurance/claims/:id", async (req, reply) => {
      if (body.accident_report_id) {
        await client.query(\`
          UPDATE safety.accident_reports
          SET insurance_claim_id = $3::uuid
          WHERE id = $1::uuid AND operating_company_id = $2::uuid
        \`, [body.accident_report_id, query.data.operating_company_id, params.data.id]);
      }
      return { kind: "ok" };
    });
  `;

  const cases = [
    { n: "good → 0", in: { routes: good }, want: 0 },
    { n: "POST missing back-pointer write → flag", in: { routes: missingPost }, min: 1 },
    { n: "unscoped UPDATE (no operating_company_id) → flag", in: { routes: unscopedPost }, min: 1 },
    { n: "PATCH missing prior-accident clear → flag", in: { routes: noClearOnPatch }, min: 1 },
  ];
  let f = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) f++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (f) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${f}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const routesPath = path.join(ROOT, ROUTES);
if (!fs.existsSync(routesPath)) {
  console.error(`[${LABEL}] FAILED — missing ${ROUTES}`);
  process.exit(1);
}

const errs = assertGuard({ routes: fs.readFileSync(routesPath, "utf8") });
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(
  `[${LABEL}] OK — insurance.claim POST/PATCH sync safety.accident_reports.insurance_claim_id both ways, entity-scoped.`
);
