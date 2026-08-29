#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["cancellation","connectivity"],"leaves":["dispatch.cancellation.tonu_backlink.scoped_check"],"task":"DSP-MONEY-F7146B-R1-TONU-BACKLINK-STILL-UUID-ONLY-UNCHECKED","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7146B-R1-TONU-BACKLINK-STILL-UUID-ONLY-UNCHECKED (CC-1, 2026-08-29): cancelLoad's TONU
 * backlink write updated `dispatch.load_cancellations.charge_invoice_id/charge_invoice_line_id` with
 * a bare `WHERE id = $1` — no `operating_company_id` predicate, no status predicate, no `RETURNING`,
 * and the result was never checked. The transaction could therefore commit a real TONU invoice while
 * silently losing the canonical cancellation->invoice backlink (a lost/RLS-filtered/status-drifted
 * update). Root-caused live: apps/backend/src/dispatch/cancellation.service.ts's backlink UPDATE
 * inside cancelLoad. Fixed by binding operating_company_id + status='approved' (this branch only
 * runs when the cancellation row was just written as 'approved') and requiring a returned id before
 * continuing. This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-cancellation-tonu-backlink-scoped-check.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/cancellation.service.ts",
};
const LABEL = "verify-cancellation-tonu-backlink-scoped-check";

export function audit(src) {
  const failures = [];
  const block = src.service.match(
    /const backlinkRes = await client\.query<\{ id: string \}>\([\s\S]*?\n\s*\);\s*\n\s*if \(!backlinkRes\.rows\[0\]\) \{[\s\S]*?\n\s*\}/,
  );
  if (!block) {
    failures.push(`${FILES.service}: TONU backlink UPDATE + zero-row check not found`);
    return failures;
  }
  const body = block[0];
  if (!/AND operating_company_id = \$5::uuid/.test(body)) {
    failures.push(`${FILES.service}: the backlink UPDATE must bind operating_company_id — a bare WHERE id = $1 accepts any company's row`);
  }
  if (!/AND status = 'approved'/.test(body)) {
    failures.push(`${FILES.service}: the backlink UPDATE must confirm status = 'approved' — the row this branch expects to still be in that state`);
  }
  if (!/RETURNING id/.test(body)) {
    failures.push(`${FILES.service}: the backlink UPDATE must carry a RETURNING clause so the caller can detect a zero-row update`);
  }
  if (!/throw Object\.assign\(new Error\("cancellation_charge_backlink_failed"\)/.test(body)) {
    failures.push(`${FILES.service}: a lost backlink write must throw a named error, not swallow it`);
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
  const noScope = {
    service: good.service.replace(
      "               WHERE id = $1\n                 AND operating_company_id = $5::uuid\n                 AND status = 'approved'\n               RETURNING id",
      "               WHERE id = $1\n               RETURNING id",
    ),
  };
  if (noScope.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — scope-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(noScope).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — company/status scope removal escaped`);
    process.exit(1);
  }
  const noCheck = {
    service: good.service.replace(
      `          if (!backlinkRes.rows[0]) {
            throw Object.assign(new Error("cancellation_charge_backlink_failed"), {
              code: "cancellation_charge_backlink_failed",
            });
          }
`,
      "",
    ),
  };
  if (noCheck.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — check-removal pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(noCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — zero-row check removal escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — TONU cancellation backlink write is company/status-scoped and fails closed on a zero-row update`);
