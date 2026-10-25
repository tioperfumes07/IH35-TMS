#!/usr/bin/env node
/**
 * GUARD — NO UUID-SLICE FALLBACKS IN ENTITY LABEL CONTEXTS (FINAL-3 row 19).
 *
 * Rule: every entity-identity display must use entityLabel() (lib/entity-label.ts), never a raw
 * id.slice(0, 8) / _id.slice(0, 8) truncation that gives operators eight meaningless hex chars.
 * Eight hex characters identify nothing, are not searchable, and two records can look alike —
 * see the entityLabel() docblock for the full rationale.
 *
 * Measured 2026-10-25: 10 occurrences in 10 files → 0 after conversion.
 * Shrink-only (zero is the floor). Baseline holds only the intentional audit-ID preview.
 *
 * Run: node scripts/verify-no-uuid-slice-entity-label.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const LABEL = "verify-no-uuid-slice-entity-label";

/**
 * Files allowed to contain id-slice patterns (shrink-only — nothing is ever added).
 * Each entry is a repo-relative path under apps/frontend/src.
 */
const BASELINE = new Set([
  // bulk_call_id preview — intentionally abbreviated (not an entity name; entityLabel would emit
  // "Record — not visible" on every row because there is never a human name to resolve).
  // Documented in AuditEventsList.tsx comment at the call site.
  "pages/audit/AuditEventsList.tsx",
]);

/** Matches .id.slice(0,8), _id.slice(0,8), or bare `id.slice(0,8)` in code (not comments). */
const UUID_SLICE_RE = /(?:\.id|_id|\bid)\.slice\(0,\s*8\)/;

export function analyse(files) {
  const problems = [];
  for (const [rel, src] of files) {
    if (/\.test\.|__tests__/.test(rel)) continue;
    // Strip line comments so `// old: id.slice(0,8)` doesn't fire.
    const noLineComments = src.replace(/\/\/[^\n]*/g, "");
    if (!UUID_SLICE_RE.test(noLineComments)) continue;
    if (BASELINE.has(rel)) continue;
    // Find line number of first match for a useful error message.
    const lines = noLineComments.split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (UUID_SLICE_RE.test(lines[i])) {
        problems.push(
          `${rel}:${i + 1} — raw id.slice(0,8) UUID truncation; use entityLabel(name, id, "Noun") instead`,
        );
        break;
      }
    }
  }
  return problems;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(e.name))
      acc.push([path.relative(SRC, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8")]);
  }
  return acc;
}

function selftest() {
  const T = [];
  const t = (n, f) => {
    try {
      f();
      T.push([n, true]);
    } catch (e) {
      T.push([n, false, e.message]);
    }
  };

  t("raw .id.slice(0, 8) in TSX FAILS", () => {
    const r = analyse([["pages/foo/A.tsx", 'label={row.display_id ?? row.id.slice(0, 8)}']]);
    if (!r.length) throw new Error("should have failed");
  });
  t("raw _id.slice(0, 8) FAILS", () => {
    const r = analyse([["pages/foo/A.tsx", 'label={data.vendor_id.slice(0, 8)}']]);
    if (!r.length) throw new Error("should have failed");
  });
  t("bare id.slice(0, 8) FAILS", () => {
    const r = analyse([["pages/foo/A.tsx", 'const label = id.slice(0, 8);']]);
    if (!r.length) throw new Error("should have failed");
  });
  t("entityLabel usage PASSES", () => {
    const r = analyse([["pages/foo/A.tsx", 'label={entityLabel(row.display_id, row.id, "Load")}']]);
    if (r.length) throw new Error(r.join("|"));
  });
  t("array slice (not id) PASSES", () => {
    const r = analyse([["pages/foo/A.tsx", "const top = costs.slice(0, 8);"]]);
    if (r.length) throw new Error(r.join("|"));
  });
  t("date string slice PASSES", () => {
    const r = analyse([["pages/foo/A.tsx", 'const day = today.slice(0, 8);']]);
    if (r.length) throw new Error(r.join("|"));
  });
  t("line-comment occurrence PASSES", () => {
    const r = analyse([["pages/foo/A.tsx", "// old: id.slice(0, 8) was here"]]);
    if (r.length) throw new Error(r.join("|"));
  });
  t("test file PASSES", () => {
    const r = analyse([["pages/foo/A.test.tsx", 'label={row.id.slice(0, 8)}']]);
    if (r.length) throw new Error(r.join("|"));
  });
  t("baselined audit file PASSES", () => {
    const r = analyse([["pages/audit/AuditEventsList.tsx", 'return id.slice(0, 8);']]);
    if (r.length) throw new Error(r.join("|"));
  });

  const bad = T.filter((x) => !x[1]);
  for (const [n, ok, e] of T) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${e ? " — " + e : ""}`);
  console.log(`${LABEL} --selftest ${bad.length ? "FAIL" : "PASS"} ${T.length - bad.length}/${T.length}`);
  process.exit(bad.length ? 1 : 0);
}

const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;
if (!IS_MAIN) {
  /* imported as library */
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const problems = analyse(walk(SRC));
  console.log(`${LABEL}: scanning ${SRC}`);
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length}:\n  - ${problems.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK`);
}
