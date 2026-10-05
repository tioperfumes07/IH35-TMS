#!/usr/bin/env node
/**
 * ACCT-F411 — the frontend's aging bucket NAMES must match the backend ladder's, exactly.
 *
 * THE DESIGN THIS PROTECTS
 *   An aging bucket drill carries the bucket's NAME over the wire (`?aging_bucket=d31_60`), never
 *   its day boundaries. Those boundaries live in exactly one place —
 *   apps/backend/src/accounting/aging/buckets.ts, AGING_BUCKETS — and that is also the module the
 *   A/P and A/R aging reports classify with, so the figure and the drilled list agree by
 *   construction. The frontend deliberately does NOT hold the day numbers; it holds only the five
 *   ids, in AgingBucketId in components/shared/AmountLink.tsx.
 *
 *   That is the whole safety property, and it has exactly one weak point: the five NAMES are
 *   written on both sides. Rename a bucket in the ladder and the frontend keeps sending the old id;
 *   the route schema rejects it, and what the owner sees is a drill that 404s or silently reverts
 *   to an unfiltered list. Add a sixth bucket to the ladder and the frontend can never send it, so
 *   a whole column stays unclickable with nothing failing. This guard closes both.
 *
 * WHY A GUARD AND NOT A SHARED PACKAGE
 *   packages/shared-types would hold the union honestly, but the backend cannot import it without
 *   changing its tsconfig rootDir — a build change across the whole backend, which is a bigger risk
 *   than the thing it fixes. The names are five short strings; the guard is the cheaper correct
 *   answer. If the backend ever does depend on shared-types, move the union there and delete this
 *   guard in the same commit.
 *
 * WHAT IT DOES NOT DO
 *   It does not check the day boundaries, because the frontend does not have them. If this guard
 *   ever grows a boundary comparison, the design has regressed: it would mean someone copied the
 *   numbers to the client.
 */
import fs from "node:fs";

const LABEL = "verify-aging-bucket-ids-match-the-ladder";
const LADDER = "apps/backend/src/accounting/aging/buckets.ts";
const CLIENT = "apps/frontend/src/components/shared/AmountLink.tsx";

/** Strip comments so prose naming a bucket never counts as a declaration. */
export function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");
}

/** The ids in AGING_BUCKETS, in ladder order — the canonical list. */
export function ladderIds(src) {
  const code = stripComments(src);
  const block = code.match(/AGING_BUCKETS\s*:[^=]*=\s*\[([\s\S]*?)\]\s*;/);
  if (!block) return null;
  return [...block[1].matchAll(/\bid\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
}

/** The ids in the backend's own AGING_BUCKET_IDS array, which the route schemas validate against. */
export function ladderSchemaIds(src) {
  const code = stripComments(src);
  const block = code.match(/AGING_BUCKET_IDS\s*:[^=]*=\s*\[([\s\S]*?)\]\s*;/);
  if (!block) return null;
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** The ids in the frontend's AgingBucketId union. */
export function clientIds(src) {
  const code = stripComments(src);
  const decl = code.match(/type\s+AgingBucketId\s*=\s*([^;]+);/);
  if (!decl) return null;
  return [...decl[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export function findProblems({ ladderSrc, clientSrc }) {
  const problems = [];
  const ladder = ladderIds(ladderSrc);
  const schema = ladderSchemaIds(ladderSrc);
  const client = clientIds(clientSrc);

  if (!ladder) {
    problems.push(`${LADDER}: AGING_BUCKETS not found — the ladder is the one place the buckets exist`);
  }
  if (!schema) {
    problems.push(`${LADDER}: AGING_BUCKET_IDS not found — the route schemas validate against it`);
  }
  if (!client) {
    problems.push(`${CLIENT}: the AgingBucketId union not found — the drill cannot name a bucket`);
  }
  if (!ladder || !schema || !client) return problems;

  // AGING_BUCKET_IDS exists so zod can enumerate the ids; it must BE the ladder, same order.
  if (schema.join(",") !== ladder.join(",")) {
    problems.push(
      `${LADDER}: AGING_BUCKET_IDS [${schema.join(", ")}] does not match AGING_BUCKETS ` +
        `[${ladder.join(", ")}] — the route schemas would accept or reject the wrong set`
    );
  }
  // Order matters on the client too: a contiguous span is resolved by ladder position, and the
  // union is what documents that order to the next reader.
  if (client.join(",") !== ladder.join(",")) {
    const missing = ladder.filter((id) => !client.includes(id));
    const extra = client.filter((id) => !ladder.includes(id));
    const detail = [
      missing.length ? `missing on the client: ${missing.join(", ")}` : "",
      extra.length ? `unknown to the ladder: ${extra.join(", ")}` : "",
      !missing.length && !extra.length ? "same ids, different order" : "",
    ]
      .filter(Boolean)
      .join("; ");
    problems.push(
      `${CLIENT}: AgingBucketId [${client.join(", ")}] does not match the ladder ` +
        `[${ladder.join(", ")}] — ${detail}. A bucket the client cannot name has an unclickable ` +
        `column; one the ladder does not know is a drill that the route rejects.`
    );
  }
  return problems;
}

/** Fixtures only — a guard's own test must not depend on other seats' commits (LST-F407). */
function selftest() {
  const goodLadder = `
    export const AGING_BUCKET_IDS: readonly AgingBucketId[] = ["current", "d1_30", "d31_60"];
    export const AGING_BUCKETS: readonly AgingBucketDef[] = [
      { id: "current", minDaysOverdue: null, maxDaysOverdue: 0, label: "Current" },
      { id: "d1_30", minDaysOverdue: 1, maxDaysOverdue: 30, label: "1-30 days" },
      { id: "d31_60", minDaysOverdue: 31, maxDaysOverdue: 60, label: "31-60 days" },
    ];`;
  const goodClient = `export type AgingBucketId = "current" | "d1_30" | "d31_60";`;
  const cases = [
    { name: "ids match", ladderSrc: goodLadder, clientSrc: goodClient, expectFail: false },
    {
      name: "client is missing a bucket the ladder added",
      ladderSrc: goodLadder,
      clientSrc: `export type AgingBucketId = "current" | "d1_30";`,
      expectFail: true,
    },
    {
      name: "client names a bucket the ladder does not know",
      ladderSrc: goodLadder,
      clientSrc: `export type AgingBucketId = "current" | "d1_30" | "d31_60" | "d61_120";`,
      expectFail: true,
    },
    {
      name: "same ids, different order",
      ladderSrc: goodLadder,
      clientSrc: `export type AgingBucketId = "d31_60" | "current" | "d1_30";`,
      expectFail: true,
    },
    {
      name: "the backend's own two lists disagree",
      ladderSrc: goodLadder.replace('"current", "d1_30", "d31_60"', '"current", "d1_30"'),
      clientSrc: goodClient,
      expectFail: true,
    },
    {
      name: "a bucket named only in a comment is not a declaration",
      ladderSrc: goodLadder + `\n// d61_90 was considered and rejected`,
      clientSrc: goodClient,
      expectFail: false,
    },
    {
      name: "the ladder went missing",
      ladderSrc: `export const AGING_BUCKET_IDS = ["current"];`,
      clientSrc: goodClient,
      expectFail: true,
    },
    {
      name: "the client union went missing",
      ladderSrc: goodLadder,
      clientSrc: `export type Something = "current";`,
      expectFail: true,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = findProblems(c);
    const ok = problems.length > 0 === c.expectFail;
    console.log(`${ok ? "ok   " : "FAIL "} ${c.name}`);
    if (ok) pass += 1;
    else if (problems.length) console.log(`        ${problems.join("\n        ")}`);
  }
  console.log(`\n${LABEL} --selftest: ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else {
  for (const f of [LADDER, CLIENT]) {
    if (!fs.existsSync(f)) {
      console.error(`${LABEL} FAIL — ${f} is missing.`);
      process.exit(1);
    }
  }
  const problems = findProblems({
    ladderSrc: fs.readFileSync(LADDER, "utf8"),
    clientSrc: fs.readFileSync(CLIENT, "utf8"),
  });
  if (problems.length > 0) {
    console.error(`${LABEL} FAIL — ${problems.length} defect(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  const ids = ladderIds(fs.readFileSync(LADDER, "utf8"));
  console.log(
    `${LABEL} OK — ${ids.length} bucket id(s) [${ids.join(", ")}] agree across the ladder, the ` +
      `route schemas and the client; the day boundaries stay server-side.`
  );
}
