#!/usr/bin/env node
/**
 * ACCT-F5590 regression guard — a Driver-role caller opening a settlement dispute must be forced
 * to open it for their OWN driver profile, never an arbitrary caller-supplied driver_id.
 *
 * driver-finance/settlement-dispute.routes.ts's POST /settlement-disputes accepted driver_id as a
 * plain request field and never verified it matched the calling user's own driver profile when the
 * caller's role is "Driver" -- openDispute() itself only checks settlement/driver PAIR existence
 * (E_SETTLEMENT_NOT_FOUND_FOR_DRIVER), not caller identity. A Driver-role user who knew or guessed
 * another driver's uuid plus a valid settlement_id for that driver could open a fraudulent dispute
 * misattributed to the other driver.
 *
 * Fix: reuse the same resolveDriverIdForUser() self-resolution pattern the sibling withdraw route
 * already uses -- resolve the caller's own driver_id and 403 (E_FORBIDDEN_NOT_DRIVER) on mismatch,
 * only when the caller's role is "Driver" (Owner/Administrator/etc creating a dispute on a driver's
 * behalf are unaffected).
 *
 * This static check (no DB connection) asserts the create route resolves+compares before calling
 * openDispute.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify:settlement-dispute-driver-self-ownership";
const SELFTEST = process.argv.includes("--selftest");
const FILE = "apps/backend/src/driver-finance/settlement-dispute.routes.ts";

const ROUTE_NEEDLE = 'app.post("/api/v1/driver-finance/settlement-disputes",';
const OPEN_CALL_NEEDLE = "const data = await openDispute(user.uuid,";
const SELF_CHECK_NEEDLE = "if (ownDriverId !== body.data.driver_id)";

function assertAll(src) {
  const problems = [];

  const idx = src.indexOf(ROUTE_NEEDLE);
  if (idx === -1) {
    problems.push(`POST /settlement-disputes route not found (guard target moved; update this guard)`);
    return problems;
  }
  const openIdx = src.indexOf(OPEN_CALL_NEEDLE, idx);
  if (openIdx === -1) {
    problems.push(`openDispute() call not found after the create route (guard target moved; update this guard)`);
    return problems;
  }
  const window = src.slice(idx, openIdx);
  if (!window.includes('user.role === "Driver"')) {
    problems.push(`create route no longer branches on user.role === "Driver" before openDispute`);
  }
  if (!window.includes("resolveDriverIdForUser(user.uuid)")) {
    problems.push(`create route no longer resolves the caller's own driver_id via resolveDriverIdForUser before openDispute`);
  }
  if (!window.includes(SELF_CHECK_NEEDLE)) {
    problems.push(`create route no longer rejects a driver_id mismatch (ownDriverId !== body.data.driver_id) before openDispute`);
  }

  return problems;
}

const read = () => fs.readFileSync(path.join(ROOT, FILE), "utf8");

if (SELFTEST) {
  const src = read();

  const idx = src.indexOf(ROUTE_NEEDLE);
  if (idx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: route needle not found in real code`);
    process.exit(1);
  }
  const checkIdx = src.indexOf(SELF_CHECK_NEEDLE, idx);
  if (checkIdx === -1) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: self-ownership check not found near the route (guard text drifted from real code)`);
    process.exit(1);
  }
  // Remove the whole "if (ownDriverId !== body.data.driver_id) { ... }" block by deleting from the
  // check line through its matching closing brace (next line starting with "      }"). File may use
  // CRLF (\r\n) line endings, so tolerate an optional \r before each \n.
  const blockStart = src.lastIndexOf("\n", checkIdx) + 1;
  const closeMarker = /\r?\n {6}\}\r?\n/;
  closeMarker.lastIndex = 0;
  const tail = src.slice(checkIdx);
  const closeMatch = tail.match(closeMarker);
  if (!closeMatch) {
    console.error(`${LABEL} SELFTEST SETUP FAILED: could not locate the end of the self-ownership check block`);
    process.exit(1);
  }
  const blockEnd = checkIdx + closeMatch.index + closeMatch[0].length;
  const planted = src.slice(0, blockStart) + src.slice(blockEnd);

  if (!assertAll(planted).length) {
    console.error(`${LABEL} SELFTEST FAILED: planted defect (self-ownership check dropped) not caught`);
    process.exit(1);
  }

  const live = assertAll(src);
  if (live.length) {
    console.error(`${LABEL} SELFTEST FAILED live: ${live.join(" | ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const problems = assertAll(read());
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK`);
