#!/usr/bin/env node
/**
 * Fixed-assets canonicalization guard (Cursor lane / FA-ARCHIVE).
 *
 * Locks:
 *   (1) No live code path writes/reads the orphan fixed_assets.* schema
 *       (must be fixed_assets_archived.* after 202609100050, or accounting.fixed_assets).
 *   (2) CoA role keys fixed_asset_default / accum_depr_default / depr_expense_default
 *       exist in COA_ROLE_VALUES.
 *   (3) FIN-21 depreciation poster writes accounting.depreciation_autopost_runs on posted.
 *   (4) HOLD migration 202609100050 exists and carries DO-NOT-RUN / OWNER-apply markers.
 *
 * Rule 17: wired via verify-steps only — no package.json / CI thrash.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fa-archive-canonical";

const MIG = "db/migrations/202609100050_fa_archive_fixed_assets_schema_coa_roles.sql";
const RESOLVER = "apps/backend/src/accounting/coa-roles/resolver.service.ts";
const POSTER = "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts";
const CANONICAL = "scripts/canonical-relations.json";
const CONTENT_VERIFIER = "scripts/lib/migration-content-verifier.mjs";

/**
 * @param {{ mig: string, resolver: string, poster: string, canonical: string, backendSrc: string }} fixture
 * @returns {string[]}
 */
export function assertFaArchiveCanonical(fixture) {
  const f = [];
  const mig = fixture.mig ?? "";
  const resolver = fixture.resolver ?? "";
  const poster = fixture.poster ?? "";
  const canonical = fixture.canonical ?? "";
  const backendSrc = fixture.backendSrc ?? "";

  if (!mig) f.push(`${MIG}: missing`);
  else {
    if (!/DO NOT RUN ON PROD/i.test(mig)) f.push(`${MIG}: must carry DO NOT RUN ON PROD`);
    if (!/Owner Neon-applies/i.test(mig) && !/OWNER/i.test(mig)) f.push(`${MIG}: must say owner Neon-applies`);
    if (!/ALTER SCHEMA fixed_assets RENAME TO fixed_assets_archived/i.test(mig)) {
      f.push(`${MIG}: must rename fixed_assets → fixed_assets_archived`);
    }
    // Content-drift masks string literals — EXECUTE 'ALTER SCHEMA…' is invisible to the verifier.
    if (/EXECUTE\s+'ALTER SCHEMA fixed_assets RENAME/i.test(mig)) {
      f.push(`${MIG}: ALTER SCHEMA rename must be a bare statement (not EXECUTE '…') so content-drift sees it`);
    }

    if (!/fixed_asset_default/.test(mig) || !/accum_depr_default/.test(mig) || !/depr_expense_default/.test(mig)) {
      f.push(`${MIG}: must widen CHECK for the 3 fixed-asset CoA roles`);
    }
    // Live Neon already admits unbilled_revenue (DISP-01). DROP+ADD without it rejects prod rows.
    if (!/unbilled_revenue/.test(mig)) {
      f.push(`${MIG}: CoA role CHECK must keep live unbilled_revenue (superset of prod)`);
    }
    if (!/QBO-1193/.test(mig) || !/QBO-1150040035/.test(mig)) {
      f.push(`${MIG}: must designate TRK asset (QBO-1193) + depr expense (QBO-1150040035)`);
    }
  }

  for (const role of ["fixed_asset_default", "accum_depr_default", "depr_expense_default"]) {
    if (!new RegExp(`"${role}"`).test(resolver)) f.push(`${RESOLVER}: missing CoA role ${role}`);
  }

  if (!/INSERT\s+INTO\s+accounting\.depreciation_autopost_runs/i.test(poster)) {
    f.push(`${POSTER}: must INSERT into accounting.depreciation_autopost_runs on posted`);
  }
  if (!/FROM accounting\.fixed_assets/i.test(poster) && !/accounting\.fixed_assets/i.test(poster)) {
    f.push(`${POSTER}: must post against accounting.fixed_assets (canonical)`);
  }

  if (/"fixed_assets\.(assets|asset_classes|depreciation_schedules|disposals)"/.test(canonical)) {
    f.push(`${CANONICAL}: must not list live fixed_assets.* (use fixed_assets_archived.*)`);
  }
  if (!/"fixed_assets_archived\.assets"/.test(canonical)) {
    f.push(`${CANONICAL}: must list fixed_assets_archived.assets`);
  }

  // Live backend must not query the pre-archive schema name as a write target.
  if (/\bFROM\s+fixed_assets\./i.test(backendSrc) || /\bINTO\s+fixed_assets\./i.test(backendSrc) || /\bUPDATE\s+fixed_assets\./i.test(backendSrc)) {
    f.push("apps/backend: must not SQL-target fixed_assets.* (use accounting.fixed_assets or fixed_assets_archived)");
  }

  return f;
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function walkBackendSqlHints() {
  const srcRoot = path.join(ROOT, "apps/backend/src");
  const chunks = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
        chunks.push(fs.readFileSync(p, "utf8"));
      }
    }
  };
  walk(srcRoot);
  return chunks.join("\n");
}

function selftest() {
  let ok = true;
  const check = (name, fixture, expectFail) => {
    const problems = assertFaArchiveCanonical(fixture);
    const failed = problems.length > 0;
    const pass = failed === expectFail;
    if (!pass) ok = false;
    console.log(`  ${pass ? "ok  " : "FAIL"} ${name} — ${failed ? problems[0] : "clean"}`);
  };

  const good = {
    mig: read(MIG),
    resolver: read(RESOLVER),
    poster: read(POSTER),
    canonical: read(CANONICAL),
    contentVerifier: read(CONTENT_VERIFIER),
    backendSrc: "SELECT * FROM accounting.fixed_assets",
  };
  check("live sources PASS", good, false);

  check(
    "missing rename FAILS",
    { ...good, mig: "-- DO NOT RUN ON PROD\n-- Owner Neon-applies\nfixed_asset_default accum_depr_default depr_expense_default QBO-1193 QBO-1150040035" },
    true
  );
  check(
    "live fixed_assets.* in canonical FAILS",
    { ...good, canonical: JSON.stringify({ tables: ["fixed_assets.assets"] }) },
    true
  );
  check(
    "unwired autopost FAILS",
    { ...good, poster: "FROM accounting.fixed_assets /* no autopost insert */" },
    true
  );

  console.log(ok ? `${LABEL} self-test PASS` : `${LABEL} self-test FAIL`);
  process.exit(ok ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = assertFaArchiveCanonical({
    mig: read(MIG),
    resolver: read(RESOLVER),
    poster: read(POSTER),
    canonical: read(CANONICAL),
    contentVerifier: read(CONTENT_VERIFIER),
    backendSrc: walkBackendSqlHints(),
  });
  if (problems.length) {
    console.error(`${LABEL} FAILED:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — archived schema + 3 CoA roles + autopost_runs wire locked.`);
}

main();
