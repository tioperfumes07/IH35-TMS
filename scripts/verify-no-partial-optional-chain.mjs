#!/usr/bin/env node
/** @matrix-built {"modules":["customers","maintenance","fuel","system"],"cols":["connectivity"],"leaves":["list.create","maintenance.modal.work_order_detail","planner","tab.overview"],"task":"CLS-F7066-PARTIAL-OPTIONAL-CHAIN-VERTICAL-CRASH-SWEEP","vertical":"class-sweep"} */
/**
 * verify-no-partial-optional-chain
 *
 * THE DEFECT. `query.data?.rows.length` guards the FIRST hop and nothing after it. If the query
 * resolves to an object that lacks `rows`, `.length` throws — and because these expressions sit in
 * render, React unmounts the ENTIRE page to the router ErrorBoundary. A badge count takes the module
 * around it down.
 *
 * WHY IT SURVIVED 35 TIMES. The `?.` makes the line LOOK defensive, so it reads as already-handled in
 * review. It defends the wrong hop. That is precisely why this needs a mechanical guard rather than
 * care: the shape is invisible to a careful reader.
 *
 * PROVEN, NOT THEORETICAL. Found live in the frontend suite 2026-07-27:
 *   - useSettlementDisputes' openCount — `listQuery.data?.disputes.filter(...)` — killed the whole
 *     Drivers page with "Cannot read properties of undefined (reading 'filter')".
 *   - MissingRequiredChip — `summary.required.filter(...)` — that chip renders inside the fleet,
 *     asset and vehicle profile pages, so one malformed payload blanks all three.
 *
 * SCOPE. Deliberately narrow, to stay a hard rule rather than a noisy one: only `X.data?.Y.method()`,
 * where the first hop IS optional-chained and the second is not. A fully-unchained `a.b.c` is often
 * correct because an enclosing conditional already proved it, and flagging those would produce
 * hundreds of false positives and get the guard disabled — which is worse than no guard.
 *
 * Usage: node scripts/verify-no-partial-optional-chain.mjs [--selftest]
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const LABEL = "verify-no-partial-optional-chain";
const SCAN_DIRS = ["apps/frontend/src", "apps/driver-pwa/src"];

/** Array/collection members whose call on `undefined` throws. */
const MEMBERS = "filter|map|reduce|forEach|some|every|find|findIndex|flatMap|join|slice|sort|length";

export function stripCommentsAndStrings(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:[^`\\]|\\.)*`/g, "``")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

export function partialChainProblems(path, rawSrc) {
  const out = [];
  const src = stripCommentsAndStrings(rawSrc);
  const re = new RegExp(String.raw`\.data\?\.([A-Za-z_$][\w$]*)\.(${MEMBERS})\b`, "g");
  for (const m of src.matchAll(re)) {
    const line = src.slice(0, m.index).split("\n").length;
    out.push(
      `${path}:${line} — \`.data?.${m[1]}.${m[2]}\` guards only the FIRST hop. If the response resolves without \`${m[1]}\`, \`.${m[2]}\` throws in render and React unmounts the whole page to the ErrorBoundary. Write \`.data?.${m[1]}?.${m[2]}\` (or \`(x.data?.${m[1]} ?? []).${m[2]}\`).`
    );
  }
  return out;
}

function collectFiles() {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules") continue;
        walk(full);
      } else if (/\.(ts|tsx)$/.test(e.name)) {
        out.push({ path: full.replace(`${ROOT}/`, ""), src: readFileSync(full, "utf8") });
      }
    }
  };
  for (const d of SCAN_DIRS) walk(resolve(ROOT, d));
  return out;
}

function run() {
  const files = collectFiles();
  const problems = files.flatMap(({ path, src }) => partialChainProblems(path, src));
  if (problems.length) {
    console.error(`[${LABEL}] FAILED — ${problems.length} partial optional chain(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(`[${LABEL}] OK — ${files.length} file(s) scanned; no \`data?.X.method()\` partial chains`);
  return true;
}

function selftest() {
  let ok = true;

  if (!run()) {
    console.error("SELFTEST FAIL: the real tree is flagged — false positive");
    ok = false;
  }

  const cases = [
    ["the exact defect (.length)", `const n = q.data?.rows.length ?? 0;`, true],
    ["the exact defect (.filter)", `const open = listQuery.data?.disputes.filter((r) => r.x).length ?? 0;`, true],
    ["the exact defect (.find)", `autoStatusSwitchQuery.data?.events.find((e) => e.id === load?.id)`, true],
    ["fully chained — MUST NOT flag", `const n = q.data?.rows?.length ?? 0;`, false],
    ["nullish-defaulted — MUST NOT flag", `const rows = (q.data?.rows ?? []).filter(Boolean);`, false],
    ["no optional chain at all — out of scope by design", `const n = props.summary.rows.length;`, false],
    ["method on data itself — MUST NOT flag", `q.data?.filter((r) => r.x)`, false],
    ["inside a comment — MUST NOT flag", `// q.data?.rows.length is the old bug\nconst n = 1;`, false],
  ];

  for (const [name, src, shouldFlag] of cases) {
    const flagged = partialChainProblems("fixture.tsx", src).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  // Re-plant the exact historical defect into the REAL repaired file — proves the guard protects it.
  const target = "apps/frontend/src/hooks/useSettlementDisputes.ts";
  const real = readFileSync(resolve(ROOT, target), "utf8");
  const reverted = real.replace(/\.data\?\.disputes\?\.filter/, ".data?.disputes.filter");
  if (reverted === real) {
    console.error(`SELFTEST FAIL: could not re-plant the defect into ${target} — the case proves nothing`);
    ok = false;
  } else if (!partialChainProblems(target, reverted).length) {
    console.error(`SELFTEST FAIL: re-planting the partial chain into ${target} was not caught`);
    ok = false;
  } else {
    console.log("SELFTEST: re-planting the original openCount defect into useSettlementDisputes -> caught");
  }

  // Re-plant the current upload-lifecycle defect into the exact repaired component. This keeps the
  // generic class guard tied to the Driver Border Credentials path that exposed the second-hop gap.
  const borderTarget = "apps/frontend/src/components/driver-profile/BorderCredentialsSection.tsx";
  const borderReal = readFileSync(resolve(ROOT, borderTarget), "utf8");
  const borderReverted = borderReal.replace(/\.data\?\.categories\?\.find/, ".data?.categories.find");
  if (borderReverted === borderReal) {
    console.error(`SELFTEST FAIL: could not re-plant the defect into ${borderTarget} — the case proves nothing`);
    ok = false;
  } else if (!partialChainProblems(borderTarget, borderReverted).length) {
    console.error(`SELFTEST FAIL: re-planting the partial chain into ${borderTarget} was not caught`);
    ok = false;
  } else {
    console.log("SELFTEST: re-planting the Border Credentials category lookup defect -> caught");
  }

  if (!ok) process.exit(1);
  console.log(`[${LABEL}] SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
