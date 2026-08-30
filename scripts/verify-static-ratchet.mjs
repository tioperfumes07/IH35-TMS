#!/usr/bin/env node
/** @independent-input origin/main — shrink-only comparison with the committed failing-name set. */
/**
 * GR-1 — verify-static failing-guard NAMES, shrink-only (verify-step 10042).
 * A count baseline is illegal: one guard can be "fixed" while another rots in.
 *
 * status=unseeded → failingNames must be []. Cascade's first seed may set status=seeded + names.
 * After seed: failingNames on this branch must be a subset of origin/main (shrink or equal).
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REL = "docs/audit/VERIFY-STATIC-BASELINE.json";
const LABEL = "verify-static-ratchet";

function loadJson(text, where) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error(`${LABEL}: ${where} is not JSON: ${e.message}`);
  }
  if (data.status !== "unseeded" && data.status !== "seeded") {
    throw new Error(`${LABEL}: ${where} status must be unseeded|seeded`);
  }
  if (!Array.isArray(data.failingNames)) {
    throw new Error(`${LABEL}: ${where} failingNames must be an array of guard filenames`);
  }
  const names = data.failingNames.map(String);
  const sorted = [...names].sort();
  if (names.join("\0") !== sorted.join("\0")) {
    throw new Error(`${LABEL}: ${where} failingNames must be sorted`);
  }
  if (new Set(names).size !== names.length) {
    throw new Error(`${LABEL}: ${where} failingNames has duplicates`);
  }
  if (data.status === "unseeded" && names.length) {
    throw new Error(`${LABEL}: unseeded baseline cannot list names (use status=seeded for Cascade seed)`);
  }
  return { status: data.status, failingNames: names };
}

function gitShowMain() {
  const r = spawnSync("git", ["show", `origin/main:${REL}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return null;
  return r.stdout;
}

function assertShrinkOnly(head, main) {
  if (!main) return;
  if (main.status === "unseeded" && head.status === "seeded") return;
  if (head.status === "unseeded" && main.status === "seeded") {
    throw new Error(`${LABEL}: cannot unseed a seeded baseline`);
  }
  if (main.status === "seeded" && head.status === "seeded") {
    const mainSet = new Set(main.failingNames);
    const extra = head.failingNames.filter((n) => !mainSet.has(n));
    if (extra.length) {
      throw new Error(
        `${LABEL}: baseline GREW (shrink-only). New names: ${extra.slice(0, 20).join(", ")}`,
      );
    }
  }
}

export function extraFailsNotInBaseline(failNames, baseline) {
  if (baseline.status !== "seeded") return [];
  const allow = new Set(baseline.failingNames);
  return failNames.filter((n) => !allow.has(n));
}

export function loadHeadBaseline() {
  return loadJson(fs.readFileSync(path.join(ROOT, REL), "utf8"), REL);
}

function selftest() {
  const okUnseeded = loadJson(
    JSON.stringify({ status: "unseeded", failingNames: [] }),
    "plant-unseeded",
  );
  if (okUnseeded.failingNames.length) throw new Error("selftest unseeded");

  let grew = false;
  try {
    assertShrinkOnly(
      { status: "seeded", failingNames: ["a.mjs", "b.mjs"] },
      { status: "seeded", failingNames: ["a.mjs"] },
    );
  } catch (e) {
    grew = /GREW/.test(String(e?.message ?? e));
  }
  if (!grew) throw new Error(`${LABEL} selftest: growth arm did not throw independently`);

  const extra = extraFailsNotInBaseline(["new-rot.mjs", "known.mjs"], {
    status: "seeded",
    failingNames: ["known.mjs"],
  });
  if (extra.join() !== "new-rot.mjs") {
    throw new Error(`${LABEL} selftest: extra-fail arm did not isolate new-rot.mjs`);
  }

  let unsorted = false;
  try {
    loadJson(JSON.stringify({ status: "seeded", failingNames: ["b.mjs", "a.mjs"] }), "plant-sort");
  } catch (e) {
    unsorted = /sorted/.test(String(e?.message ?? e));
  }
  if (!unsorted) throw new Error(`${LABEL} selftest: unsorted names arm did not throw independently`);

  console.log(`${LABEL} --selftest PASS (growth + extra-fail + sort arms)`);
}

function live() {
  const head = loadJson(fs.readFileSync(path.join(ROOT, REL), "utf8"), REL);
  const mainTxt = gitShowMain();
  const main = mainTxt ? loadJson(mainTxt, `origin/main:${REL}`) : null;
  assertShrinkOnly(head, main);
  console.log(
    `${LABEL}: PASS status=${head.status} names=${head.failingNames.length}` +
      (main ? ` main=${main.status}/${main.failingNames.length}` : " (no origin/main copy yet)"),
  );
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  live();
}
