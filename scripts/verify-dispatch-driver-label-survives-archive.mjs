#!/usr/bin/env node
/**
 * DISPATCH-DRIVER-LABEL-LOST-FOR-DEACTIVATED-DRIVERS
 *
 * The board's own diagnosis (mdata.drivers RLS SELECT policy hides deactivated rows) was verified
 * FALSE live on Neon prod: drivers_select carries no deactivated_at predicate at all. The real
 * defect was in GET /api/v1/mdata/loads (list) and GET /api/v1/mdata/loads/:id (detail): each
 * LEFT JOIN mdata.drivers d/pd/sd ON ... added its own extra "AND d.archived_at IS NULL", which
 * for a LEFT JOIN drops the driver row out of the match entirely (not just its visibility) the
 * moment that driver is later archived — turning a load's real, historical driver assignment into
 * a permanent NULL name. This guard locks the fix in apps/backend/src/mdata/loads.routes.ts: none
 * of the four label-resolving driver joins (list count, list rows, detail primary, detail
 * secondary) may filter on archived_at. The SEPARATE driver-self-access EXISTS check (deciding
 * whether a live driver session may read the load at all) is intentionally NOT covered here — that
 * one legitimately requires an active driver and must keep its own archived_at filter.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/mdata/loads.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  const joinPatterns = [
    { label: "list count query (alias d)", re: /LEFT JOIN mdata\.drivers d ON d\.id = l\.assigned_primary_driver_id\s*\n\s*AND \(d\.operating_company_id/ },
    { label: "list rows query (alias d)", re: /LEFT JOIN mdata\.drivers d ON d\.id = l\.assigned_primary_driver_id\s*\n\s*AND \(d\.operating_company_id/g },
    { label: "detail query (alias pd, primary)", re: /LEFT JOIN mdata\.drivers pd ON pd\.id = l\.assigned_primary_driver_id\s*\n\s*AND \(pd\.operating_company_id/ },
    { label: "detail query (alias sd, secondary)", re: /LEFT JOIN mdata\.drivers sd ON sd\.id = l\.assigned_secondary_driver_id\s*\n\s*AND \(sd\.operating_company_id/ },
  ];

  // Count how many of the 4 label-resolving driver joins appear WITHOUT an archived_at filter
  // immediately after the ON id-match (i.e. the join key is followed directly by the
  // operating_company_id/authorization predicate, not by "AND d.archived_at IS NULL" first).
  const dJoinCount = (src.match(/LEFT JOIN mdata\.drivers d ON d\.id = l\.assigned_primary_driver_id\s*\n\s*AND \(d\.operating_company_id/g) ?? []).length;
  if (dJoinCount < 2) {
    failures.push(`expected 2 label-resolving "mdata.drivers d" joins (list count + list rows) with no archived_at filter, found ${dJoinCount}`);
  }
  if (!joinPatterns[2].re.test(src)) {
    failures.push('detail query "mdata.drivers pd" (primary driver) join must not filter on archived_at');
  }
  if (!joinPatterns[3].re.test(src)) {
    failures.push('detail query "mdata.drivers sd" (secondary driver) join must not filter on archived_at');
  }

  // The SEPARATE driver-self-access gate must KEEP its archived_at filter — this guard must not be
  // satisfied by someone deleting that check instead of fixing the label joins.
  if (!/d\.identity_user_id = NULLIF\(current_setting\('app\.current_user_id', true\), ''\)::uuid[\s\S]{0,80}AND d\.archived_at IS NULL/.test(src)) {
    failures.push("the driver-self-access EXISTS check (identity_user_id match) must still require archived_at IS NULL — do not remove real access control");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-driver-label-archive-");
  const dir = `${tmp}/apps/backend/src/mdata`;
  fs.mkdirSync(dir, { recursive: true });

  const fixed = `
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                   AND (d.operating_company_id = l.operating_company_id OR EXISTS (x1))
          LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id
                                   AND (d.operating_company_id = l.operating_company_id OR EXISTS (x2))
          LEFT JOIN mdata.drivers pd ON pd.id = l.assigned_primary_driver_id
                                    AND (pd.operating_company_id = l.operating_company_id OR EXISTS (x3))
          LEFT JOIN mdata.drivers sd ON sd.id = l.assigned_secondary_driver_id
                                    AND (sd.operating_company_id = l.operating_company_id OR EXISTS (x4))
          EXISTS (
            SELECT 1 FROM mdata.drivers d
            WHERE d.identity_user_id = NULLIF(current_setting('app.current_user_id', true), '')::uuid
              AND d.archived_at IS NULL
              AND (d.operating_company_id = l.operating_company_id OR EXISTS (x5))
          )
`;
  fs.writeFileSync(`${dir}/loads.routes.ts`, fixed);
  const passFailures = run(tmp);
  if (passFailures.length) throw new Error("PASS fail (should be clean): " + JSON.stringify(passFailures));

  // Mutation 1: exact pre-fix pattern — reintroduce archived_at on the label joins.
  const broken1 = fixed.replace(
    /LEFT JOIN mdata\.drivers d ON d\.id = l\.assigned_primary_driver_id\s*\n\s*AND \(d\.operating_company_id = l\.operating_company_id OR EXISTS \(x1\)\)/,
    "LEFT JOIN mdata.drivers d ON d.id = l.assigned_primary_driver_id\n                                   AND d.archived_at IS NULL\n                                   AND (d.operating_company_id = l.operating_company_id OR EXISTS (x1))"
  );
  fs.writeFileSync(`${dir}/loads.routes.ts`, broken1);
  const f1 = run(tmp);
  if (f1.length === 0) throw new Error("FAIL to catch: reintroduced archived_at on a label join went undetected");

  // Mutation 2: removed the legitimate self-access archived_at check too (must still fail — for a
  // DIFFERENT reason, since that check must stay).
  const broken2 = fixed.replace(
    "AND d.archived_at IS NULL\n              AND (d.operating_company_id = l.operating_company_id OR EXISTS (x5))",
    "AND (d.operating_company_id = l.operating_company_id OR EXISTS (x5))"
  );
  fs.writeFileSync(`${dir}/loads.routes.ts`, broken2);
  const f2 = run(tmp);
  if (f2.length === 0) throw new Error("FAIL to catch: removed self-access archived_at check went undetected");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-dispatch-driver-label-survives-archive SELFTEST PASS");
  process.exit(0);
}

const failures = run();
if (failures.length) {
  console.error("verify-dispatch-driver-label-survives-archive FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-dispatch-driver-label-survives-archive OK — load driver labels survive driver archival; self-access gate unchanged");
