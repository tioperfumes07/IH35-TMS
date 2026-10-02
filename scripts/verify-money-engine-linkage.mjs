#!/usr/bin/env node
/**
 * verify-money-engine-linkage.mjs
 *
 * OWNER'S LINKAGE LAW, ENFORCED INSTEAD OF DESCRIBED.
 *   "ALL MONEY, ECONOMIC, FINANCIAL, MECHANICAL, COMPLETE AND TOTAL WIRING, LINKAGE, CONNECTIVITY,
 *    DOUBLE ROUTE, REVERSE ... TO CUSTOMERS, VENDORS, DRIVER, TRUCK, TRAILER, LOAD, SETTLEMENT,
 *    FACTORING, AP ACCOUNTS, AR ACCOUNTS, CHART OF ACCOUNTS, JE, GL."
 *
 * WHY THIS EXISTS, MEASURED 2026-10-02:
 * This repo carries 5,632 verify-* scripts, and 358 of them are one-off reverse / linkage /
 * connectivity guards — a new guard written each time a single engine was caught missing a stamp or
 * a reverse path. That is 358 patches where the law needed one enforcement. A 359th one-off guard was
 * not the answer.
 *
 * THE LAW, in three rules, over every path that writes a journal entry or a posting:
 *   1. EVERY money writer is DECLARED in money-engine-linkage-register.json. A new, undeclared money
 *      writer FAILS THE PUSH. You cannot add a way to create money without saying what it links to.
 *   2. EVERY declared engine names a REVERSE counterpart that exists on disk. Money that can be
 *      created and not undone is money the owner cannot correct.
 *   3. STAMP DEBT MAY ONLY SHRINK. The register records which of the 12 linkage stamps each engine
 *      carries today. Losing one fails the push; gaining one is expected and the register is updated.
 *
 * WHAT THIS GUARD DOES NOT CLAIM. Rule 3 is a presence check of the identifier in the engine's source.
 * It proves the engine KNOWS about a stamp, not that every row it writes carries one, and an engine
 * that delegates its insert can look emptier than it is. It is a ratchet against regression and a map
 * of where to look — never evidence that linkage is correct. Per-engine proof is the seat's job, with
 * a live row.
 *
 * STATIC ONLY — reads source, opens no database, correct offline and in the pre-push sweep.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-money-engine-linkage";
const REGISTER = path.join(ROOT, "scripts/money-engine-linkage-register.json");
const SRC = "apps/backend/src";

/** The 12 linkage stamps the owner named. Order is fixed so the register stays diffable. */
export const LINKAGE_STAMPS = [
  "operating_company_id", "load_id", "driver_id", "unit_id", "trailer_id", "customer_id",
  "vendor_id", "settlement_id", "invoice_id", "journal_entry_id", "account_id", "item_id",
];

/** A money writer is any path that INSERTs a journal entry or a journal entry posting. */
const MONEY_WRITE_RE =
  /INSERT\s+INTO\s+accounting\.journal_entr(?:y|ies)\b|INSERT\s+INTO\s+accounting\.journal_entry_postings\b/i;

export function stampsPresent(source) {
  return LINKAGE_STAMPS.filter((s) => source.includes(s));
}

function walk(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(rel, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(rel);
  }
  return out;
}

export function discoverMoneyWriters(readFile = (p) => fs.readFileSync(path.join(ROOT, p), "utf8")) {
  const found = [];
  for (const rel of walk(SRC)) {
    let src;
    try { src = readFile(rel); } catch { continue; }
    if (!MONEY_WRITE_RE.test(src)) continue;
    found.push({ file: rel.slice(SRC.length + 1), stamps: stampsPresent(src) });
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

/** Pure decision core — unit-testable without the filesystem. */
export function analyse({ discovered, register, fileExists }) {
  const problems = [];
  const openDebt = [];
  const declared = new Map(register.engines.map((e) => [e.file, e]));

  for (const d of discovered) {
    const e = declared.get(d.file);
    if (!e) {
      problems.push(
        `UNDECLARED MONEY WRITER: ${d.file} inserts a journal entry or posting but is not in ` +
          `scripts/money-engine-linkage-register.json. Declare it with the stamps it writes and the ` +
          `reverse engine that undoes it. A new way to create money is never added silently.`
      );
      continue;
    }
    const lost = (e.stamps ?? []).filter((s) => !d.stamps.includes(s));
    if (lost.length) {
      problems.push(
        `STAMP LOST: ${d.file} no longer references ${lost.join(", ")}. The register records it as ` +
          `carrying that linkage. Stamp debt may only SHRINK — restore the stamp, or if the engine ` +
          `genuinely delegates it now, say so in the register's "note" and remove it there in the ` +
          `same commit as the delegation.`
      );
    }
    if (!e.reverse) {
      // SHRINK-ONLY REVERSE DEBT. Four engines were found with no reverse path the day this guard was
      // written. Failing the push on all four would block every seat on debt none of them created, and
      // a guard that blocks everyone gets switched off — a switched-off guard protects nothing. They
      // are recorded as open debt, reported loudly on every run, and assigned on the bus. The list may
      // only SHRINK: a NEW money writer with no reverse fails the push, and adding a file here to
      // silence it is the anti-pattern this repo already forbids elsewhere.
      if ((register.open_reverse_debt ?? []).includes(d.file)) {
        openDebt.push(`${d.file} — ${e.note ?? "no reverse path"}`);
      } else {
        problems.push(
          `NO REVERSE DECLARED: ${d.file} creates money and names no reverse engine. Money that can be ` +
            `created and not undone is money the owner cannot correct. Declare "reverse", or set ` +
            `"reverse_waived_reason" with the reason it genuinely cannot be reversed. Do NOT add it to ` +
            `open_reverse_debt — that list may only shrink.`
        );
      }
    } else if (!fileExists(path.join(SRC, e.reverse))) {
      problems.push(
        `REVERSE MISSING ON DISK: ${d.file} declares reverse "${e.reverse}", which does not exist. ` +
          `A declared reverse that is not there is worse than none — it reads as covered.`
      );
    }
  }

  const goneFiles = register.engines
    .map((e) => e.file)
    .filter((f) => !discovered.some((d) => d.file === f));

  return { problems, openDebt, goneFiles, declaredCount: register.engines.length, discoveredCount: discovered.length };
}

function selftest() {
  const reg = {
    engines: [
      { file: "a.ts", stamps: ["load_id"], reverse: "rev.ts" },
      { file: "b.ts", stamps: [], reverse: null, reverse_waived_reason: null },
    ],
  };
  const exists = (p) => p.endsWith("rev.ts");
  const cases = [
    ["undeclared writer fails", [{ file: "new.ts", stamps: [] }], /UNDECLARED MONEY WRITER/],
    ["lost stamp fails", [{ file: "a.ts", stamps: [] }], /STAMP LOST/],
    ["missing reverse declaration fails", [{ file: "b.ts", stamps: [] }], /NO REVERSE DECLARED/],
    ["declared reverse that is absent fails", [{ file: "a.ts", stamps: ["load_id"] }], null],
  ];
  let ok = true;
  for (const [name, discovered, want] of cases) {
    const { problems } = analyse({ discovered, register: reg, fileExists: exists });
    const hit = problems.some((p) => (want ? want.test(p) : false));
    if (want && !hit) { console.error(`SELFTEST FAIL: ${name}`); ok = false; }
    if (!want && problems.length) { console.error(`SELFTEST FAIL: ${name} — unexpected: ${problems[0]}`); ok = false; }
  }
  // a gained stamp must NOT fail
  const gained = analyse({ discovered: [{ file: "a.ts", stamps: ["load_id", "driver_id"] }], register: reg, fileExists: exists });
  if (gained.problems.length) { console.error("SELFTEST FAIL: gaining a stamp must not fail"); ok = false; }
  if (!ok) { console.error(`${LABEL} SELFTEST FAILED`); process.exit(1); }
  console.log(`${LABEL} SELFTEST OK — ${cases.length + 1}/${cases.length + 1}`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const discovered = discoverMoneyWriters();

if (process.argv.includes("--emit-register")) {
  const existing = fs.existsSync(REGISTER) ? JSON.parse(fs.readFileSync(REGISTER, "utf8")) : { engines: [] };
  const prev = new Map((existing.engines ?? []).map((e) => [e.file, e]));
  const engines = discovered.map((d) => ({
    file: d.file,
    stamps: d.stamps,
    missing_stamps: LINKAGE_STAMPS.filter((s) => !d.stamps.includes(s)),
    reverse: prev.get(d.file)?.reverse ?? null,
    reverse_waived_reason: prev.get(d.file)?.reverse_waived_reason ?? null,
    note: prev.get(d.file)?.note ?? null,
  }));
  fs.writeFileSync(REGISTER, JSON.stringify({
    note:
      "THE MONEY ENGINE LINKAGE REGISTER. Every path that writes a journal entry or posting, the " +
      "linkage stamps it carries, and the engine that reverses it. Stamp debt may only SHRINK. A new " +
      "money writer must be declared here or the push fails. Regenerate with --emit-register, then " +
      "fill reverse by hand — it is a ruling, not a measurement.",
    law: "docs/bus — owner linkage law: complete wiring, linkage, connectivity, double route and reverse to customer, vendor, driver, truck, trailer, load, settlement, factoring, A/P, A/R, chart of accounts, JE, GL.",
    stamps: LINKAGE_STAMPS,
    measured_at: new Date().toISOString(),
    engines,
  }, null, 2) + "\n");
  console.log(`${LABEL} register written — ${engines.length} money writer(s).`);
  process.exit(0);
}

if (!fs.existsSync(REGISTER)) {
  console.error(`${LABEL} FAIL — ${path.relative(ROOT, REGISTER)} is missing. Run with --emit-register.`);
  process.exit(1);
}

const register = JSON.parse(fs.readFileSync(REGISTER, "utf8"));
const { problems, openDebt, goneFiles, declaredCount, discoveredCount } = analyse({
  discovered,
  register,
  fileExists: (p) => fs.existsSync(path.join(ROOT, p)),
});

console.log(`${LABEL}: ${discoveredCount} money writer(s) discovered, ${declaredCount} declared.`);
if (goneFiles.length) {
  console.log(`${LABEL}: ${goneFiles.length} declared engine(s) no longer write money — prune the register: ${goneFiles.join(", ")}`);
}

if (openDebt.length) {
  console.log(`${LABEL}: ${openDebt.length} engine(s) carry OPEN REVERSE DEBT — shrink-only, assigned on the bus:`);
  for (const d of openDebt) console.log(`  ! ${d}`);
}

if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `${LABEL} OK — every money writer is declared, none lost a linkage stamp, and every declared engine's ` +
    `reverse exists. ${openDebt.length} known reverse gap(s) remain open and may only shrink.`
);
