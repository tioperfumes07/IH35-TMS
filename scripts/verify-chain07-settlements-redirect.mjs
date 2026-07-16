#!/usr/bin/env node
/**
 * verify-chain07-settlements-redirect.mjs
 * CI guard (CHAIN-07): the accounting "Settlements" surface must stay REDIRECTED to the single
 * canonical driver-finance settlements subledger, and the legacy accounting settlements route must
 * stay RETIRED (it must NOT query/write the RETIRE `settlement.*` / `payroll.*` duplicate ledger).
 *
 * Bug it prevents: the accounting "Settlements" surface 500'd because the legacy
 * `GET /api/v1/settlements` handler (apps/backend/src/settlements/pre-settlements.routes.ts) queried
 * `settlement.settlement` — a RETIRE duplicate ledger that no longer exists on prod. Single-subledger
 * rule (QBO/NetSuite/McLeod/Alvys): NEVER resurrect a 2nd settlement ledger. The fix redirects the
 * accounting settlements surface to `/driver-finance/settlements` and retires the dead legacy route.
 *
 * FAILS IF ANY OF:
 *   1. The frontend accounting "Settlements" tab (subnav-manifest.ts) no longer points to
 *      "/driver-finance/settlements".
 *   2. The route manifest no longer redirects "/accounting/settlements" to "/driver-finance/settlements".
 *   3. The retired legacy `GET /api/v1/settlements` handler is not a 308 redirect to the canonical
 *      driver-finance endpoint (i.e. the settlement.*-querying body was re-enabled on that path).
 *
 * Self-test: node scripts/verify-chain07-settlements-redirect.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-chain07-settlements-redirect";
const CANONICAL_FE = "/driver-finance/settlements";
const CANONICAL_BE = "/api/v1/driver-finance/settlements";

/**
 * Pure checker over the three source files.
 * @param {{ subnav: string, manifest: string, legacyRoute: string }} files
 * @returns {string[]} list of failure messages (empty = pass)
 */
export function computeChain07Failures(files) {
  const subnav = files.subnav ?? "";
  const manifest = files.manifest ?? "";
  const legacyRoute = files.legacyRoute ?? "";
  const errors = [];

  // 1. The accounting "Settlements" tab must point to the canonical driver-finance subledger.
  const tabRe = /\{\s*label:\s*"Settlements"[^}]*to:\s*"\/driver-finance\/settlements"/;
  if (!tabRe.test(subnav)) {
    errors.push('subnav-manifest.ts: the "Settlements" tab must point to "/driver-finance/settlements"');
  }

  // 2. The route manifest must redirect /accounting/settlements -> canonical driver-finance page.
  // Accept either bare Navigate (legacy) or PreserveSearchNavigate (keeps ?driver_id / ?settlement_id).
  const redirectRe =
    /path="\/accounting\/settlements"[\s\S]*?<(?:Navigate|PreserveSearchNavigate)\s+to="\/driver-finance\/settlements"/;
  if (!redirectRe.test(manifest)) {
    errors.push(
      'manifest.tsx: "/accounting/settlements" must Navigate/PreserveSearchNavigate to="/driver-finance/settlements"'
    );
  }

  // 3. The retired legacy GET /api/v1/settlements handler must be a 308 redirect to the canonical
  //    driver-finance endpoint, and must NOT run a live settlement.*/payroll.* query on that path.
  const handlerMatch = legacyRoute.match(
    /app\.get\(\s*["']\/api\/v1\/settlements["']\s*,\s*async\s*\(req,\s*reply\)\s*=>\s*\{([\s\S]*?)\n {2}\}\);/
  );
  if (!handlerMatch) {
    errors.push('pre-settlements.routes.ts: could not locate the GET /api/v1/settlements handler');
  } else {
    const body = handlerMatch[1];
    if (!/reply\.code\(\s*308\s*\)/.test(body)) {
      errors.push('pre-settlements.routes.ts: retired GET /api/v1/settlements must return reply.code(308)');
    }
    if (!body.includes(CANONICAL_BE)) {
      errors.push(`pre-settlements.routes.ts: retired GET /api/v1/settlements must redirect to ${CANONICAL_BE}`);
    }
    // No NEW code on the redirect path may read/write the RETIRE ledgers. Strip line comments so the
    // archival note (which mentions settlement.settlement for history) does not trip the guard.
    const activeBody = body
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
      .join("\n");
    if (/\b(FROM|INTO|UPDATE|JOIN)\s+settlement\./i.test(activeBody) || /\b(FROM|INTO|UPDATE|JOIN)\s+payroll\./i.test(activeBody)) {
      errors.push('pre-settlements.routes.ts: retired GET /api/v1/settlements must NOT query settlement.*/payroll.* on the redirect path');
    }
  }

  // 4. (P2.4b) The retired legacy GET /api/v1/settlements/:id DETAIL handler must likewise be a 308
  //    redirect to the canonical driver-finance detail, and must NOT query settlement.*/payroll.*.
  const detailMatch = legacyRoute.match(
    /app\.get\(\s*["']\/api\/v1\/settlements\/:id["']\s*,\s*async\s*\(req,\s*reply\)\s*=>\s*\{([\s\S]*?)\n {2}\}\);/
  );
  if (!detailMatch) {
    errors.push('pre-settlements.routes.ts: could not locate the GET /api/v1/settlements/:id handler');
  } else {
    const body = detailMatch[1];
    if (!/reply\.code\(\s*308\s*\)/.test(body)) {
      errors.push('pre-settlements.routes.ts: retired GET /api/v1/settlements/:id must return reply.code(308)');
    }
    if (!body.includes(CANONICAL_BE)) {
      errors.push(`pre-settlements.routes.ts: retired GET /api/v1/settlements/:id must redirect to ${CANONICAL_BE}`);
    }
    const activeBody = body
      .split("\n")
      .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//") && !l.trim().startsWith("/*"))
      .join("\n");
    if (/\b(FROM|INTO|UPDATE|JOIN)\s+settlement\./i.test(activeBody) || /\b(FROM|INTO|UPDATE|JOIN)\s+payroll\./i.test(activeBody)) {
      errors.push('pre-settlements.routes.ts: retired GET /api/v1/settlements/:id must NOT query settlement.*/payroll.* on the redirect path');
    }
  }

  return errors;
}

function selftest() {
  const goodSubnav = '{ label: "Settlements",      to: "/driver-finance/settlements" },';
  const goodManifest =
    '<Route path="/accounting/settlements" element={<ProtectedRoute><PreserveSearchNavigate to="/driver-finance/settlements" /></ProtectedRoute>} />';
  const goodDetail = [
    'app.get("/api/v1/settlements/:id", async (req, reply) => {',
    '    const canonical = `/api/v1/driver-finance/settlements/${params.data.id}${qs}`;',
    '    reply.header("location", canonical);',
    '    return reply.code(308).send({ error: "gone", canonical_endpoint: canonical });',
    '  });',
  ].join("\n");
  const goodLegacy = [
    'app.get("/api/v1/settlements", async (req, reply) => {',
    '    const canonical = `/api/v1/driver-finance/settlements${qs}`;',
    '    reply.header("location", canonical);',
    '    return reply.code(308).send({ error: "gone", canonical_endpoint: canonical });',
    '  });',
    goodDetail,
  ].join("\n");

  if (computeChain07Failures({ subnav: goodSubnav, manifest: goodManifest, legacyRoute: goodLegacy }).length) {
    console.error(`${LABEL} --selftest FAILED: fully-fixed case should pass`); process.exit(1);
  }
  // Detail handler resurrected to query settlement.* must fail.
  const detailResurrected = [
    'app.get("/api/v1/settlements", async (req, reply) => {',
    '    const canonical = `/api/v1/driver-finance/settlements${qs}`;',
    '    reply.header("location", canonical);',
    '    return reply.code(308).send({ error: "gone", canonical_endpoint: canonical });',
    '  });',
    'app.get("/api/v1/settlements/:id", async (req, reply) => {',
    '    const sql = `SELECT * FROM settlement.settlement s WHERE s.id = $1`;',
    '    return reply.send(await client.query(sql));',
    '  });',
  ].join("\n");
  if (!computeChain07Failures({ subnav: goodSubnav, manifest: goodManifest, legacyRoute: detailResurrected }).length) {
    console.error(`${LABEL} --selftest FAILED: resurrected /:id settlement.* query should fail`); process.exit(1);
  }
  // Missing FE tab redirect.
  if (!computeChain07Failures({ subnav: '{ label: "Settlements", to: "/accounting/settlements" },', manifest: goodManifest, legacyRoute: goodLegacy }).length) {
    console.error(`${LABEL} --selftest FAILED: wrong subnav target should fail`); process.exit(1);
  }
  // Missing accounting/settlements redirect route.
  if (!computeChain07Failures({ subnav: goodSubnav, manifest: "// no redirect", legacyRoute: goodLegacy }).length) {
    console.error(`${LABEL} --selftest FAILED: missing manifest redirect should fail`); process.exit(1);
  }
  // Legacy route resurrected to query settlement.*
  const resurrected = [
    'app.get("/api/v1/settlements", async (req, reply) => {',
    '    const sql = `SELECT * FROM settlement.settlement s`;',
    '    return reply.send(await client.query(sql));',
    '  });',
  ].join("\n");
  if (!computeChain07Failures({ subnav: goodSubnav, manifest: goodManifest, legacyRoute: resurrected }).length) {
    console.error(`${LABEL} --selftest FAILED: resurrected settlement.* query should fail`); process.exit(1);
  }
  // 308 present but comment mentioning settlement.settlement must NOT trip the guard.
  const withArchivalComment = [
    'app.get("/api/v1/settlements", async (req, reply) => {',
    '    // Archived: FROM settlement.settlement s JOIN mdata.drivers d ... (RETIRE ledger)',
    '    const canonical = `/api/v1/driver-finance/settlements${qs}`;',
    '    reply.header("location", canonical);',
    '    return reply.code(308).send({ error: "gone", canonical_endpoint: canonical });',
    '  });',
    goodDetail,
  ].join("\n");
  if (computeChain07Failures({ subnav: goodSubnav, manifest: goodManifest, legacyRoute: withArchivalComment }).length) {
    console.error(`${LABEL} --selftest FAILED: archival comment should be ignored`); process.exit(1);
  }
  console.log(`${LABEL} --selftest — OK`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const subnav = fs.readFileSync(path.join(ROOT, "apps/frontend/src/pages/accounting/subnav-manifest.ts"), "utf8");
  const manifest = fs.readFileSync(path.join(ROOT, "apps/frontend/src/routes/manifest.tsx"), "utf8");
  const legacyRoute = fs.readFileSync(path.join(ROOT, "apps/backend/src/settlements/pre-settlements.routes.ts"), "utf8");
  const errors = computeChain07Failures({ subnav, manifest, legacyRoute });
  if (errors.length) {
    console.error(`${LABEL} — FAILED`);
    for (const e of errors) console.error(`- ${e}`);
    process.exit(1);
  }
  console.log(`${LABEL} — OK (accounting settlements redirected to ${CANONICAL_FE}; legacy route retired, no settlement.*/payroll.* on the redirect path)`);
}
