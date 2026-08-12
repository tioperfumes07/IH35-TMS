#!/usr/bin/env node
/**
 * SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT — static ratchet.
 *
 * ACCT-F275 established the rule: a settlement line's covered load resolves bill-first —
 * `COALESCE(db.load_id, sl.load_id)` via `LEFT JOIN driver_finance.driver_bills db ON db.id =
 * sl.source_driver_bill_id` — because a line reachable only through its driver bill (bill has the
 * load, sl.load_id is NULL) is still a real, resolvable load. That rule was wired into the settlements
 * LIST query (settlements.routes.ts:157-173) but not the DETAIL query, which joined `mdata.loads` on
 * `sl.load_id` ALONE — so the same settlement reported `load_count: 1` on the list and
 * "LOADS IN CYCLE —" on the detail page for the exact same line. One rule, two call sites, drifted
 * apart. Live-reproduced on prod 2026-08-11: settlement 9910302b-…, line 90e3506f-…,
 * source_driver_bill_id set, sl.load_id NULL, bill resolves to load L-20260810-0003 — the list counted
 * it, the detail could not join to it.
 *
 * This guard is the invariant that stops a THIRD call site (or a regression of this one) from
 * silently reintroducing the drift: every settlement-lines-to-loads join in this route file must use
 * the bill-first COALESCE shape, not `sl.load_id` alone.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): the settlement
 * DETAIL route's line query in settlements.routes.ts joins `driver_finance.driver_bills` on
 * `sl.source_driver_bill_id` AND joins `mdata.loads` on `COALESCE(db.load_id, sl.load_id)` — not on
 * `sl.load_id` alone.
 *
 * Self-test: node scripts/verify-settlement-detail-load-coalesce.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-settlement-detail-load-coalesce";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/driver-finance/settlements.routes.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * Isolates the settlement DETAIL route's line-fetch query (the block that reads
 * `driver_finance.settlement_lines` and joins to loads for a single settlement id) and checks it uses
 * the bill-first COALESCE join shape, ignoring comment-only mentions of the pattern.
 * Exported so the selftest can exercise it against inline fixtures without touching the filesystem.
 */
export function checkDetailQuery(src) {
  const code = stripComments(src);

  // Anchor on the settlement detail route registration, then take the query text up to the next
  // route registration (or end of file) so this never accidentally matches the LIST query's already-
  // correct block earlier in the same file.
  const anchorRe = /app\.get\(\s*["']\/api\/v1\/driver-finance\/settlements\/:id["']/;
  const anchorMatch = anchorRe.exec(code);
  if (!anchorMatch) return { ok: false, reason: "settlement detail route registration not found" };

  const rest = code.slice(anchorMatch.index);
  const nextRouteRe = /app\.(get|post|patch|put|delete)\(/g;
  nextRouteRe.lastIndex = 1; // skip the anchor's own match
  const nextMatch = nextRouteRe.exec(rest);
  const block = nextMatch ? rest.slice(0, nextMatch.index) : rest;

  const hasBillJoin = /LEFT JOIN\s+driver_finance\.driver_bills\s+db\s+ON\s+db\.id\s*=\s*sl\.source_driver_bill_id/i.test(
    block
  );
  const hasCoalesceLoadJoin = /ON\s+l\.id\s*=\s*COALESCE\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)/i.test(block);
  const hasBareLoadJoin = /ON\s+l\.id\s*=\s*sl\.load_id\b(?!\s*,)/i.test(block);

  if (!hasBillJoin) return { ok: false, reason: "detail query does not LEFT JOIN driver_finance.driver_bills on sl.source_driver_bill_id" };
  if (!hasCoalesceLoadJoin) return { ok: false, reason: "detail query's mdata.loads join is not COALESCE(db.load_id, sl.load_id)" };
  if (hasBareLoadJoin) return { ok: false, reason: "detail query still joins mdata.loads on sl.load_id alone somewhere (regressed or duplicated join)" };

  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    app.get("/api/v1/driver-finance/settlements/:id", async (req, reply) => {
      const linesRes = await client.query(\`
        SELECT sl.*, l.load_number, COALESCE(db.load_id, sl.load_id) AS load_id
        FROM driver_finance.settlement_lines sl
        LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
        LEFT JOIN mdata.loads l
          ON l.id = COALESCE(db.load_id, sl.load_id)
         AND l.operating_company_id = $2::uuid
        WHERE sl.settlement_id = $1
      \`);
    });
    app.get("/api/v1/driver-finance/settlements/:id/pdf", async (req, reply) => {});
  `;
  const goodResult = checkDetailQuery(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    app.get("/api/v1/driver-finance/settlements/:id", async (req, reply) => {
      const linesRes = await client.query(\`
        SELECT sl.*, l.load_number
        FROM driver_finance.settlement_lines sl
        LEFT JOIN mdata.loads l
          ON l.id = sl.load_id
         AND l.operating_company_id = $2::uuid
        WHERE sl.settlement_id = $1
      \`);
    });
  `;
  const regressedResult = checkDetailQuery(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (bare sl.load_id join, no bill COALESCE) should FAIL but passed");

  // Comment-trap: the COALESCE pattern appears only in a comment above a still-bare join — the guard
  // must not be satisfied by a comment mentioning the fix, only by the actual join condition.
  const commentTrap = `
    app.get("/api/v1/driver-finance/settlements/:id", async (req, reply) => {
      const linesRes = await client.query(\`
        -- TODO: should use COALESCE(db.load_id, sl.load_id) here per ACCT-F275
        SELECT sl.*, l.load_number
        FROM driver_finance.settlement_lines sl
        LEFT JOIN mdata.loads l
          ON l.id = sl.load_id
         AND l.operating_company_id = $2::uuid
        WHERE sl.settlement_id = $1
      \`);
    });
  `;
  const trapResult = checkDetailQuery(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (COALESCE mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkDetailQuery(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — settlement detail route resolves each line's load bill-first (COALESCE(db.load_id, sl.load_id)), matching the list query's ACCT-F275 rule`);
}
