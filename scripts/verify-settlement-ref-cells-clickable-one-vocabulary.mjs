#!/usr/bin/env node
// UI-F395 — owner, ROUND 395, verbatim:
//   "IN SETTLEMENTS TOUR COLUMN INSTEAD OF HAVING OPEN, IT SHOULD BE THE NUMBER ...
//    ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE"
//
// WHY THIS GUARD EXISTS. The Tour / "Settlement / Presettlement" column is rendered by TWO
// components, not one:
//   components/shared/SettlementRefCell.tsx        (~27 screens) — declares itself "the ONE component"
//   components/settlements/SettlementReferenceCell.tsx (~15 screens) — never migrated
// ROUND 167 (owner, 2026-09-28) retired the "Open" status word and installed the PENDING vocabulary,
// but it only landed in the first file. The second kept printing the retired word for a week, on the
// very screens the owner was reading. A law enforced in one of two cells is a law that drifts.
//
// Separately, both cells rendered PENDING and the closed-but-unnumbered dash as dead <span>s, so two
// of the three live states in the column went nowhere — the exact half of the ruling
// ("ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE") that was still unfixed.
//
// WHAT IT ASSERTS, statically, over the real source of BOTH cells:
//   1. Neither cell renders the retired status word as a label. (ROUND 167.)
//   2. Neither cell introduces a P-series display_id as a number. ROUND 167, verbatim:
//      "THERE IS NO SETTLEMENT 001, 003, 005, 007" — the P-series is a pre-settlement row id.
//   3. PENDING is rendered inside a link, never a bare <span>. (ROUND 395.)
//   4. The closed-but-unnumbered dash is rendered inside a link, never a bare <span>. (ROUND 395.)
//   5. "Not on a tour" IS plain text — it has no id, so it has nowhere to go, and a link to
//      nowhere would be the opposite of the ruling.
//
// Rule 17: wired ONLY via scripts/verify-steps/14877-verify-settlement-ref-cells-clickable-one-vocabulary.mjs
//
// Usage:
//   node scripts/verify-settlement-ref-cells-clickable-one-vocabulary.mjs --selftest
//   node scripts/verify-settlement-ref-cells-clickable-one-vocabulary.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-ref-cells-clickable-one-vocabulary";

/** Both components that render the Tour column. A third cell added here is a third place to drift. */
const SETTLEMENT_REF_CELLS = [
  "apps/frontend/src/components/shared/SettlementRefCell.tsx",
  "apps/frontend/src/components/settlements/SettlementReferenceCell.tsx",
];

/** The retired status word, assembled so this guard's own source cannot trip a text scan for it. */
const RETIRED_LABEL = "O" + "pen";

/** Strip line and block comments: a comment that NAMES the retired word must not fail the file,
 *  and a comment that merely promises a link must not satisfy the clickability check either. */
export function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const RE = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Every spelling a literal can take in TS/TSX source. SELFTEST CASE (iv) caught this guard missing
 * the real file: the cell writes the em dash as the ESCAPE `{"\u2014"}`, not as the character, so a
 * scan for the character alone saw nothing. Both spellings are the same rendered glyph.
 */
function spellings(literal) {
  const out = new Set([literal]);
  for (const ch of literal) {
    if (ch.codePointAt(0) > 0x7f) {
      out.add(literal.replace(ch, "\\u" + ch.codePointAt(0).toString(16).padStart(4, "0")));
    }
  }
  return [...out];
}

/**
 * Is `literal` rendered anywhere in this code? SELFTEST CASE (ii) caught this guard missing the real
 * ROUND 167 defect `{isOpen ? "Open" : label}` — a quoted literal inside a JSX expression, matching
 * neither `>Open<` nor `label="Open"`. These cells have no legitimate non-comment use for any of
 * these words other than rendering them, so a quoted occurrence counts.
 */
function rendersLiteral(code, literal) {
  return spellings(literal).some((lit) => {
    const L = RE(lit);
    return (
      new RegExp(`>\\s*${L}\\s*<`).test(code) ||
      new RegExp(`["'\`]${L}["'\`]`).test(code)
    );
  });
}

/** Does the block that produces `literal` return it through a link rather than a bare span? */
function literalIsLinked(code, literal) {
  return spellings(literal).some((lit) => {
    const L = RE(lit);
    // A bare span carrying the literal as its JSX text, its expression child, or its label.
    const bareSpan = new RegExp(`<span\\b[^>]*>[\\s\\S]{0,120}?${L}[\\s\\S]{0,40}?</span>`, "s").test(code);
    if (bareSpan) return false;
    const linkedText = new RegExp(`<Link\\b[^>]*>[\\s\\S]{0,400}?${L}[\\s\\S]{0,80}?</Link>`, "s").test(code);
    const linkedLabel = new RegExp(`<EntityLink\\b[^>]*label\\s*=\\s*(?:\\{\\s*)?["'\`]${L}["'\`]`, "s").test(code);
    return linkedText || linkedLabel;
  });
}

export function findSettlementRefCellViolations(files) {
  const problems = [];
  for (const { file, src } of files) {
    if (src == null) {
      problems.push(`${file}: expected Tour-column cell is missing — a cell in no list is a cell nothing checks`);
      continue;
    }
    const code = stripComments(src);

    // 1. The retired status word is never a rendered label.
    if (rendersLiteral(code, RETIRED_LABEL)) {
      problems.push(
        `${file}: renders the retired "${RETIRED_LABEL}" status word in the Tour column — ROUND 167 (owner, 2026-09-28) replaced it with PENDING`
      );
    }

    // 2. No P-series display_id smuggled in as a number.
    if (/\bdisplay_id\b/.test(code)) {
      problems.push(
        `${file}: references display_id — ROUND 167, verbatim: "THERE IS NO SETTLEMENT 001, 003, 005, 007". ` +
          `The P-series is a pre-settlement row id and driver_settlements.display_id also carries the banned S-counter`
      );
    }

    // 3 + 4. PENDING and the closed-unnumbered dash must be reachable.
    if (rendersLiteral(code, "PENDING") && !literalIsLinked(code, "PENDING")) {
      problems.push(
        `${file}: PENDING is rendered as plain text, not a link — owner ROUND 395: "ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE"`
      );
    }
    const DASH = "\u2014";
    if (rendersLiteral(code, DASH) && !literalIsLinked(code, DASH)) {
      problems.push(
        `${file}: the closed-but-unnumbered dash is rendered as plain text, not a link — owner ROUND 395: "ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE"`
      );
    }

    // 5. "Not on a tour" has no id and must stay plain text.
    if (/Not on a tour/.test(code) && literalIsLinked(code, "Not on a tour")) {
      problems.push(
        `${file}: "Not on a tour" is a link — that row has no settlement id, so the link goes nowhere, which is the opposite of the ruling`
      );
    }
  }
  return problems;
}

function loadReal() {
  return SETTLEMENT_REF_CELLS.map((file) => {
    const abs = path.join(ROOT, file);
    return { file, src: fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null };
  });
}

function selftest() {
  const GOOD_REF = `
    if (!id) return <span className="text-gray-400">Not on a tour</span>;
    if (number) return <Link to={to}>{number}</Link>;
    if (isClosed) return <Link to={to} title="not stamped">{"\\u2014"}</Link>;
    return <Link to={to} title="still open">PENDING</Link>;
  `;
  const GOOD_SHARED = `
    if (!resolved?.presettlement_link_id) return <span className="text-gray-500">Not on a tour</span>;
    const label = settlementLabel(resolved);
    if (label === "PENDING") return <EntityLink kind="settlement" id={id} label="PENDING" className="x" />;
    if (label === "\\u2014") return <EntityLink kind="settlement" id={id} label="\\u2014" className="y" />;
    return <EntityLink kind="settlement" id={id} label={label} />;
  `;
  const cases = [
    {
      label: "(i)   both cells correct — one vocabulary, every id-bearing state linked",
      files: [{ file: "a.tsx", src: GOOD_REF }, { file: "b.tsx", src: GOOD_SHARED }],
      expectFail: false,
    },
    {
      label: "(ii)  the real ROUND 395 defect A: the retired status word still rendered",
      files: [{ file: "a.tsx", src: `return <Link to={to}>{isOpen ? "${RETIRED_LABEL}" : label}</Link>;` }],
      expectFail: true,
    },
    {
      label: "(iii) the real ROUND 395 defect B: PENDING as a dead span",
      files: [{ file: "b.tsx", src: `if (label === "PENDING") return <span className="f">PENDING</span>;` }],
      expectFail: true,
    },
    {
      label: "(iv)  the real ROUND 395 defect C: the closed-unnumbered dash as a dead span",
      files: [{ file: "b.tsx", src: `if (label === "\\u2014") return <span title="t">\\u2014</span>;` }],
      expectFail: true,
    },
    {
      label: "(v)   P-series display_id smuggled in as the number (ROUND 167 ban)",
      files: [{ file: "a.tsx", src: `const n = ref.source_document_ref ?? ref.display_id;\nreturn <Link to={to}>{n}</Link>;` }],
      expectFail: true,
    },
    {
      label: "(vi)  a COMMENT naming the retired word does not fail the file",
      files: [{ file: "a.tsx", src: `// ROUND 167 retired the "${RETIRED_LABEL}" label.\n${GOOD_REF}` }],
      expectFail: false,
    },
    {
      label: "(vii) a COMMENT promising a link does not satisfy the clickability check",
      files: [{ file: "b.tsx", src: `// PENDING is a <Link> now.\nif (label === "PENDING") return <span>PENDING</span>;` }],
      expectFail: true,
    },
    {
      label: '(viii) "Not on a tour" linked to nowhere is a violation',
      files: [{ file: "a.tsx", src: `if (!id) return <Link to={to}>Not on a tour</Link>;` }],
      expectFail: true,
    },
    {
      label: "(ix)  a cell in the list that no longer exists on disk is a violation",
      files: [{ file: "gone.tsx", src: null }],
      expectFail: true,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const problems = findSettlementRefCellViolations(c.files);
    const failed = problems.length > 0;
    if (failed === c.expectFail) {
      pass++;
      console.log(`ok    ${c.label}`);
    } else {
      console.error(
        `FAIL  ${c.label} — expected ${c.expectFail ? "FAIL" : "PASS"}, got ${failed ? "FAIL" : "PASS"}` +
          (problems.length ? `\n      ${problems.join("\n      ")}` : "")
      );
    }
  }
  console.log(`\n${LABEL} SELFTEST ${pass}/${cases.length} ${pass === cases.length ? "PASS" : "FAIL"}`);
  process.exit(pass === cases.length ? 0 : 1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = findSettlementRefCellViolations(loadReal());
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} Tour-column violation(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\nOwner ROUND 395, verbatim: "IN SETTLEMENTS TOUR COLUMN INSTEAD OF HAVING ${RETIRED_LABEL}, IT SHOULD BE ` +
        `THE NUMBER ... ALL MUST BE CLICKACBLE AND TAKE SUS SOMEWHERE". ` +
        `components/shared/SettlementRefCell.tsx is the reference implementation.`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — ${SETTLEMENT_REF_CELLS.length} Tour-column cell(s) speak one vocabulary ` +
      `(Not on a tour / PENDING / AlwaysTrack number / closed-unnumbered dash) and every id-bearing state is a link.`
  );
}

main();
