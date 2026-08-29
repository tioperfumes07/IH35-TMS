#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["detention","connectivity"],"leaves":["dispatch.detention.billing_bridge.scoped_checks"],"task":"DSP-MONEY-F7214-DETENTION-BILLING-BRIDGE-UNCHECKED-WRITES","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7214-DETENTION-BILLING-BRIDGE-UNCHECKED-WRITES (CC-1, 2026-08-29):
 * bridgeDetentionToBillingInClientTx raised mdata.loads.rate_total_cents with a bare
 * `WHERE id = $1` -- no operating_company_id predicate -- and converted a missing/lost returned
 * row to rate 0 before continuing into resyncProformaInvoiceFromLoadRate (which would then
 * silently resync the proforma invoice to $0). Its subsequent dispatch.detention_events
 * billed-state UPDATE was also unchecked: a lost write there would still fall through to
 * appendCrudAudit + `{ok:true, event:undefined}`, asserting the bridge succeeded when the
 * canonical event row was never actually stamped 'billed'. Root-caused live in
 * apps/backend/src/dispatch/detention.service.ts. Fixed by company-scoping the load-rate UPDATE
 * and requiring a returned row before resync, and by requiring a returned row from the
 * detention_events UPDATE before audit/success. This guard holds both fixes so they cannot regress.
 *
 * Self-test: node scripts/verify-detention-bridge-scoped-checks.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/detention.service.ts",
};
const LABEL = "verify-detention-bridge-scoped-checks";

export function audit(src) {
  const failures = [];
  const fnMatch = src.service.match(
    /export async function bridgeDetentionToBillingInClientTx\([\s\S]*?\n\}/,
  );
  if (!fnMatch) {
    failures.push(`${FILES.service}: bridgeDetentionToBillingInClientTx not found`);
    return failures;
  }
  const body = fnMatch[0];

  // 1. The mdata.loads rate UPDATE must be company-scoped.
  const loadUpdateMatch = body.match(/UPDATE mdata\.loads[\s\S]*?RETURNING rate_total_cents/);
  if (!loadUpdateMatch) {
    failures.push(`${FILES.service}: the mdata.loads rate_total_cents UPDATE was not found`);
  } else {
    const loadUpdateSql = loadUpdateMatch[0];
    if (!/WHERE id = \$1 AND operating_company_id = \$4::uuid/.test(loadUpdateSql)) {
      failures.push(
        `${FILES.service}: the load-rate UPDATE must bind operating_company_id, not just id -- ` +
          `an unscoped WHERE id = $1 can raise a cross-company load's rate on a lost/mismatched row`,
      );
    }
  }

  // 2. A returned row must be required before the resync call uses its value.
  if (!/const loadRateRow = loadUpdate\.rows\[0\];/.test(body)) {
    failures.push(`${FILES.service}: the load-rate UPDATE result must be captured before use`);
  }
  if (!/if \(!loadRateRow\) \{\s*return \{ ok: false as const, error: "load_rate_update_failed" as const \};/.test(body)) {
    failures.push(
      `${FILES.service}: a missing/lost load-rate UPDATE row must fail the bridge, not fall through to ?? 0`,
    );
  }
  if (/newRateTotalCents: Number\(loadUpdate\.rows\[0\]\?\.rate_total_cents \?\? 0\)/.test(body)) {
    failures.push(
      `${FILES.service}: resyncProformaInvoiceFromLoadRate must use the checked loadRateRow, not an ` +
        `unchecked ?? 0 fallback on the raw query result`,
    );
  }

  // 3. The detention_events billed-state UPDATE result must be checked before audit/success.
  const eventsUpdateMatch = body.match(
    /const updated = await client\.query\(\s*`[\s\S]*?UPDATE dispatch\.detention_events[\s\S]*?RETURNING \*\s*`[\s\S]*?\);/,
  );
  if (!eventsUpdateMatch) {
    failures.push(`${FILES.service}: the dispatch.detention_events billed-state UPDATE was not found`);
  } else {
    const afterUpdate = body.slice(body.indexOf(eventsUpdateMatch[0]) + eventsUpdateMatch[0].length);
    const auditIdx = afterUpdate.indexOf("await appendCrudAudit(");
    const checkIdx = afterUpdate.search(/if \(!updated\.rows\[0\]\) \{\s*return \{ ok: false as const, error: "event_billed_stamp_failed" as const \};/);
    if (checkIdx === -1) {
      failures.push(
        `${FILES.service}: the detention_events UPDATE result must be checked (updated.rows[0]) before ` +
          `audit/success -- a lost write must not report {ok:true, event:undefined}`,
      );
    } else if (auditIdx !== -1 && checkIdx > auditIdx) {
      failures.push(`${FILES.service}: the zero-row check must run BEFORE appendCrudAudit, not after`);
    }
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

  // Mutation 1: drop the operating_company_id predicate on the load-rate UPDATE (the exact pre-fix shape).
  const unscopedLoadUpdate = {
    service: good.service.replace(
      "WHERE id = $1 AND operating_company_id = $4::uuid\n        RETURNING rate_total_cents\n      `,\n      [row.load_id, amount, JSON.stringify(accessorial_bridge_rows), operatingCompanyId]",
      "WHERE id = $1\n        RETURNING rate_total_cents\n      `,\n      [row.load_id, amount, JSON.stringify(accessorial_bridge_rows)]",
    ),
  };
  if (unscopedLoadUpdate.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — unscoped-load-update pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(unscopedLoadUpdate).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — unscoped load-rate UPDATE regression escaped`);
    process.exit(1);
  }

  // Mutation 2: remove the zero-row check on the load-rate UPDATE and revert the resync call to
  // the old unchecked `?? 0` fallback (the exact pre-fix shape).
  const droppedLoadCheck = {
    service: good.service
      .replace(
        `    const loadRateRow = loadUpdate.rows[0];
    if (!loadRateRow) {
      return { ok: false as const, error: "load_rate_update_failed" as const };
    }

`,
        "",
      )
      .replace(
        "newRateTotalCents: Number(loadRateRow.rate_total_cents ?? 0),",
        "newRateTotalCents: Number(loadUpdate.rows[0]?.rate_total_cents ?? 0),",
      ),
  };
  if (droppedLoadCheck.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-load-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedLoadCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped load-rate zero-row check regression escaped`);
    process.exit(1);
  }

  // Mutation 3: remove the zero-row check on the detention_events UPDATE (the exact pre-fix shape).
  const droppedEventCheck = {
    service: good.service.replace(
      `    // DSP-MONEY-F7214 — the event status UPDATE above was previously unchecked: a lost write
    // (e.g. the event flipped to 'billed' by a concurrent caller between the initial SELECT and
    // this UPDATE) would fall through to appendCrudAudit + \`{ok:true, event:undefined}\` anyway,
    // asserting the bridge succeeded when the canonical event row was never actually stamped.
    if (!updated.rows[0]) {
      return { ok: false as const, error: "event_billed_stamp_failed" as const };
    }

`,
      "",
    ),
  };
  if (droppedEventCheck.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-event-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedEventCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped detention_events zero-row check regression escaped`);
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
console.log(`${LABEL} PASS — detention billing bridge is company-scoped and checks both writes before audit/success`);
