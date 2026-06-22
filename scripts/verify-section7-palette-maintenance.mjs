// §7 PALETTE GUARD (maintenance views) — CLAUDE.md §7 locks the palette to navy/slate with NO
// blue/purple/pink accent. The IH35-MAINTENANCE-CONSTRUCTION package's #185fa5 accent is superseded
// by §7 (Jorge, 2026-06-21: "§7 governs, not the package"). This guard fails if a forbidden NON-§7
// ACCENT HEX appears in the maintenance view files. (Tailwind class-level blues are cleaned up + guarded
// in a follow-up PR; this guard locks the raw-hex accents, incl. the package's #185fa5.)
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const fail = (m) => { console.error(`FAIL verify-section7-palette-maintenance: ${m}`); process.exit(1); };

const ROOTS = [
  // Per-page module roots that have been §7-cleaned (maintenance #1303+, fleet #1317, dispatch #1319).
  "apps/frontend/src/pages/maintenance",
  "apps/frontend/src/pages/fleet",
  "apps/frontend/src/pages/dispatch",
  // SHARED-COMPONENT ROOT-GAP fix (2026-06-22): the per-module roots above structurally can't catch
  // blues in globally-shared root-level components (Button.tsx tertiary text-blue-600, layout/DataPanel
  // view-all link, lists/ListView batch/filter) — they render blue across EVERY surface incl the
  // already-"cleaned" modules. Scanning the whole components/ tree (subsumes the old per-component
  // roots: maintenance, vehicle-profile, trailer-profile, dispatch) closes the gap for good.
  "apps/frontend/src/components",
];

// Non-§7 accent hexes (blues / indigos / violets / pinks). §7 navy/slate (#1F2A44, #0F1729, #334155,
// #64748B), status red (#A32D2D/#DC2626), amber (#854F0B/#CA8A04), green pill, and grays are allowed.
const FORBIDDEN = [
  "#185fa5", // the package's accent — explicitly superseded by §7
  "#2563eb", "#1d4ed8", "#1e40af", "#3b82f6", "#60a5fa", "#2f80ed",
  "#7c3aed", "#8b5cf6", "#6366f1", "#4f46e5",
  "#ec4899", "#db2777", "#d946ef",
];

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else if (/\.(tsx?|css)$/.test(e)) out.push(full);
  }
  return out;
}

// Tailwind accent classes are §7 drift too — maintenance views use navy/slate only. Forbid any
// blue/indigo/violet/purple/fuchsia/pink/sky/cyan utility class on a color-bearing property.
const FORBIDDEN_CLASS = /\b(bg|text|border|ring|from|to|via|divide|outline|decoration|placeholder|accent|fill|stroke)-(blue|indigo|violet|purple|fuchsia|pink|sky|cyan)-\d{2,3}\b/;

const files = ROOTS.flatMap(walk);
const hits = [];
for (const f of files) {
  const raw = readFileSync(f, "utf8");
  const src = raw.toLowerCase();
  for (const hex of FORBIDDEN) {
    if (src.includes(hex)) hits.push(`${f}: ${hex}`);
  }
  const cls = raw.match(FORBIDDEN_CLASS);
  if (cls) hits.push(`${f}: class ${cls[0]}`);
}

if (hits.length) {
  fail(
    `non-§7 accent hex in maintenance views (use navy/slate tokens — §7 governs, not #185fa5):\n  ` +
      hits.join("\n  ")
  );
}
console.log(`OK verify-section7-palette-maintenance: ${files.length} maintenance files scanned, no non-§7 accent hex or class.`);
