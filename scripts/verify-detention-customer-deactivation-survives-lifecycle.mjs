#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["detention","connectivity"],"leaves":["dispatch.detention.customer_deactivation.lifecycle_survives"],"task":"DSP-MONEY-F7271-DETENTION-CUSTOMER-DEACTIVATION-SUPPRESSES-LIFECYCLE","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7271-DETENTION-CUSTOMER-DEACTIVATION-SUPPRESSES-LIFECYCLE (CC-1, 2026-08-29):
 * detention.service.ts had THREE separate INNER JOINs to mdata.customers, whose customers_select RLS
 * policy excludes any deactivated_at IS NOT NULL row for a non-bypass reader:
 *   1. syncDetentionEventsFromStopArrivals (create) -- could prevent CREATION of a detention event
 *      entirely for an otherwise active, confirmed-arrival load once its customer was deactivated.
 *   2. listDetentionBoard (read) -- made an EXISTING accruing/closed event vanish from the board
 *      entirely, not just lose its label.
 *   3. notifyCustomerDetentionThreshold (notify) -- turned a real existing event into a false
 *      "not_found" instead of the correct "no_customer_email".
 * None of the three needed a NEW persisted snapshot: rate/free-time/threshold economics were already
 * immutably captured on dispatch.detention_events itself at creation time; only customer_name/ar_email
 * came from the live join. Fixed by converting all three JOINs to the established RLS-scoped-primary-
 * join + LATERAL full-row-fallback pattern (mirrors factoring/submission-queue.service.ts, ACCT-F5787)
 * using the existing mdata.get_customer_same_company resolver (202613060000) -- no new migration, no
 * RLS policy change. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-detention-customer-deactivation-survives-lifecycle.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/detention.service.ts",
};
const LABEL = "verify-detention-customer-deactivation-survives-lifecycle";

const FALLBACK_JOIN = `LEFT JOIN LATERAL (
          SELECT * FROM mdata.get_customer_same_company(l.customer_id, l.operating_company_id)
          WHERE c.id IS NULL
        ) c2 ON true`;

export function audit(src) {
  const failures = [];
  const s = src.service;

  // No INNER JOIN to mdata.customers may remain anywhere in the file -- every customer join must be
  // a LEFT JOIN with a LATERAL fallback.
  if (/[^T]JOIN mdata\.customers c ON/.test(s.replace(/LEFT JOIN mdata\.customers c ON/g, ""))) {
    failures.push(
      `${FILES.service}: an INNER JOIN to mdata.customers remains -- it must be a LEFT JOIN, or an ` +
        `existing/board/notify detention event can vanish/fail-to-create the moment its customer is ` +
        `deactivated`,
    );
  }

  // Exactly 3 LEFT JOIN mdata.customers sites, each paired with the LATERAL fallback.
  const leftJoinCount = (s.match(/LEFT JOIN mdata\.customers c ON/g) ?? []).length;
  if (leftJoinCount < 3) {
    failures.push(`${FILES.service}: expected 3 LEFT JOIN mdata.customers sites (create/board/notify), found ${leftJoinCount}`);
  }
  const fallbackCount = (s.match(/SELECT \* FROM mdata\.get_customer_same_company\(l\.customer_id, l\.operating_company_id\)\s*\n\s*WHERE c\.id IS NULL/g) ?? []).length;
  if (fallbackCount < 3) {
    failures.push(`${FILES.service}: expected 3 LATERAL mdata.get_customer_same_company fallback joins, found ${fallbackCount}`);
  }

  // The create-path economics must fall back through c2 before the hardcoded default, not straight
  // from c to the hardcoded default.
  if (!/COALESCE\(c\.free_time_pickup_minutes, c2\.free_time_pickup_minutes, 120\)/.test(s)) {
    failures.push(`${FILES.service}: free_time_pickup_minutes must fall back through c2 before the 120-minute default`);
  }
  if (!/COALESCE\(c\.free_time_delivery_minutes, c2\.free_time_delivery_minutes, 120\)/.test(s)) {
    failures.push(`${FILES.service}: free_time_delivery_minutes must fall back through c2 before the 120-minute default`);
  }
  if (!/ROUND\(c\.detention_rate_per_hour \* 100\)::int, ROUND\(c2\.detention_rate_per_hour \* 100\)::int, 0/.test(s)) {
    failures.push(`${FILES.service}: detention_rate_per_hour must fall back through c2 before the $0 default`);
  }

  // The board and notify reads must COALESCE customer_name/ar_email through c2 -- both sites use the
  // identical customer_name expression, so this must be a COUNT check (expect 2), not a bare .test(),
  // or a mutation that strips just ONE site's fallback can hide behind the other site's intact copy.
  const nameCoalesceCount = (s.match(/COALESCE\(c\.customer_name, c2\.customer_name\) AS customer_name/g) ?? []).length;
  if (nameCoalesceCount < 2) {
    failures.push(`${FILES.service}: customer_name must be COALESCEd through c2 at both the board and notify sites, found ${nameCoalesceCount}`);
  }
  const emailCoalesceCount = (s.match(/COALESCE\(c\.ar_email, c2\.ar_email\) AS (customer_email|ar_email)/g) ?? []).length;
  if (emailCoalesceCount < 2) {
    failures.push(`${FILES.service}: ar_email must be COALESCEd through c2 at both the board (customer_email) and notify (ar_email) sites, found ${emailCoalesceCount}`);
  }

  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation 1: revert the notify-path JOIN back to INNER JOIN + drop its fallback and COALESCE
  // (the exact pre-fix shape for that one site).
  const revertedNotify = {
    service: good.service.replace(
      `        LEFT JOIN mdata.customers c ON c.id = l.customer_id
                                    AND c.operating_company_id = l.operating_company_id
        LEFT JOIN LATERAL (
          SELECT * FROM mdata.get_customer_same_company(l.customer_id, l.operating_company_id)
          WHERE c.id IS NULL
        ) c2 ON true
        WHERE de.id = $1 AND de.operating_company_id = $2::uuid`,
      `        JOIN mdata.customers c ON c.id = l.customer_id
                              AND c.operating_company_id = l.operating_company_id
        WHERE de.id = $1 AND de.operating_company_id = $2::uuid`,
    ),
  };
  if (revertedNotify.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-notify pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(revertedNotify).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reverted notify-path INNER JOIN regression escaped`);
    process.exit(1);
  }

  // Mutation 2: drop the c2 fallback from the create-path free-time COALESCE (the exact pre-fix shape).
  const droppedCreateFallback = {
    service: good.service.replace(
      `COALESCE(c.free_time_pickup_minutes, c2.free_time_pickup_minutes, 120)`,
      `COALESCE(c.free_time_pickup_minutes, 120)`,
    ),
  };
  if (droppedCreateFallback.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-create-fallback pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedCreateFallback).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped create-path free-time fallback regression escaped`);
    process.exit(1);
  }

  // Mutation 3: drop the c2 fallback from the board-path customer_name COALESCE (the exact pre-fix
  // shape). Anchored with the following customer_email line -- unique to the board site, since
  // notify's own COALESCE(c.customer_name, ...) is followed by "AS ar_email", not "AS customer_email"
  // -- so this can't accidentally leave the OTHER site's identical expression to hide behind.
  const droppedBoardFallback = {
    service: good.service.replace(
      `COALESCE(c.customer_name, c2.customer_name) AS customer_name,
          COALESCE(c.ar_email, c2.ar_email) AS customer_email,`,
      `c.customer_name,
          COALESCE(c.ar_email, c2.ar_email) AS customer_email,`,
    ),
  };
  if (droppedBoardFallback.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-board-fallback pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedBoardFallback).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped board-path customer_name fallback regression escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 3 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — detention create/board/notify all survive customer deactivation`);
