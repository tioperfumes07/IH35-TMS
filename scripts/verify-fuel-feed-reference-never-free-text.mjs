#!/usr/bin/env node
// verify-fuel-feed-reference-never-free-text — a fuel row's transaction_reference is the receipt number printed on the
// settlement line, or NULL. It is never a slice of the line's free text.
//
// Why: scripts/feed/feed-settlement-day.mts fell back to `desc.replace(/[^A-Za-z0-9]+/g, "").slice(-8)` when a line had
// no "inv NNNN" token, so "Fuel-DEF-Diesel Exhaust Fluid" became the reference "ustFluid" on four USMCA DEF rows
// (Lead ROUND 394 §3, 2026-10-04). A literal reference looks like a receipt and collides like a duplicate.
//
// How: extracts parseFuelDesc from the feed, strips its type annotations, and RUNS it — no regex-on-source opinion.
//   --selftest  plants the old fallback and proves the guard fails on it.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FEED = "scripts/feed/feed-settlement-day.mts";

function extractParser(src) {
  const start = src.indexOf("function parseFuelDesc(");
  if (start < 0) throw new Error(`${FEED}: parseFuelDesc not found — the guard fails closed`);
  let i = src.indexOf("{", src.indexOf(")", start) + 1);
  // skip the return-type object literal: the body brace is the first "{" after "): {...}"
  const sig = src.slice(start, src.indexOf("\n", start));
  if (/\)\s*:\s*\{/.test(sig)) i = src.indexOf("{", start + sig.lastIndexOf("}") + 1);
  let depth = 0;
  let end = i;
  for (; end < src.length; end++) {
    if (src[end] === "{") depth++;
    else if (src[end] === "}" && --depth === 0) break;
  }
  const body = src.slice(i, end + 1);
  return new Function("desc", body.replace(/^\{/, "").replace(/\}$/, ""));
}

const CASES = [
  { desc: "Fuel-DEF-Diesel Exhaust Fluid", want: null },
  { desc: "LOVES Driver Reimbursement-Fuel-Def", want: null },
  { desc: "LOVES LAREDO TX inv 1848853", want: "1848853" },
  { desc: "PILOT SAN ANTONIO inv 99794138", want: "99794138" },
];

function check(src) {
  const parse = extractParser(src);
  const bad = [];
  for (const c of CASES) {
    const got = parse(c.desc)?.invoice ?? null;
    if (got !== c.want) bad.push(`"${c.desc}" -> reference ${JSON.stringify(got)} (want ${JSON.stringify(c.want)})`);
  }
  return bad;
}

const src = readFileSync(join(ROOT, FEED), "utf8");

if (process.argv.includes("--selftest")) {
  const planted = src.replace(
    /const invoice = invM\?\.\[1\] \?\? null;/,
    'const invoice = invM?.[1] ?? (desc.replace(/[^A-Za-z0-9]+/g, "").slice(-8) || "UNK");',
  );
  if (planted === src) {
    console.error("verify-fuel-feed-reference-never-free-text --selftest: could not plant the old fallback");
    process.exit(1);
  }
  const plantedBad = check(planted);
  const liveBad = check(src);
  if (plantedBad.length === 0 || liveBad.length !== 0) {
    console.error(`verify-fuel-feed-reference-never-free-text --selftest FAIL — planted ${plantedBad.length}, live ${liveBad.length}`);
    process.exit(1);
  }
  console.log(`verify-fuel-feed-reference-never-free-text --selftest PASS — planted free-text fallback caught (${plantedBad.length}), live clean`);
  process.exit(0);
}

const bad = check(src);
if (bad.length) {
  console.error(`verify-fuel-feed-reference-never-free-text FAIL — ${FEED} invents a reference:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`verify-fuel-feed-reference-never-free-text OK — ${CASES.length} settlement fuel descriptions: receipt number or NULL, never free text`);
