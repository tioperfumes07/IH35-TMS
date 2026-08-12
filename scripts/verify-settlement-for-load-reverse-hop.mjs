#!/usr/bin/env node
/**
 * LOAD-SETTLEMENT-TAB-SHOWS-OPEN-NOT-SETTLING — static ratchet.
 *
 * Before this route existed, nothing resolved "which settlement actually covers load X" — the load
 * drawer's Settlement tab called a DRIVER-scoped "open pre-settlement" lookup instead, so a load
 * already paid on a LOCKED settlement showed the driver's separate, unrelated, empty open cycle.
 * Live-reproduced: load L-20260810-0003 -> the correct answer is settlement S-2026-0002 (locked,
 * $297.60), reachable only via the line's driver bill (source_driver_bill_id set); the load drawer
 * showed S-20260811-0032 (open, $0.00, 0 loads) instead.
 *
 * `GET /api/v1/driver-finance/settlements/for-load/:loadId` closes the reverse hop, reusing the SAME
 * bill-first COALESCE(db.load_id, sl.load_id) shape already established for the settlement DETAIL
 * route (SETTLEMENT-DETAIL-LOAD-COALESCE-DRIFT) — not reinvented, so the two call sites cannot drift.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): the for-load route
 * in settlements.routes.ts joins driver_bills on sl.source_driver_bill_id AND filters on
 * COALESCE(db.load_id, sl.load_id) = the load param — not on sl.load_id alone, and not by resolving
 * "the driver's latest open settlement" instead of the load-covering one.
 *
 * Self-test: node scripts/verify-settlement-for-load-reverse-hop.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-settlement-for-load-reverse-hop";
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
 * Isolates the for-load route's query and checks it uses the bill-first COALESCE shape to filter by
 * the requested load, ignoring comment-only mentions.
 */
export function checkForLoadQuery(src) {
  const code = stripComments(src);

  const anchorRe = /app\.get\(\s*["']\/api\/v1\/driver-finance\/settlements\/for-load\/:loadId["']/;
  const anchorMatch = anchorRe.exec(code);
  if (!anchorMatch) return { ok: false, reason: "for-load route registration not found" };

  const rest = code.slice(anchorMatch.index);
  const nextRouteRe = /app\.(get|post|patch|put|delete)\(/g;
  nextRouteRe.lastIndex = 1;
  const nextMatch = nextRouteRe.exec(rest);
  const block = nextMatch ? rest.slice(0, nextMatch.index) : rest;

  const hasBillJoin = /LEFT JOIN\s+driver_finance\.driver_bills\s+db\s+ON\s+db\.id\s*=\s*sl\.source_driver_bill_id/i.test(
    block
  );
  const hasCoalesceFilter = /WHERE\s+COALESCE\(\s*db\.load_id\s*,\s*sl\.load_id\s*\)\s*=\s*\$1/i.test(block);
  const hasBareLoadFilter = /WHERE\s+sl\.load_id\s*=\s*\$1\b/i.test(block);

  if (!hasBillJoin) return { ok: false, reason: "for-load query does not LEFT JOIN driver_finance.driver_bills on sl.source_driver_bill_id" };
  if (!hasCoalesceFilter) return { ok: false, reason: "for-load query does not filter WHERE COALESCE(db.load_id, sl.load_id) = $1" };
  if (hasBareLoadFilter) return { ok: false, reason: "for-load query filters on sl.load_id alone somewhere (regressed or duplicated filter)" };

  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    app.get("/api/v1/driver-finance/settlements/for-load/:loadId", async (req, reply) => {
      const res = await client.query(\`
        SELECT DISTINCT s.id::text AS settlement_id
        FROM driver_finance.settlement_lines sl
        LEFT JOIN driver_finance.driver_bills db ON db.id = sl.source_driver_bill_id
        JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE COALESCE(db.load_id, sl.load_id) = $1::uuid
          AND s.operating_company_id = $2::uuid
      \`);
    });
    app.get("/api/v1/driver-finance/settlements/:id/pdf", async (req, reply) => {});
  `;
  const goodResult = checkForLoadQuery(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressed = `
    app.get("/api/v1/driver-finance/settlements/for-load/:loadId", async (req, reply) => {
      const res = await client.query(\`
        SELECT DISTINCT s.id::text AS settlement_id
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE sl.load_id = $1
      \`);
    });
  `;
  const regressedResult = checkForLoadQuery(regressed);
  if (regressedResult.ok) fail("selftest: regressed fixture (bare sl.load_id filter, no bill COALESCE) should FAIL but passed");

  const commentTrap = `
    app.get("/api/v1/driver-finance/settlements/for-load/:loadId", async (req, reply) => {
      const res = await client.query(\`
        -- TODO: should use COALESCE(db.load_id, sl.load_id) here
        SELECT DISTINCT s.id::text AS settlement_id
        FROM driver_finance.settlement_lines sl
        JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
        WHERE sl.load_id = $1
      \`);
    });
  `;
  const trapResult = checkForLoadQuery(commentTrap);
  if (trapResult.ok) fail("selftest: comment-trap fixture (COALESCE mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkForLoadQuery(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — the for-load reverse hop resolves bill-first (COALESCE(db.load_id, sl.load_id)), matching the detail route's rule`);
}
