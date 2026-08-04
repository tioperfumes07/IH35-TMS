#!/usr/bin/env node
/**
 * GUARD: module-completion manifest arithmetic cannot contradict itself.
 *
 * SOURCE OF TRUTH = items[] only. Stored pass_count / total_count / progress are
 * derived mirrors that MUST match scoreManifest(items). The silent-drift hole was
 * UI/CI reading stored "0 of 5" while items[] were all PASS — this guard never
 * trusts stored fields as authoritative; it scores N/M from items[] and FAILS any
 * stored disagreement.
 *
 * For every docs/module-completion/*.json FAIL when:
 *   (a) progress string ≠ `${pass_count} of ${total_count}` OR those counts ≠ scored N/M from items[]
 *   (b) complete:true while any item is not PASS / qualifying HOLD
 *   (c) complete:true while pass_count < total_count (or scored N < M)
 *
 * --write  rewrite pass_count / total_count / progress from items[] (and default
 *          prod_verified:false on items missing the key — NEVER sets true).
 * --selftest  mutation tests both directions.
 *
 * Companion to verify-module-completion (Rule 24). This guard is the mechanical
 * floor that makes a "0 of 5" banner with 5 PASS items impossible to merge.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadManifests, qualifiesHold, scoreManifest } from "./verify-module-completion.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "docs/module-completion");
const LABEL = "verify-module-manifest-integrity";
const WRITE = process.argv.includes("--write");
const SELFTEST = process.argv.includes("--selftest");

const PROGRESS_RE = /^(\d+)\s+of\s+(\d+)$/;

export function scoredCounts(data) {
  const { N, M, progress } = scoreManifest(data);
  return { N, M, progress };
}

/** Problems for one manifest. Does not mutate. */
export function assertManifestIntegrity(file, data) {
  const problems = [];
  const items = Array.isArray(data.items) ? data.items : [];
  const { N, M, progress: honestProgress } = scoredCounts(data);

  const pc = data.pass_count;
  const tc = data.total_count;
  const prog = data.progress;

  if (typeof pc !== "number" || !Number.isInteger(pc) || pc < 0) {
    problems.push(`${file}: pass_count must be a non-negative integer (got ${JSON.stringify(pc)})`);
  }
  if (typeof tc !== "number" || !Number.isInteger(tc) || tc < 0) {
    problems.push(`${file}: total_count must be a non-negative integer (got ${JSON.stringify(tc)})`);
  }
  if (typeof prog !== "string" || !PROGRESS_RE.test(prog)) {
    problems.push(
      `${file}: progress must be exactly "N of M" (got ${JSON.stringify(prog)}) — no suffixes`
    );
  }

  if (typeof pc === "number" && pc !== N) {
    problems.push(`${file}: pass_count=${pc} ≠ scored N=${N} from items[]`);
  }
  if (typeof tc === "number" && tc !== M) {
    problems.push(`${file}: total_count=${tc} ≠ items.length=${M}`);
  }
  if (typeof prog === "string" && PROGRESS_RE.test(prog) && prog !== honestProgress) {
    problems.push(`${file}: progress=${JSON.stringify(prog)} ≠ scored ${JSON.stringify(honestProgress)}`);
  }
  if (typeof prog === "string" && typeof pc === "number" && typeof tc === "number") {
    const expectedFromFields = `${pc} of ${tc}`;
    if (PROGRESS_RE.test(prog) && prog !== expectedFromFields) {
      problems.push(
        `${file}: progress=${JSON.stringify(prog)} ≠ pass_count/total_count "${expectedFromFields}"`
      );
    }
  }

  // (b)(c) complete:true integrity
  if (data.complete === true) {
    const notDone = items.filter((it) => it.status !== "PASS" && !qualifiesHold(it));
    if (notDone.length) {
      problems.push(
        `${file}: complete:true while item(s) not PASS/qualifying-HOLD: ${notDone.map((i) => i.id).join(", ")}`
      );
    }
    if (typeof pc === "number" && typeof tc === "number" && pc < tc) {
      problems.push(`${file}: complete:true while pass_count(${pc}) < total_count(${tc})`);
    }
    if (N < M) {
      problems.push(`${file}: complete:true while scored N(${N}) < M(${M})`);
    }
  }

  // prod_verified must be boolean when present; missing is OK (defaults false in UI)
  for (const it of items) {
    if ("prod_verified" in it && typeof it.prod_verified !== "boolean") {
      problems.push(`${file}: item ${it.id} prod_verified must be boolean`);
    }
  }

  return problems;
}

export function syncManifestCounts(data) {
  const { N, M, progress } = scoredCounts(data);
  const next = { ...data, pass_count: N, total_count: M, progress };
  next.items = (Array.isArray(data.items) ? data.items : []).map((it) => {
    if ("prod_verified" in it) return it;
    return { ...it, prod_verified: false };
  });
  return next;
}

function writeSynced() {
  let n = 0;
  for (const { file, data } of loadManifests(DIR)) {
    const synced = syncManifestCounts(data);
    const abs = path.join(ROOT, file);
    const before = JSON.stringify(data);
    const after = JSON.stringify(synced);
    if (before !== after) {
      // Preserve key order roughly: rewrite with stable JSON formatting (2-space)
      fs.writeFileSync(abs, `${JSON.stringify(synced, null, 2)}\n`, "utf8");
      n += 1;
      console.log(`${LABEL}: wrote ${file} → ${synced.progress} complete=${synced.complete}`);
    }
  }
  console.log(`${LABEL}: --write updated ${n} manifest(s)`);
}

function selftest() {
  const failures = [];

  // (a) progress contradicts pass_count/total_count
  const badProgress = {
    module: "help",
    complete: true,
    pass_count: 0,
    total_count: 5,
    progress: "0 of 5",
    items: [
      { id: "A", title: "a", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "B", title: "b", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "C", title: "c", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "D", title: "d", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "E", title: "e", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
    ],
  };
  const pA = assertManifestIntegrity("help.json", badProgress);
  if (!pA.some((x) => x.includes("pass_count=0") || x.includes('progress="0 of 5"'))) {
    failures.push(`(a) help-style contradiction not caught: ${pA.join("; ")}`);
  }

  // sync fixes (a)
  const fixed = syncManifestCounts(badProgress);
  if (fixed.pass_count !== 5 || fixed.total_count !== 5 || fixed.progress !== "5 of 5") {
    failures.push(`sync wrong: ${JSON.stringify({ pc: fixed.pass_count, tc: fixed.total_count, p: fixed.progress })}`);
  }
  if (assertManifestIntegrity("help.json", fixed).length) {
    failures.push(`synced help still fails: ${assertManifestIntegrity("help.json", fixed).join("; ")}`);
  }

  // (b) complete:true with OPEN item
  const badCompleteItem = {
    module: "x",
    complete: true,
    pass_count: 1,
    total_count: 2,
    progress: "1 of 2",
    items: [
      { id: "A", title: "a", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "B", title: "b", layers: ["DOD-A"], spec: "s", status: "OPEN", evidence: "e" },
    ],
  };
  const pB = assertManifestIntegrity("x.json", badCompleteItem);
  if (!pB.some((x) => x.includes("complete:true while item"))) {
    failures.push(`(b) not caught: ${pB.join("; ")}`);
  }

  // (c) complete:true with pass_count < total_count (counts consistent with each other but incomplete)
  const badCompleteCounts = {
    module: "y",
    complete: true,
    pass_count: 1,
    total_count: 2,
    progress: "1 of 2",
    items: [
      { id: "A", title: "a", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
      { id: "B", title: "b", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" },
    ],
  };
  // items are 2 PASS so scored N=2 — pass_count=1 is the contradiction with items AND complete
  const pC = assertManifestIntegrity("y.json", badCompleteCounts);
  if (!pC.some((x) => x.includes("pass_count=1") || x.includes("complete:true while pass_count"))) {
    failures.push(`(c)/count mismatch not caught: ${pC.join("; ")}`);
  }

  // Direction reverse: honest complete:true all PASS → clean
  const good = syncManifestCounts({
    module: "z",
    complete: true,
    items: [
      { id: "A", title: "a", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e", prod_verified: false },
      { id: "B", title: "b", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e", prod_verified: false },
    ],
  });
  const pGood = assertManifestIntegrity("z.json", good);
  if (pGood.length) failures.push(`good manifest failed: ${pGood.join("; ")}`);

  // sync must NOT flip prod_verified true
  const withFalse = syncManifestCounts({
    module: "w",
    complete: false,
    items: [{ id: "A", title: "a", layers: ["DOD-A"], spec: "s", status: "PASS", evidence: "e" }],
  });
  if (withFalse.items[0].prod_verified !== false) {
    failures.push("sync must default prod_verified:false, never true");
  }
  const keepTrue = syncManifestCounts({
    module: "w2",
    complete: false,
    items: [
      {
        id: "A",
        title: "a",
        layers: ["DOD-A"],
        spec: "s",
        status: "PASS",
        evidence: "e",
        prod_verified: true,
      },
    ],
  });
  if (keepTrue.items[0].prod_verified !== true) {
    failures.push("sync must preserve existing prod_verified:true");
  }

  if (failures.length) {
    console.error(`${LABEL}: SELFTEST FAIL`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest OK`);
}

function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  if (WRITE) {
    writeSynced();
  }
  const problems = [];
  for (const { file, data } of loadManifests(DIR)) {
    problems.push(...assertManifestIntegrity(file, data));
  }
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.length} integrity defect(s)`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(`${LABEL}: fix with: node scripts/verify-module-manifest-integrity.mjs --write`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — all manifests progress/pass_count/total_count agree with items[]`);
}

main();
