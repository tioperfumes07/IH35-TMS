#!/usr/bin/env node
// KPI-TILE-COLOR LAW — owner ruling 2026-09-04, verbatim:
//   "for all kpis i want different color not just white background a light color to distinguish
//    and darker border"
//
// WHY THIS GUARD EXISTS. The ruling is a month old. design/tokens.ts has carried kpiTileBg
// ("#F4F7FA") and kpiTileBorder ("#C7D2DC") since it was made, and components/layout/DrillKpiCard.tsx
// paints from them correctly. But components/shared/LedgerKpiPanel.tsx — the panel behind EVERY
// Banking and Factoring KPI — was still `bg-white border-slate-200`. A white tile on a white page.
// The owner reported it twice as "the visuals still look like shit", and the Lead's own first fix to
// that panel (ROUND 392) restored its typography and STILL left the white background in place.
//
// A ruling that lives only in a token file nothing imports is not enforced. This is the enforcement.
//
// WHAT IT ASSERTS. Every component that renders a KPI tile paints its background and border from the
// tokens, and never from a hardcoded white/grey Tailwind pair. Checked statically, by reading the
// source — not by trusting a comment that says it complies.
//
// Rule 17: wired ONLY via scripts/verify-steps/14633-verify-kpi-tiles-obey-tile-color-law.mjs
//
// Usage:
//   node scripts/verify-kpi-tiles-obey-tile-color-law.mjs --selftest
//   node scripts/verify-kpi-tiles-obey-tile-color-law.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kpi-tiles-obey-tile-color-law";

/**
 * The components that render a KPI tile. Each must paint from the tokens.
 * Add a file here when a new KPI surface is built — a KPI tile that is in no list is a KPI tile
 * nothing checks, which is how LedgerKpiPanel drifted for a month.
 */
const KPI_TILE_COMPONENTS = [
  "apps/frontend/src/components/shared/LedgerKpiPanel.tsx",
  "apps/frontend/src/components/layout/DrillKpiCard.tsx",
];

/** Strip line and block comments so a comment that merely MENTIONS the token cannot satisfy this. */
export function stripComments(src) {
  return String(src ?? "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Pure core.
 * @param {Record<string,string>} files relPath -> source
 * @returns {string[]} problems
 */
export function findTileColorViolations(files) {
  const problems = [];
  for (const [rel, raw] of Object.entries(files)) {
    const src = stripComments(raw);

    // (a) must paint from the tokens
    const paintsBg = /kpiTileBg\b/.test(src);
    const paintsBorder = /kpiTileBorder\b/.test(src);
    if (!paintsBg || !paintsBorder) {
      problems.push(
        `${rel}: renders a KPI tile but does not paint from the tokens ` +
          `(${paintsBg ? "" : "kpiTileBg missing"}${!paintsBg && !paintsBorder ? ", " : ""}` +
          `${paintsBorder ? "" : "kpiTileBorder missing"}). ` +
          `KPI-TILE-COLOR LAW: a light background to distinguish and a darker border, from design/tokens.ts.`
      );
    }

    // (b) must not hardcode a white TILE — and only a tile.
    //     Scoped to <button> elements on purpose, and this precision was measured, not assumed: the
    //     first version of this guard flagged the panel's own <section> container and its error box,
    //     which are CORRECTLY white. A white container is what makes a tinted tile stand out; if the
    //     container were also kpiTileBg the tiles would disappear into it, which is the defect
    //     inverted. The tile is the clickable element — a <button> — so that is what is checked. A
    //     guard that reddens on correct code burns trust exactly as fast as one that misses.
    const buttonTags = src.match(/<button\b[\s\S]*?>/g) ?? [];
    const whiteTile = buttonTags.some(
      (tag) =>
        /className="[^"]*\bbg-white\b[^"]*"/.test(tag) &&
        /className="[^"]*\bborder-(?:slate|gray)-\d{3}\b[^"]*"/.test(tag)
    );
    if (whiteTile) {
      problems.push(
        `${rel}: a hardcoded white-tile pair (bg-white + border-slate/gray-NNN on one element) is ` +
          `still present. That is the violation the owner reported — a white tile on a white page. ` +
          `Paint from colors.kpiTileBg / colors.kpiTileBorder instead.`
      );
    }
  }
  return problems;
}

function loadReal() {
  const files = {};
  for (const rel of KPI_TILE_COMPONENTS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      console.error(`${LABEL} FAIL — declared KPI tile component is missing: ${rel}`);
      process.exit(1);
    }
    files[rel] = fs.readFileSync(abs, "utf8");
  }
  return files;
}

function selftest() {
  const cases = [
    {
      label: "(i) tile painted from both tokens -> PASS",
      files: { "a.tsx": `const s = { backgroundColor: colors.kpiTileBg, borderColor: colors.kpiTileBorder };` },
      expectFail: false,
    },
    {
      label: "(ii) tile with no tokens at all -> FAIL",
      files: { "a.tsx": `<button className="rounded-sm border p-2">x</button>` },
      expectFail: true,
    },
    {
      label: "(iii) kpiTileBg only, border missing -> FAIL",
      files: { "a.tsx": `const s = { backgroundColor: colors.kpiTileBg };` },
      expectFail: true,
    },
    {
      label: "(iv) THE REAL DEFECT: hardcoded bg-white + border-slate-200 on the TILE BUTTON -> FAIL",
      files: {
        "a.tsx":
          `const s = { backgroundColor: colors.kpiTileBg, borderColor: colors.kpiTileBorder };\n` +
          `<button className="rounded-sm border border-slate-200 bg-white p-2 text-left">x</button>`,
      },
      expectFail: true,
    },
    {
      // Measured false positive from this guard's own first version — the panel container and its
      // error box are white BY DESIGN, and that is what makes a tinted tile visible.
      label: "(vii) white panel CONTAINER + white error box, tinted tile button -> PASS",
      files: {
        "a.tsx":
          `const s = { backgroundColor: colors.kpiTileBg, borderColor: colors.kpiTileBorder };\n` +
          `<div className="rounded-sm border border-slate-200 bg-white p-3">err</div>\n` +
          `<section className="rounded-sm border border-slate-200 bg-white p-3">\n` +
          `<button className="rounded-sm border p-2 text-left" style={s}>x</button>\n` +
          `</section>`,
      },
      expectFail: false,
    },
    {
      label: "(v) a COMMENT naming the tokens does not satisfy it -> FAIL",
      files: { "a.tsx": `// we paint from colors.kpiTileBg and colors.kpiTileBorder, honest\nconst s = {};` },
      expectFail: true,
    },
    {
      label: "(vi) bg-white on a drill MODAL, no tile border on the same element -> PASS",
      files: {
        "a.tsx":
          `const s = { backgroundColor: colors.kpiTileBg, borderColor: colors.kpiTileBorder };\n` +
          `<div className="bg-white p-3">drill rows</div>`,
      },
      expectFail: false,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const problems = findTileColorViolations(c.files);
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
  const problems = findTileColorViolations(loadReal());
  if (problems.length) {
    console.error(`${LABEL} FAIL — ${problems.length} KPI tile(s) violate the KPI-TILE-COLOR LAW:`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error(
      `\nOwner ruling 2026-09-04, verbatim: "for all kpis i want different color not just white ` +
        `background a light color to distinguish and darker border". The tokens are in ` +
        `apps/frontend/src/design/tokens.ts (kpiTileBg, kpiTileBorder) and ` +
        `components/layout/DrillKpiCard.tsx is the reference implementation.`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — ${KPI_TILE_COMPONENTS.length} KPI tile component(s) paint from ` +
      `colors.kpiTileBg / colors.kpiTileBorder; no hardcoded white-tile pair.`
  );
}

main();
