#!/usr/bin/env node
/**
 * FAIL-T1 — EVERY load-create path must write `mdata.loads.is_sample_data`.
 *
 * There are TWO writers, and they mint different-looking load numbers, which is exactly why one of them
 * went unnoticed for six loads:
 *
 *   A  dispatch/book-load.service.ts        numbers via load-id-reservation.service.ts:74 -> "L-<ymd>-<seq>"
 *      (the Book wizard)                    has written is_sample_data since FAIL-D6.
 *   B  mdata/loads.routes.ts                numbers via nextLoadNumber -> "L<COMPANY_TOKEN>-<ymd>-<seq>"
 *      (POST /api/v1/mdata/loads)           OMITTED the column entirely, so every row took the false default.
 *
 * Prod 2026-08-08: LUSMCAFREIGHT-20260808-0001..0004 and two older rows were 0-for-6 tagged AT INSERT
 * (-0001 only reads true because it was hand-patched at 20:05:14), while the "L-" path was 11-of-11.
 * Same opco, no prefix column in the DB — the split was purely in code.
 *
 * This is not a labelling nit. An untagged load is indistinguishable from a real one, and a single
 * Delivered step on it fires revenue recognition into REAL income.
 *
 * The guard also enforces LOCKSTEP arity on the route's INSERT, because the failure mode when someone adds
 * a column without a placeholder is a runtime 500, not a compile error.
 *
 *   node scripts/verify-load-create-paths-tag-sample-data.mjs
 *   node scripts/verify-load-create-paths-tag-sample-data.mjs --selftest
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const LABEL = "verify-load-create-paths-tag-sample-data";
const ROUTE = "apps/backend/src/mdata/loads.routes.ts";
const WIZARD = "apps/backend/src/dispatch/book-load.service.ts";

/** Pull the `INSERT INTO mdata.loads ( ... ) VALUES ( ... )` column list + placeholder list. */
function readInsert(src) {
  const m = /INSERT INTO mdata\.loads\s*\(([\s\S]*?)\)\s*VALUES\s*\(([\s\S]*?)\)/i.exec(src);
  if (!m) return null;
  const columns = m[1]
    .split(",")
    .map((c) => c.replace(/--[^\n]*/g, "").trim())
    .filter(Boolean);
  const placeholders = [...m[2].matchAll(/\$(\d+)/g)].map((p) => Number(p[1]));
  return { columns, placeholders };
}

/**
 * Every OTHER non-test writer of mdata.loads must either tag, or be listed here with a reason.
 * These two are classified DELIBERATELY UNTAGGED — origin test applied, not blanket-fixed:
 *   - the EDI 204 handler creates loads from REAL broker tenders, so false is the CORRECT value;
 *   - csv-seed-import, despite the name, imports REAL TRK/TRANSP rows (see its own header comment
 *     about "real customer/vendor rows during seed import"), so false is likewise correct.
 * Tagging either one true would INVENT sample data on real freight — the inverse of FAIL-T1.
 * A NEW writer that appears here without tagging fails this guard until someone classifies it.
 */
const DELIBERATELY_UNTAGGED = new Map([
  ["apps/backend/src/integrations/edi/transactions/inbound-204.handler.ts", "real broker EDI 204 tender — genuinely real freight"],
  ["apps/backend/src/seed/csv-seed-import.ts", "imports REAL TRK/TRANSP historical rows despite the 'seed' name"],
]);

/** Every non-test .ts under apps/backend/src that writes mdata.loads. */
function findLoadWriters(root) {
  const out = [];
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const abs = path.join(dir, entry);
      if (statSync(abs).isDirectory()) {
        if (entry === "__tests__") continue;
        walk(abs);
        continue;
      }
      if (!entry.endsWith(".ts") || entry.endsWith(".test.ts") || entry.endsWith(".d.ts")) continue;
      const src = readFileSync(abs, "utf8");
      if (/INSERT INTO mdata\.loads/i.test(src)) {
        out.push([path.relative(root, abs).split(path.sep).join("/"), src]);
      }
    }
  })(path.join(root, "apps/backend/src"));
  return out;
}

function assert(files) {
  const problems = [];
  const route = files[ROUTE] ?? "";
  const wizard = files[WIZARD] ?? "";

  // Path B — the one that regressed, then got rewired (2026-09-23, E20/loads.routes.ts) onto
  // createLoadWithFullSideEffects (the ONE shared create path, verify-one-load-create-path.mjs)
  // instead of its own local INSERT. There are now two ways this route can honestly satisfy
  // FAIL-T1: (a) a local INSERT INTO mdata.loads with is_sample_data in its own column list (the
  // pre-rewire shape, still checked so a REVERT can't silently drop the tag), or (b) delegation
  // to createLoadWithFullSideEffects with is_sample_data passed straight through in the
  // BookLoadInput object literal — the actual INSERT then lives inside book-load.service.ts,
  // which is checked separately below via the same is_sample_data-in-source scan already applied
  // to Path A. Accepting ONLY (a) after the rewire would make this guard permanently, falsely red
  // on correct code; accepting NEITHER by skipping the check would let is_sample_data silently
  // drop out of the delegated call and reintroduce the exact FAIL-T1 defect this guard exists to
  // catch, just one level removed.
  const ins = readInsert(route);
  const delegatesToSharedPath = /createLoadWithFullSideEffects\(/.test(route);
  const passesSampleDataThrough = /is_sample_data:\s*b\.is_sample_data/.test(route);
  if (!ins && !delegatesToSharedPath) {
    problems.push(
      `${ROUTE}: could not locate a local INSERT INTO mdata.loads (...) VALUES (...) NOR a call to ` +
        `createLoadWithFullSideEffects — anchor drifted on both known shapes.`,
    );
  } else if (!ins && delegatesToSharedPath) {
    if (!passesSampleDataThrough) {
      problems.push(
        `${ROUTE}: delegates to createLoadWithFullSideEffects but never passes ` +
          `"is_sample_data: b.is_sample_data" into the BookLoadInput object — the shared INSERT ` +
          `then always takes the false default for loads created through this route (FAIL-T1, ` +
          `one level removed: a Delivered step on an untagged load still fires revrec into REAL income).`,
      );
    }
  } else if (ins) {
    if (!ins.columns.includes("is_sample_data")) {
      problems.push(
        `${ROUTE}: INSERT INTO mdata.loads must include is_sample_data (FAIL-T1). Without it every load ` +
          `created through POST /api/v1/mdata/loads takes the false default and is indistinguishable from ` +
          `a real load — one Delivered step then fires revrec into REAL income.`,
      );
    }
    const distinct = new Set(ins.placeholders).size;
    if (distinct !== ins.columns.length) {
      problems.push(
        `${ROUTE}: lockstep broken — ${ins.columns.length} columns vs ${distinct} distinct placeholders. ` +
          `Column list, placeholder list and the values array must grow together (this fails at RUNTIME, not compile).`,
      );
    }
  }

  // The route must be able to RECEIVE the flag, or the column is written but never true.
  if (!/is_sample_data:\s*z\./.test(route)) {
    problems.push(`${ROUTE}: createLoadBodySchema must accept is_sample_data, or the column can never be set true`);
  }

  // Path A — must not regress the other way.
  if (!/is_sample_data/.test(wizard)) {
    problems.push(`${WIZARD}: the Book wizard create path must keep writing is_sample_data (FAIL-D6)`);
  }

  // The point of FAIL-T1: a SECOND writer existed and nobody noticed. Enumerate them all so a THIRD
  // cannot ship untagged either — tag it, or classify it in DELIBERATELY_UNTAGGED with a reason.
  for (const [rel, src] of files.__writers ?? []) {
    if (/is_sample_data/.test(src)) continue;
    if (DELIBERATELY_UNTAGGED.has(rel)) continue;
    problems.push(
      `${rel}: writes INSERT INTO mdata.loads but never mentions is_sample_data. Either tag the load, ` +
        `or add this path to DELIBERATELY_UNTAGGED in this guard with the reason it is genuinely real ` +
        `freight (FAIL-T1: a second untagged writer went unnoticed for six loads).`,
    );
  }

  return problems;
}

const files = Object.fromEntries([ROUTE, WIZARD].map((rel) => [rel, readFileSync(path.join(ROOT, rel), "utf8")]));
files.__writers = findLoadWriters(ROOT);

if (SELFTEST) {
  const checks = [];

  // 1. Plant the original FAIL-T1, on the CURRENT (post-2026-09-23 rewire) shape of this route:
  // it delegates to createLoadWithFullSideEffects and must pass is_sample_data through in that
  // call's input object -- drop that one line and the flag can never be set true again.
  const untagged = {
    ...files,
    [ROUTE]: files[ROUTE].replace(/\s*is_sample_data:\s*b\.is_sample_data,\n/, "\n"),
  };
  checks.push(["untagged delegated create", assert(untagged).some((p) => /never passes/.test(p))]);

  // 2. Plant total anchor loss on Path B: no local INSERT, no delegation call either (e.g. a
  // botched refactor that deleted the createLoadWithFullSideEffects call entirely).
  const noAnchor = {
    ...files,
    [ROUTE]: files[ROUTE].replace(/createLoadWithFullSideEffects\(/g, "someOtherFunctionEntirely("),
  };
  checks.push(["anchor lost on both known shapes", assert(noAnchor).some((p) => /anchor drifted on both known shapes/.test(p))]);

  // 3. Plant a regression on path A.
  const wizardBroken = { ...files, [WIZARD]: files[WIZARD].replace(/is_sample_data/g, "unrelated_field") };
  checks.push(["wizard regression", assert(wizardBroken).some((p) => /FAIL-D6/.test(p))]);

  // 4. Plant a brand-new untagged writer that is NOT in the allowlist.
  const newWriter = {
    ...files,
    __writers: [...files.__writers, ["apps/backend/src/fake/new-load-writer.ts", "INSERT INTO mdata.loads (operating_company_id) VALUES ($1)"]],
  };
  checks.push(["unclassified new writer", assert(newWriter).some((p) => /never mentions is_sample_data/.test(p))]);

  // 5. ...and that an allowlisted one is NOT flagged (no false positive on real-freight paths).
  checks.push([
    "allowlist honoured",
    !assert(files).some((p) => /inbound-204|csv-seed-import/.test(p)),
  ]);

  const failed = checks.filter(([, caught]) => !caught).map(([n]) => n);
  if (failed.length) {
    console.error(`${LABEL} SELFTEST FAIL — not caught: ${failed.join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — ${checks.length}/${checks.length} planted regressions caught`);
  process.exit(0);
}

const problems = assert(files);
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
}
console.log(`${LABEL}: OK — both load-create paths write is_sample_data (route delegates to the shared create path, which stays lockstep)`);
process.exit(0);
