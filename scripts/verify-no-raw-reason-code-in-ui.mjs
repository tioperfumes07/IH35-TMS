#!/usr/bin/env node
/**
 * A raw internal reason code must not be rendered to the operator as an explanation.
 *
 * Seen live on prod 2026-07-29: Home under USMCA read
 *   "FACTORING BALANCE — Unverifiable · Factoring balance unverifiable: faro_contract_entity_mismatch"
 *
 * Two things were wrong at once. The snake_case reason code is a diagnostic identifier, not a sentence
 * an owner can act on. And the state it described was not a fault at all — per the owner's ruling,
 * USMCA has no Faro contract and IH 35 Trucking does not factor, so two of the three entities hit that
 * branch permanently, by design. "Unverifiable" claimed the system could not compute something it was
 * never asked to compute.
 *
 * QuickBooks and NetSuite both distinguish "not configured for this entity" from "we could not compute
 * this". So must we.
 *
 * SCOPE: only snake_case identifiers interpolated directly into user-visible copy. Passing a reason
 * code through an API payload, logging it, or branching on it are all untouched — the code is useful,
 * it just is not prose.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = join(process.cwd(), "apps", "frontend", "src");

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name) && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .map((l) => {
      const i = l.indexOf("//");
      return i === -1 ? l : l.slice(0, i);
    })
    .join("\n");
}

/**
 * A template literal that renders a *_reason / *_code field straight into a sentence, e.g.
 *   `Factoring balance ${fb.status}: ${fb.unverifiable_reason}`
 */
export function rawReasonRenders(src) {
  const clean = stripComments(src);
  const out = [];
  // `reason_code` is EXCLUDED on purpose. In this codebase it names a CATALOG value the operator
  // themselves selected — a cancellation reason, an internal-fine reason — and showing it is correct;
  // it is their own data, not a diagnostic. Including it produced 2 false positives (CancelLoadModal,
  // InternalFinesPage) on the first run. Only fields that carry an INTERNAL failure explanation are
  // flagged.
  // Match each ${...} expression, then flag only those that render the field RAW. An expression that
  // passes it through a mapper (unverifiableReasonText(...)) is exactly the fix, not the defect —
  // flagging it too would make the guard unsatisfiable.
  const re = /\$\{([^}]*\b\w*(?:unverifiable_reason|error_code|failure_reason)\b[^}]*)\}/g;
  for (const m of clean.matchAll(re)) {
    const expr = m[1];
    if (/\b(?:unverifiableReasonText|reasonText|humanize\w*)\s*\(/.test(expr)) continue;
    out.push(m[0].replace(/\s+/g, " ").slice(0, 150));
  }
  return out;
}

function selftest() {
  const cases = [
    { name: "reason code interpolated into copy is caught",
      src: 'const t = `Factoring balance ${fb.status}: ${fb.unverifiable_reason}`;', expect: 1 },
    { name: "written sentence passes",
      src: 'const t = "This entity has no factoring contract";', expect: 0 },
    { name: "a catalog reason_code the operator picked is NOT flagged",
      src: 'const t = `${String(reason.reason_code)} · Owner approval`;', expect: 0 },
    { name: "a MAPPED render passes",
      src: 'const t = `Balance: ${unverifiableReasonText(fb.unverifiable_reason)}`;', expect: 0 },
    { name: "branching on the code is untouched",
      src: 'if (fb.unverifiable_reason === "faro_contract_entity_mismatch") return true;', expect: 0 },
    { name: "comment describing the defect does not trip it",
      src: '// was `x: ${fb.unverifiable_reason}`\nconst t = "ok";', expect: 0 },
  ];
  let bad = 0;
  for (const c of cases) {
    const got = rawReasonRenders(c.src).length;
    if (got !== c.expect) { console.error(`  selftest FAIL — ${c.name}: expected ${c.expect}, got ${got}`); bad++; }
    else console.log(`  selftest OK — ${c.name}`);
  }
  if (bad) { console.error(`SELFTEST FAIL — ${bad}/${cases.length}`); process.exit(1); }
  console.log(`verify-no-raw-reason-code-in-ui SELFTEST OK — ${cases.length}/${cases.length}`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const files = walk(SRC);
  if (files.length === 0) {
    console.error("verify-no-raw-reason-code-in-ui FAIL — scanned 0 files; refusing to report green");
    process.exit(1);
  }
  const violations = [];
  for (const p of files) {
    for (const h of rawReasonRenders(readFileSync(p, "utf8"))) {
      violations.push({ p: p.replace(process.cwd() + "/", ""), h });
    }
  }
  if (violations.length) {
    console.error(`verify-no-raw-reason-code-in-ui FAIL — ${violations.length} raw reason code(s) rendered as copy:`);
    for (const v of violations) console.error(`\n  ${v.p}\n    ${v.h}`);
    console.error("\nA snake_case reason code is a diagnostic, not an explanation. Map it to a written");
    console.error("sentence, and check first whether the state is an expected one rather than a fault.");
    process.exit(1);
  }
  console.log(`verify-no-raw-reason-code-in-ui OK — ${files.length} files scanned, no raw reason code rendered as copy`);
}

main();
