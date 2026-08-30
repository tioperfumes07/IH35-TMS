#!/usr/bin/env node
/**
 * C8 — NO DEAD KPI/STAT CARDS ON PRIMARY SURFACES.
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * A KPI/stat card is a promise: "there are 7 open work orders — here they are." Across this app the
 * promise is broken twice over, and the second break is the worse one:
 *
 *   (a) DEAD CLICK — the card renders a bare <div>. The operator clicks the number, nothing happens,
 *       and they go hunting through a list page for the 7 rows the card already knew about.
 *       pages/maintenance/components/MaintKpiRows.tsx renders 7 of these on EVERY maintenance tab;
 *       pages/maintenance/components/RMStatStrip.tsx renders 8 more on the R&M status board.
 *
 *   (b) DISHONEST NUMBER — the card renders `Number(kpis?.severe_oos ?? 0)`. When the query fails,
 *       when the field does not exist on the payload at all, and when the true answer really is
 *       zero, the operator sees the same confident `0`. On a SAFETY strip that is not a cosmetic
 *       bug: `kpis ?? { open_dvir_major_defects: 0, hos_violations_today: 0 }` renders an all-clear
 *       for a fleet nobody actually checked. A dead card wastes a click. A fabricated 0 gets
 *       believed. This guard fails on both, and it fails harder on the second.
 *
 * FIX PRIMITIVE (one component, propagates)
 * -----------------------------------------
 * components/layout/DrillKpiCard.tsx — a KPI card whose drill target is REQUIRED BY THE TYPE:
 *
 *     type KpiDrillTarget =
 *       | { to: string;            onClick?: never; unavailable?: never }
 *       | { onClick: () => void;   to?: never;      unavailable?: never }
 *       | { unavailable: string;   to?: never;      onClick?: never }
 *
 * `<DrillKpiCard label="Open WOs" value={n} />` does not compile. That is the point: the dead card
 * is made unrepresentable rather than merely discouraged. `unavailable` is the honest third state —
 * a non-navigable tile that STATES why (a computed ratio has no record list behind it), never a
 * silent dead click — and it carries its own shrink-only budget below so it cannot become the
 * escape hatch that quietly re-admits the defect. The same component owns the honest-value rule:
 * `value` accepts null/undefined and renders `—`, so "no data" and "zero" stop looking identical.
 *
 * WHAT IS IN SCOPE (deliberately narrow, stated — not an allowlist-to-silence)
 * ---------------------------------------------------------------------------
 * PRIMARY SURFACES ONLY: apps/frontend/src/pages/** and apps/frontend/src/components/home/**.
 * Those are the module homes, boards, landings and role dashboards an operator lands on. Excluded,
 * with the reason:
 *   - components/{vehicle,trailer,driver}-profile/**, components/customers/**, components/vendors/**
 *     — a RECORD DETAIL panel. Its `Metric label="Brand" value={reefer.brand}` is a record
 *     attribute, not an aggregate: there is no filtered list behind "Brand / model", so demanding a
 *     drill target there would force somebody to invent a fake route. Named in REMAINING, not hidden.
 *   - names ending Row/Field/Line/Chip/Bar/Strip/Section/Panel/Table/List/Chart/Header/Badge/Pill —
 *     those are detail rows, form fields and CONTAINERS (a KpiRow renders cards; it is not one).
 *     The cards inside a container are still judged, via the KPI-surface-file channel below.
 *   - any factory that takes `onChange` — that is a form control, not a metric.
 *   - commented-out JSX — prose, never a call site (comments are blanked before judging).
 *
 * THREE CHANNELS
 *   A. FACTORY CALL SITE — a locally-declared card factory (KPI/Stat/Metric/Bucket/Summary/Card/Tile
 *      name + a label-ish and a value-ish prop) is a card; every `<Factory .../>` is one card render,
 *      and each must carry a drill prop. This is what makes "7 dead cards" a count and not a vibe.
 *   B. HAND-ROLLED CHROME — inside a file whose own NAME declares it a KPI surface (*KpiRow.tsx,
 *      *StatStrip.tsx, *KpiBar.tsx, …), card chrome (`border` + `bg-white` + padding) on a plain
 *      <div> is a card that skipped the shared component. The author named the file; the guard takes
 *      them at their word.
 *   C. HONESTY — inside a KPI-surface file or on a card's value prop: a hardcoded literal value, a
 *      `?? 0` / `|| 0` zero-fallback, or a `?? { … }` snapshot fallback that manufactures a whole
 *      row of zeroes out of a failed query.
 *
 * Run against pre-fix origin/main and this FAILS: DrillKpiCard.tsx does not exist and ~100 card
 * renders across ~20 primary surfaces are dead, hardcoded, or zero-faking.
 *
 *   node scripts/verify-no-dead-kpi-cards.mjs
 *   node scripts/verify-no-dead-kpi-cards.mjs --selftest
 *   KPI_INVENTORY_PRINT=1 node scripts/verify-no-dead-kpi-cards.mjs   (full card inventory)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const LABEL = "verify-no-dead-kpi-cards";
const MISSING = " MISSING ";

const PRIMITIVE_FILE = `${SRC}/components/layout/DrillKpiCard.tsx`;

/** Primary surfaces. Everything else is a detail panel or a form — see the header for why. */
const IN_SCOPE_PREFIXES = [`${SRC}/pages/`, `${SRC}/components/home/`];

/** Shared card components. A render of one of these is a card render wherever it appears in scope. */
const SHARED_CARD_TAGS = ["DrillKpiCard", "KpiCard", "HomeKpiCard"];

/** Props that constitute a real drill target on a card render. */
const DRILL_PROPS = ["to", "href", "onClick", "onSelect", "onNavigate", "unavailable", "disabled"];

/** A card factory NAME: the KPI/stat family, or a bare Card/Tile. */
const CARD_NAME = /(?:^|[A-Z])(?:Kpi|KPI|Stat|Metric|Bucket|Summary)|^(?:Card|Tile)$/;
/** Containers, detail rows and form parts — never a card. Stated in the header. */
const NOT_CARD_NAME =
  /(?:Row|Field|Line|Chip|Bar|Strip|Section|Panel|Table|List|Chart|Header|Badge|Pill|Group|Grid|Modal|Drawer|Page|Form|Link|Button)$/;

/** A file whose own basename declares it a KPI/stat surface — channel B + C scope. */
const KPI_SURFACE_FILE = /(?:Kpi|KPI|Stat)(?:Card|Cards|Row|Rows|Bar|Bars|Strip|Strips|Tile|Tiles)\.tsx$/;

const LABEL_PROP = /(?:^|[,{\s])(?:label|title)\s*(?:$|[,:}=])/;
const VALUE_PROP = /(?:^|[,{\s])(?:value|number|count|amount)\s*(?:$|[,:}=])/;

/** onClick handlers that look clickable and do nothing. */
const NOOP_ONCLICK =
  /\bonClick=\{\s*(?:\(\s*\)\s*=>\s*(?:\{\s*\}|undefined|null|void\s+0)?\s*|undefined|null)\s*\}/;

/** An `unavailable` reason must SAY something. These are placeholders pretending to be reasons. */
const PLACEHOLDER_REASON = /^\s*(?:|-|—|n\/?a|tbd|todo|fixme|\?+|none|pending)\s*$/i;

/**
 * Shrink-only budget for the honest non-navigable state. `unavailable` exists so a genuinely
 * non-drillable metric (a computed ratio, a balance assertion) can be honest instead of dead — it
 * must never become the one-word way to re-admit a dead card. Lower this when a real drill target
 * is built; never raise it.
 *
 * At the close of C8 it is 5 render sites, every one named here so it can be argued with:
 *   1. pages/profitability/KpiStrip.tsx — the six-metric map. The Profitability module has NO data
 *      source at all (ByLane/ByType/ByCustomer/ByLoad all declare `const rows = []`); the strip used
 *      to print six hardcoded "-". Building the aggregate endpoint is a backend change.
 *   2. pages/insurance/InsuranceLanding.tsx — "Recent COI request count". COI requests are tracked
 *      per customer (Customers → COI tab); there is no company-wide COI list to open.
 *   3. pages/samsara-vendor-mapping/HosDriverMapPreviewPage.tsx — "Open assignments". A pull
 *      diagnostic over telematics.vehicle_driver_assignments, which has no list screen.
 *   4-5. the two local factories' pass-through renders for the three tiles above.
 */
const UNAVAILABLE_BUDGET = 5;

// ---------------------------------------------------------------------------------------------
// Source scanning. JSX attribute values nest braces, template literals and quotes, so a plain
// regex mis-slices `value={a ? `x ${b}` : "y"}`; everything below walks the source instead.
// ---------------------------------------------------------------------------------------------

/**
 * Blank `//` and block comments, preserving every byte offset and newline so line numbers and
 * slices stay exact. Required: this guard's own header quotes the very patterns it forbids
 * (`?? 0`, a dead `<Card label value />`), and several target files carry TODO comments containing
 * example JSX. A guard must judge executable code, never prose.
 */
export function blankComments(source) {
  let out = "";
  let i = 0;
  let str = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (str) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") {
        out += " ";
        i += 1;
      }
      continue;
    }
    if (c === "/" && next === "*") {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (; i < stop; i += 1) out += source[i] === "\n" ? "\n" : " ";
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/** End offset of the JSX opening tag that starts at `start` (brace/quote aware). */
function endOfTag(src, start) {
  let i = start;
  let depth = 0;
  let str = null;
  for (; i < src.length; i += 1) {
    const ch = src[i];
    if (str) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === str) str = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      str = ch;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      continue;
    }
    if (ch === ">" && depth === 0) return i + 1;
  }
  return src.length;
}

/** Every JSX opening tag in a (comment-blanked) source. */
export function extractTags(src, tagNames) {
  const pattern = tagNames ? `<(${tagNames.join("|")})\\b` : "<([A-Za-z][A-Za-z0-9_.]*)";
  const re = new RegExp(pattern, "g");
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const end = endOfTag(src, m.index);
    out.push({ name: m[1], text: src.slice(m.index, end), start: m.index, line: lineOf(src, m.index) });
    re.lastIndex = Math.max(re.lastIndex, m.index + m[0].length);
  }
  return out;
}

/** The raw text of a JSX attribute on an opening tag, or null. */
export function attrValue(tagText, attr) {
  const re = new RegExp(`\\b${attr}=`, "g");
  const m = re.exec(tagText);
  if (!m) return null;
  let i = m.index + m[0].length;
  if (tagText[i] === "{") {
    let depth = 0;
    let str = null;
    for (let j = i; j < tagText.length; j += 1) {
      const ch = tagText[j];
      if (str) {
        if (ch === "\\") {
          j += 1;
          continue;
        }
        if (ch === str) str = null;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        str = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) return tagText.slice(i + 1, j);
      }
    }
    return tagText.slice(i + 1);
  }
  const q = tagText[i];
  if (q === '"' || q === "'") {
    const close = tagText.indexOf(q, i + 1);
    return tagText.slice(i, close === -1 ? tagText.length : close + 1);
  }
  return null;
}

const inScope = (rel) => IN_SCOPE_PREFIXES.some((p) => rel.startsWith(p));

// ---------------------------------------------------------------------------------------------
// Channel A — local card factories and their call sites.
// ---------------------------------------------------------------------------------------------

/**
 * Body of a locally-declared `type X = …` / `interface X { … }`, so a component that takes
 * `props: XProps` instead of destructuring is still classified. Without this, `function
 * StatCard(props: StatCardProps)` is invisible to the guard — a one-refactor evasion.
 */
function resolveTypeBody(src, typeName) {
  const re = new RegExp(`(?:type\\s+${typeName}\\s*=|interface\\s+${typeName}\\s*)`, "g");
  const m = re.exec(src);
  if (!m) return "";
  // Take everything up to the next top-level declaration — unions across several object literals
  // (a discriminated drill-target union) must all be seen.
  const rest = src.slice(m.index + m[0].length);
  const stop = /\n(?:export\s+)?(?:type|interface|function|const|class)\s/.exec(rest);
  return stop ? rest.slice(0, stop.index) : rest;
}

/** Locally-declared card factories in one (comment-blanked) source. */
export function findCardFactories(src) {
  const re =
    /(?:export\s+)?(?:function\s+([A-Z][A-Za-z0-9_]*)\s*\(\s*(?:\{([^}]*)\}|\w+\s*:\s*([A-Z][A-Za-z0-9_]*))|const\s+([A-Z][A-Za-z0-9_]*)\s*(?::[^=]*?)?=\s*\(\s*(?:\{([^}]*)\}|\w+\s*:\s*([A-Z][A-Za-z0-9_]*)))/g;
  const out = [];
  let m;
  while ((m = re.exec(src))) {
    const name = m[1] ?? m[4];
    const typeRef = m[3] ?? m[6];
    const props = m[2] ?? m[5] ?? (typeRef ? resolveTypeBody(src, typeRef) : "");
    if (!CARD_NAME.test(name) || NOT_CARD_NAME.test(name)) continue;
    if (!LABEL_PROP.test(props) || !VALUE_PROP.test(props)) continue;
    if (/\bonChange\b/.test(props)) continue; // a form control, not a metric
    const rest = src.slice(m.index + 10);
    const nextDecl = /\n(?:export\s+)?(?:function|const)\s+[A-Z]/.exec(rest);
    const body = nextDecl ? src.slice(m.index, m.index + 10 + nextDecl.index) : src.slice(m.index);
    out.push({
      name,
      line: lineOf(src, m.index),
      props,
      // Does the factory itself know how to drill (render a link/button, or delegate to a shared card)?
      drillCapable: /<Link\b|<button\b|<a\s|\bhref=|<DrillKpiCard\b|<KpiCard\b|<HomeKpiCard\b/.test(body),
    });
  }
  return out;
}

/** Every card render in scope, with its verdict. */
export function scanCardRenders(files) {
  const renders = [];
  for (const [rel, raw] of Object.entries(files)) {
    if (!inScope(rel)) continue;
    const src = blankComments(raw);
    const factories = findCardFactories(src);
    const byName = new Map(factories.map((f) => [f.name, f]));
    const tagNames = [...new Set([...factories.map((f) => f.name), ...SHARED_CARD_TAGS])];
    for (const tag of extractTags(src, tagNames)) {
      const factory = byName.get(tag.name) ?? null;
      const shared = SHARED_CARD_TAGS.includes(tag.name);
      // A factory's own declaration is not a render of itself.
      if (factory && factory.line === tag.line && !shared) continue;
      const passed = DRILL_PROPS.filter((p) => new RegExp(`\\b${p}[=\\s/>]`).test(tag.text));
      const noop = NOOP_ONCLICK.test(tag.text);
      const capable = shared || (factory ? factory.drillCapable : false);
      renders.push({
        file: rel,
        line: tag.line,
        tag: tag.name,
        text: tag.text,
        drillProps: passed,
        live: capable && passed.length > 0 && !noop,
        reason: !capable
          ? `<${tag.name}> renders a bare element — the factory has no link/button and delegates to no shared card`
          : noop
            ? `<${tag.name}> has a no-op onClick — it looks clickable and does nothing`
            : passed.length === 0
              ? `<${tag.name}> passes none of ${DRILL_PROPS.join("/")}`
              : "",
      });
    }
  }
  return renders;
}

// ---------------------------------------------------------------------------------------------
// Channel B — hand-rolled card chrome inside a self-declared KPI surface file.
// ---------------------------------------------------------------------------------------------

const CHROME_BORDER = /\bborder\b|\bborder-/;
const CHROME_FACE = /\bbg-white\b/;
const CHROME_PAD = /\b(?:p|px|py)-\d/;
/** Grid/flex wrappers are the STRIP, not a card. */
const CHROME_CONTAINER = /\b(?:grid-cols|flex-wrap|space-y|divide-)/;
const CHROME_SKELETON = /\banimate-pulse\b/;
const CLICKABLE_TAGS = new Set(["Link", "button", "a", "NavLink", ...SHARED_CARD_TAGS]);
/**
 * A loading skeleton and an error shell WEAR card chrome but hold no metric — they are the
 * card's own not-yet/couldn't-load states, and demanding a drill target on them would make the
 * honest states the thing that fails. Recognised by what they contain, not by an allowlist.
 */
const NON_CARD_SUBTREE = /\banimate-pulse\b|<ListErrorState\b|<SectionErrorBoundary\b/;

/** Source slice of the element opening at `start`, including its children and closing tag. */
export function elementSubtree(src, start, tagName) {
  const openEnd = endOfTag(src, start);
  if (src.slice(start, openEnd).endsWith("/>")) return src.slice(start, openEnd);
  const open = new RegExp(`<${tagName}\\b`, "g");
  const close = new RegExp(`</${tagName}\\s*>`, "g");
  let depth = 1;
  let cursor = openEnd;
  while (depth > 0 && cursor < src.length) {
    open.lastIndex = cursor;
    close.lastIndex = cursor;
    const nextOpen = open.exec(src);
    const nextClose = close.exec(src);
    if (!nextClose) return src.slice(start);
    if (nextOpen && nextOpen.index < nextClose.index) {
      depth += 1;
      cursor = endOfTag(src, nextOpen.index);
      continue;
    }
    depth -= 1;
    cursor = nextClose.index + nextClose[0].length;
  }
  return src.slice(start, cursor);
}

export function scanHandRolledChrome(files) {
  const out = [];
  for (const [rel, raw] of Object.entries(files)) {
    if (!inScope(rel) || !KPI_SURFACE_FILE.test(path.basename(rel))) continue;
    const src = blankComments(raw);
    for (const tag of extractTags(src, null)) {
      if (CLICKABLE_TAGS.has(tag.name)) continue;
      const cls = attrValue(tag.text, "className") ?? "";
      if (!CHROME_BORDER.test(cls) || !CHROME_FACE.test(cls) || !CHROME_PAD.test(cls)) continue;
      if (CHROME_CONTAINER.test(cls) || CHROME_SKELETON.test(cls)) continue;
      if (NON_CARD_SUBTREE.test(elementSubtree(src, tag.start, tag.name))) continue;
      out.push({ file: rel, line: tag.line, tag: tag.name });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Channel C — honesty. A number is live-backed or it renders "—".
// ---------------------------------------------------------------------------------------------

/**
 * A hardcoded value: a quoted string or a bare number. A TEMPLATE literal that interpolates
 * (`` `$${total.toLocaleString()}` ``) is LIVE-BACKED formatting, not a hardcoded number — claiming
 * it would be the guard lying about the code instead of the code lying about the data.
 */
const LITERAL_VALUE = /^\s*(?:(["'`])((?:(?!\$\{).)*)\1|-?\d+(?:\.\d+)?)\s*$/s;
const ZERO_FALLBACK = /(?:\?\?|\|\|)\s*(?:0\b|["']0["']|["']-["'])/;
/**
 * A POPULATED object fallback (`kpis ?? { open: 0, late: 0 }`) invents a whole strip of readings.
 * An EMPTY one (`kpis ?? {}`) is the honest shape — every field stays undefined and therefore
 * renders "—" — so it is deliberately not claimed. The distinction is the defect, not the operator.
 */
const SNAPSHOT_FALLBACK = /\?\?\s*\{\s*[^}\s]/;
/** A value element: the big number line of a hand-rolled tile. */
const VALUE_CLASS = /\bfont-(?:semibold|bold)\b/;

export function scanHonesty(files) {
  const out = [];
  for (const [rel, raw] of Object.entries(files)) {
    if (!inScope(rel)) continue;
    const src = blankComments(raw);
    const isKpiSurface = KPI_SURFACE_FILE.test(path.basename(rel));

    // C1 — a card render whose value is a hardcoded literal.
    const factories = findCardFactories(src);
    const tagNames = [...new Set([...factories.map((f) => f.name), ...SHARED_CARD_TAGS])];
    for (const tag of extractTags(src, tagNames)) {
      for (const attr of ["value", "number"]) {
        const v = attrValue(tag.text, attr);
        if (v == null) continue;
        const m = LITERAL_VALUE.exec(v);
        if (!m) continue;
        const text = m[2] ?? m[0].trim();
        if (text.trim() === "—") continue; // the honest no-value marker is allowed
        out.push({
          file: rel,
          line: tag.line,
          kind: "hardcoded",
          detail: `<${tag.name} ${attr}=${v.trim()}> is a hardcoded number, not a live-backed metric`,
        });
      }
    }

    if (!isKpiSurface) continue;

    // C2 — zero-fallback: a failed/absent query and a real zero render identically.
    for (const line of src.split("\n").entries()) {
      const [idx, text] = line;
      if (ZERO_FALLBACK.test(text)) {
        out.push({
          file: rel,
          line: idx + 1,
          kind: "dishonest-zero",
          detail: `\`${text.trim().slice(0, 110)}\` — a missing/failed value renders as a confident 0; use null → "—"`,
        });
      }
      if (SNAPSHOT_FALLBACK.test(text)) {
        out.push({
          file: rel,
          line: idx + 1,
          kind: "dishonest-snapshot",
          detail: `\`${text.trim().slice(0, 110)}\` — an absent payload manufactures a whole strip of zeroes`,
        });
      }
    }

    // C3 — a hand-rolled value element whose content is a bare literal.
    // Lookahead on the closing `<` so two adjacent elements are both seen (a consumed `<` would
    // swallow the very tile that follows the wrapper).
    const re = /<(span|div|p)\b([^>]*)>([^<{]*)(?=<)/g;
    let m;
    while ((m = re.exec(src))) {
      const cls = attrValue(`<${m[1]}${m[2]}>`, "className") ?? "";
      if (!VALUE_CLASS.test(cls)) continue;
      const text = m[3].trim();
      if (text === "" || text === "—") continue;
      out.push({
        file: rel,
        line: lineOf(src, m.index),
        kind: "hardcoded",
        detail: `<${m[1]} class="…font-semibold…">${text}</${m[1]}> is a hardcoded KPI value`,
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The shared primitive's own contract.
// ---------------------------------------------------------------------------------------------

const squash = (s) => s.replace(/\s+/g, " ");

export function primitiveErrors(source) {
  const errors = [];
  if (source === MISSING) {
    errors.push(`PRIMITIVE: missing file ${PRIMITIVE_FILE} — the required-drill KPI card does not exist`);
    return errors;
  }
  const flat = squash(blankComments(source));

  // The union IS the enforcement: each branch requires exactly one target and forbids the others.
  const branches = [
    ["to", /\{ to: string; onClick\?: never; unavailable\?: never \}/],
    ["onClick", /\{ onClick: \(\) => void; to\?: never; unavailable\?: never \}/],
    ["unavailable", /\{ unavailable: string; to\?: never; onClick\?: never \}/],
  ];
  for (const [name, re] of branches) {
    if (!re.test(flat)) {
      errors.push(
        `PRIMITIVE-UNION: ${PRIMITIVE_FILE} declares no exactly-one \`${name}\` branch on KpiDrillTarget — ` +
          "without it TypeScript accepts a card with no drill target and the dead card is representable again"
      );
    }
  }
  if (!/export type DrillKpiCardProps = KpiDrillTarget &/.test(flat)) {
    errors.push(`PRIMITIVE-UNION: DrillKpiCardProps must intersect KpiDrillTarget so the target is REQUIRED`);
  }
  if (/DrillKpiCardProps = KpiDrillTarget & \{[^}]*\b(?:to|onClick|unavailable)\?:/.test(flat)) {
    errors.push(`PRIMITIVE-UNION: DrillKpiCardProps re-declares a drill prop as optional — that defeats the union`);
  }
  if (!/<Link\b/.test(flat)) errors.push(`PRIMITIVE: ${PRIMITIVE_FILE} must render a <Link> for the \`to\` target`);
  if (!/<button\b/.test(flat)) errors.push(`PRIMITIVE: ${PRIMITIVE_FILE} must render a <button> for the \`onClick\` target`);
  if (!/data-kpi-drill/.test(flat)) errors.push(`PRIMITIVE: ${PRIMITIVE_FILE} must mark drillable cards with data-kpi-drill`);
  if (!/data-kpi-unavailable/.test(flat)) {
    errors.push(`PRIMITIVE: ${PRIMITIVE_FILE} must mark the honest non-navigable state with data-kpi-unavailable`);
  }
  if (!/aria-label=/.test(flat)) errors.push(`PRIMITIVE-A11Y: ${PRIMITIVE_FILE} must label the drill affordance`);

  // Honest UI lives in the primitive, so no call site can forget it.
  if (!/export const KPI_NO_VALUE = "—"/.test(flat)) {
    errors.push(`PRIMITIVE-HONEST: ${PRIMITIVE_FILE} must export KPI_NO_VALUE = "—"`);
  }
  if (!/export function formatKpiValue\(/.test(flat)) {
    errors.push(`PRIMITIVE-HONEST: ${PRIMITIVE_FILE} must export formatKpiValue()`);
  }
  if (!/value === null \|\| value === undefined\) return KPI_NO_VALUE/.test(flat)) {
    errors.push(
      `PRIMITIVE-HONEST: formatKpiValue must return KPI_NO_VALUE for null/undefined — ` +
        "otherwise 'no data' and 'zero' render identically, which is the worse half of this defect"
    );
  }
  if (!/Number\.isFinite\(value\) \? String\(value\) : KPI_NO_VALUE/.test(flat)) {
    errors.push(`PRIMITIVE-HONEST: formatKpiValue must render NaN/Infinity as KPI_NO_VALUE, never as a number`);
  }
  if (!/DrillKpiCardProps = KpiDrillTarget & \{[^}]*value: string \| number \| null \| undefined;/.test(flat)) {
    errors.push(`PRIMITIVE-HONEST: DrillKpiCardProps.value must accept null|undefined so callers can say "no data"`);
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------

export function contractErrors(src, options = {}) {
  const budget = options.unavailableBudget ?? UNAVAILABLE_BUDGET;
  const errors = [...primitiveErrors(src.primitive)];

  for (const r of scanCardRenders(src.files)) {
    if (r.live) continue;
    errors.push(`DEAD-CARD: ${r.file}:${r.line} — ${r.reason}`);
  }
  for (const c of scanHandRolledChrome(src.files)) {
    errors.push(
      `HAND-ROLLED: ${c.file}:${c.line} — <${c.tag}> is card chrome on a KPI surface that never reaches ` +
        "DrillKpiCard; a hand-rolled tile cannot be given a required drill target"
    );
  }
  for (const h of scanHonesty(src.files)) {
    errors.push(`HONEST-${h.kind.toUpperCase()}: ${h.file}:${h.line} — ${h.detail}`);
  }

  // The escape hatch is budgeted and must state a real reason.
  let unavailable = 0;
  for (const [rel, raw] of Object.entries(src.files)) {
    if (!inScope(rel)) continue;
    const source = blankComments(raw);
    for (const tag of extractTags(source, [...SHARED_CARD_TAGS, ...findCardFactories(source).map((f) => f.name)])) {
      const v = attrValue(tag.text, "unavailable");
      if (v == null) continue;
      unavailable += 1;
      const literal = LITERAL_VALUE.exec(v);
      const text = literal ? (literal[2] ?? literal[0]) : null;
      if (text != null && PLACEHOLDER_REASON.test(text)) {
        errors.push(
          `UNAVAILABLE-REASON: ${rel}:${tag.line} — \`unavailable=${v.trim()}\` is a placeholder, not a reason. ` +
            "The honest state must tell the operator WHY there is nothing to open."
        );
      }
    }
  }
  if (unavailable > budget) {
    errors.push(
      `UNAVAILABLE-BUDGET: ${unavailable} honest non-navigable KPI card(s) exceed the shrink-only budget of ` +
        `${budget}. Build the drill target — this ratchet only tightens.`
    );
  }
  const maintenanceHome = src.files[`${SRC}/pages/maintenance/MaintenanceHome.tsx`];
  if (
    maintenanceHome &&
    !maintenanceHome.includes('tab !== "rm_status_board" ? <MaintKpiRows')
  ) {
    errors.push(
      "DUPLICATE-KPI: MaintenanceHome must suppress MaintKpiRows on rm_status_board; " +
        "RMStatStrip already owns Open WOs and PM Due there",
    );
  }
  return errors;
}

// ---------------------------------------------------------------------------------------------
// SELFTEST — every assertion is proven capable of failing before the real tree is judged.
// ---------------------------------------------------------------------------------------------

const GOOD_PRIMITIVE = `
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export const KPI_NO_VALUE = "—";

export function formatKpiValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return KPI_NO_VALUE;
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : KPI_NO_VALUE;
  const trimmed = value.trim();
  return trimmed === "" ? KPI_NO_VALUE : trimmed;
}

export type KpiDrillTarget =
  | { to: string; onClick?: never; unavailable?: never }
  | { onClick: () => void; to?: never; unavailable?: never }
  | { unavailable: string; to?: never; onClick?: never };

export type DrillKpiCardProps = KpiDrillTarget & {
  label: string;
  value: string | number | null | undefined;
  hint?: ReactNode;
};

export function DrillKpiCard(props: DrillKpiCardProps) {
  const face = <span>{formatKpiValue(props.value)}</span>;
  if (props.unavailable) {
    return <div data-kpi-unavailable="true" title={props.unavailable} aria-label={props.label}>{face}</div>;
  }
  if (props.to) {
    return <Link to={props.to} data-kpi-drill="true" aria-label={props.label}>{face}</Link>;
  }
  return <button type="button" onClick={props.onClick} data-kpi-drill="true" aria-label={props.label}>{face}</button>;
}
`;

/**
 * SELFTEST FIXTURES live at module scope on purpose. Keeping ~300 lines of JSX-in-strings
 * inside `function selftest()` defeats scripts/verify-selftests-can-fail.mjs: its
 * brace-balancer counts `{` inside string literals, truncates the body, and then cannot see
 * the `process.exit(1)`. A meta-guard that reads this file must be able to read it
 * correctly — the fix is to keep the function short, never to weaken the meta-guard.
 */
/** The fixture budget is 1 so the good fixture may exercise the honest state; the real tree is
 *  judged against UNAVAILABLE_BUDGET. The budget mutation plants 2 and must still trip. */
const SELFTEST_OPTS = { unavailableBudget: 1 };

const GOOD_FIXTURE = {
  primitive: GOOD_PRIMITIVE,
  files: {
    [`${SRC}/pages/x/BoardPage.tsx`]:
      'function StatTile({ label, value, to }: { label: string; value: number; to?: string }) {\n' +
      "  return <Link to={to ?? '/x'}>{label}{value}</Link>;\n}\n" +
      '<StatTile label="Open" value={n} to="/x/open" />\n' +
      '<DrillKpiCard label="Late" value={late} onClick={openLate} />\n' +
      '<DrillKpiCard label="Ratio" value={ratio} unavailable="Computed from the rows above — no record list." />',
    // Classifier controls — none of these may be claimed.
    [`${SRC}/pages/x/DetailPanel.tsx`]:
      'function DetailRow({ label, value }: { label: string; value: string }) { return <div>{label}{value}</div>; }\n' +
      '<DetailRow label="Brand" value={u.brand} />',
    [`${SRC}/pages/x/EditForm.tsx`]:
      'function StatField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {\n' +
      "  return <input value={value} onChange={(e) => onChange(e.target.value)} />;\n}\n" +
      '<StatField label="Name" value={v} onChange={set} />',
    [`${SRC}/components/vehicle-profile/ReeferSection.tsx`]:
      'function Card({ label, value }: { label: string; value: string }) { return <div>{label}{value}</div>; }\n' +
      '<Card label="Brand / model" value={reefer.brand} />',
    [`${SRC}/pages/x/CommentedOut.tsx`]:
      '// legacy: <Card label="Ghost" value={n} />\nfunction Card({ label, value }: { label: string; value: number }) {\n' +
      "  return <Link to='/g'>{label}{value}</Link>;\n}\nexport const nothing = 1;",
    // Controls for the two narrowings above: a live-backed template literal is not "hardcoded",
    // and a skeleton / error shell wearing card chrome is not a card.
    [`${SRC}/pages/x/TemplateKpiBar.tsx`]:
      'export function TemplateKpiBar({ total }: { total: number }) {\n' +
      '  return <DrillKpiCard label="Spend" value={`$${total.toLocaleString()}`} to="/x/spend" />;\n}',
    [`${SRC}/pages/x/ShellKpiCard.tsx`]:
      'export function ShellKpiCard({ loading, failed }: { loading: boolean; failed: boolean }) {\n' +
      '  if (loading) return <div className="rounded-sm border border-slate-200 bg-white p-3">' +
      '<div className="h-6 animate-pulse rounded-sm bg-slate-100" /></div>;\n' +
      '  if (failed) return <div className="rounded-sm border border-slate-200 bg-white p-3">' +
      "<ListErrorState title=\"Couldn't load\" /></div>;\n" +
      '  return <DrillKpiCard label="Open" value={n} to="/x/open" />;\n}',
    [`${SRC}/pages/x/EmptyFallbackKpiBar.tsx`]:
      'export function EmptyFallbackKpiBar({ kpis }: { kpis?: { open?: number } }) {\n' +
      '  const snapshot = kpis ?? {};\n  return <DrillKpiCard label="Open" value={snapshot.open ?? null} to="/x" />;\n}',
    [`${SRC}/pages/x/GoodKpiRow.tsx`]:
      'export function GoodKpiRow({ kpis }: { kpis?: Record<string, number> }) {\n' +
      "  return <div className=\"grid grid-cols-3 gap-2\">{[['Open', kpis?.open ?? null]].map(([l, v]) => (\n" +
      '    <DrillKpiCard key={l} label={l} value={v} to="/x/open" />\n  ))}</div>;\n}",',
  },
};


const withFile = (base, rel, source) => ({ ...base, files: { ...base.files, [rel]: source } });
const withPrimitive = (base, next) => ({ ...base, primitive: next });


function selftestMutations(good) {
  return [
    [
      "maintenance R&M renders both global and board-specific KPI strips",
      withFile(
        good,
        `${SRC}/pages/maintenance/MaintenanceHome.tsx`,
        '<MaintKpiRows kpis={kpis} isError={false} /><RMStatStrip kpis={kpis} />',
      ),
      /DUPLICATE-KPI: MaintenanceHome/,
    ],
    [
      "a card factory call site passes no drill target",
      withFile(
        good,
        `${SRC}/pages/x/BoardPage.tsx`,
        'function StatTile({ label, value, to }: { label: string; value: number; to?: string }) {\n' +
          "  return <Link to={to ?? '/x'}>{label}{value}</Link>;\n}\n" +
          '<StatTile label="Open" value={n} />'
      ),
      /DEAD-CARD: .*BoardPage\.tsx/,
    ],
    [
      "a brand-new dead card lands on a new page (tomorrow's regression)",
      withFile(
        good,
        `${SRC}/pages/x/BrandNewHome.tsx`,
        'function KpiTile({ label, value }: { label: string; value: number }) { return <div>{label}{value}</div>; }\n' +
          '<KpiTile label="Open WOs" value={n} />'
      ),
      /DEAD-CARD: .*BrandNewHome/,
    ],
    [
      // Found while migrating: HosDriverMapPreviewPage's StatCard took `props: StatCardProps`, so an
      // earlier draft of this classifier could not see it at all. One refactor was a full evasion.
      "a card factory takes `props: XProps` instead of destructuring, hiding from the classifier",
      withFile(
        good,
        `${SRC}/pages/x/TypedProps.tsx`,
        "type StatTileProps = { label: string; value: number };\n" +
          "function StatTile(props: StatTileProps) { return <div>{props.label}{props.value}</div>; }\n" +
          '<StatTile label="Open" value={n} />'
      ),
      /DEAD-CARD: .*TypedProps/,
    ],
    [
      "a shared DrillKpiCard render forgets its target",
      withFile(good, `${SRC}/pages/x/Another.tsx`, '<DrillKpiCard label="Open" value={n} />'),
      /DEAD-CARD: .*Another/,
    ],
    [
      "a card looks clickable but its onClick is a no-op",
      withFile(good, `${SRC}/pages/x/Noop.tsx`, '<DrillKpiCard label="Open" value={n} onClick={() => {}} />'),
      /DEAD-CARD: .*no-op onClick/,
    ],
    [
      "a factory renders a bare div, so even a `to` prop cannot navigate",
      withFile(
        good,
        `${SRC}/pages/x/Fake.tsx`,
        'function StatTile({ label, value, to }: { label: string; value: number; to?: string }) { return <div>{label}{value}</div>; }\n' +
          '<StatTile label="Open" value={n} to="/x" />'
      ),
      /DEAD-CARD: .*renders a bare element/,
    ],
    [
      "a KPI surface hand-rolls its own card chrome instead of using the shared card",
      withFile(
        good,
        `${SRC}/pages/x/HandKpiRow.tsx`,
        'export function HandKpiRow() {\n  return <div className="grid grid-cols-3 gap-2">' +
          '<div className="rounded-sm border border-gray-200 bg-white px-2 py-1"><div>Open</div><div>{n}</div></div></div>;\n}'
      ),
      /HAND-ROLLED: .*HandKpiRow/,
    ],
    [
      "a real hand-rolled tile hides in a file that also has a legitimate skeleton",
      withFile(
        good,
        `${SRC}/pages/x/ShellKpiCard.tsx`,
        'export function ShellKpiCard({ loading }: { loading: boolean }) {\n' +
          '  if (loading) return <div className="rounded-sm border border-slate-200 bg-white p-3">' +
          '<div className="h-6 animate-pulse rounded-sm bg-slate-100" /></div>;\n' +
          '  return <div className="rounded-sm border border-slate-200 bg-white p-3"><div>Open</div><div>{n}</div></div>;\n}'
      ),
      /HAND-ROLLED: .*ShellKpiCard/,
    ],
    [
      "a KPI value is hardcoded into the JSX",
      withFile(good, `${SRC}/pages/x/Hard.tsx`, '<DrillKpiCard label="Open" value={7} to="/x" />'),
      /HONEST-HARDCODED: .*Hard\.tsx/,
    ],
    [
      "a KPI value is a hardcoded string",
      withFile(good, `${SRC}/pages/x/HardStr.tsx`, '<DrillKpiCard label="Open" value="12" to="/x" />'),
      /HONEST-HARDCODED: .*HardStr/,
    ],
    [
      "a missing/failed metric is coerced to a confident zero",
      withFile(
        good,
        `${SRC}/pages/x/ZeroKpiRow.tsx`,
        'export function ZeroKpiRow({ kpis }: { kpis?: Record<string, number> }) {\n' +
          "  const open = Number(kpis?.open ?? 0);\n  return <DrillKpiCard label=\"Open\" value={open} to=\"/x\" />;\n}"
      ),
      /HONEST-DISHONEST-ZERO: .*ZeroKpiRow/,
    ],
    [
      "an absent payload manufactures a whole strip of zeroes",
      withFile(
        good,
        `${SRC}/pages/x/SnapKpiBar.tsx`,
        'export function SnapKpiBar({ kpis }: { kpis?: { open: number } }) {\n' +
          '  const snapshot = kpis ?? { open: 0 };\n  return <DrillKpiCard label="Open" value={snapshot.open} to="/x" />;\n}'
      ),
      /HONEST-DISHONEST-SNAPSHOT: .*SnapKpiBar/,
    ],
    [
      "a KPI strip renders a hardcoded dash-value instead of a live metric",
      withFile(
        good,
        `${SRC}/pages/x/DashKpiStrip.tsx`,
        'export function DashKpiStrip() {\n  return <div className="flex"><span className="font-semibold">-</span></div>;\n}'
      ),
      /HONEST-HARDCODED: .*DashKpiStrip/,
    ],
    [
      "the honest state is used without stating a reason",
      withFile(good, `${SRC}/pages/x/Empty.tsx`, '<DrillKpiCard label="Ratio" value={r} unavailable="TODO" />'),
      /UNAVAILABLE-REASON: .*Empty/,
    ],
    [
      "the honest escape hatch grows past its shrink-only budget",
      withFile(
        good,
        `${SRC}/pages/x/Budget.tsx`,
        Array.from(
          { length: SELFTEST_OPTS.unavailableBudget + 1 },
          (_, i) => `<DrillKpiCard label="M${i}" value={v} unavailable="No record list backs this ratio." />`
        ).join("\n")
      ),
      /UNAVAILABLE-BUDGET/,
    ],
    [
      "the required-drill union is loosened back into optional props",
      withPrimitive(
        good,
        GOOD_PRIMITIVE.replace(
          /export type KpiDrillTarget =[\s\S]*?unavailable: string; to\?: never; onClick\?: never \};/,
          "export type KpiDrillTarget = { to?: string; onClick?: () => void; unavailable?: string };"
        )
      ),
      /PRIMITIVE-UNION: .*exactly-one/,
    ],
    [
      "a drill prop is re-declared optional on the props type, defeating the union",
      withPrimitive(good, GOOD_PRIMITIVE.replace("  label: string;", "  to?: string;\n  label: string;")),
      /PRIMITIVE-UNION: .*re-declares a drill prop as optional/,
    ],
    [
      "the props type stops intersecting the union",
      withPrimitive(good, GOOD_PRIMITIVE.replace("DrillKpiCardProps = KpiDrillTarget &", "DrillKpiCardProps =")),
      /PRIMITIVE-UNION: .*must intersect/,
    ],
    [
      "the honest reason becomes optional so a bare card compiles again",
      withPrimitive(good, GOOD_PRIMITIVE.replace("unavailable: string; to?: never", "unavailable?: string; to?: never")),
      /PRIMITIVE-UNION: .*`unavailable` branch/,
    ],
    [
      "the card stops rendering a <Link> for `to`",
      withPrimitive(good, GOOD_PRIMITIVE.replace(/<Link\b/g, "<div").replace("</Link>", "</div>")),
      /PRIMITIVE: .*must render a <Link>/,
    ],
    [
      "the card stops rendering a <button> for `onClick`",
      withPrimitive(good, GOOD_PRIMITIVE.replace(/<button\b/g, "<div")),
      /PRIMITIVE: .*must render a <button>/,
    ],
    [
      "the drill marker is dropped so nothing can assert click-through",
      withPrimitive(good, GOOD_PRIMITIVE.replace(/data-kpi-drill/g, "data-x")),
      /PRIMITIVE: .*data-kpi-drill/,
    ],
    [
      "the honest non-navigable marker is dropped",
      withPrimitive(good, GOOD_PRIMITIVE.replace(/data-kpi-unavailable/g, "data-y")),
      /PRIMITIVE: .*data-kpi-unavailable/,
    ],
    [
      "the drill affordance loses its accessible name",
      withPrimitive(good, GOOD_PRIMITIVE.replace(/aria-label=\{props\.label\}/g, "")),
      /PRIMITIVE-A11Y/,
    ],
    [
      "nullish stops rendering as an em-dash, so 'no data' looks like zero again",
      withPrimitive(
        good,
        GOOD_PRIMITIVE.replace("if (value === null || value === undefined) return KPI_NO_VALUE;", "")
      ),
      /PRIMITIVE-HONEST: formatKpiValue must return KPI_NO_VALUE for null/,
    ],
    [
      "NaN starts rendering as a number",
      withPrimitive(good, GOOD_PRIMITIVE.replace("Number.isFinite(value) ? String(value) : KPI_NO_VALUE", "String(value)")),
      /PRIMITIVE-HONEST: .*NaN/,
    ],
    [
      "value stops accepting null, so callers must fabricate a zero",
      withPrimitive(good, GOOD_PRIMITIVE.replace("value: string | number | null | undefined;", "value: string | number;")),
      /PRIMITIVE-HONEST: .*must accept null/,
    ],
    [
      "the em-dash constant is renamed away",
      withPrimitive(good, GOOD_PRIMITIVE.replace('export const KPI_NO_VALUE = "—"', 'const NO_VALUE = "—"')),
      /PRIMITIVE-HONEST: .*KPI_NO_VALUE/,
    ],
    ["the shared primitive disappears", withPrimitive(good, MISSING), /PRIMITIVE: missing file/],
  ];

}

function selftest() {
  const failures = [];
  const good = GOOD_FIXTURE;
  const OPTS = SELFTEST_OPTS;
  const clean = contractErrors(good, OPTS);
  if (clean.length) failures.push(`good fixture is NOT clean:\n      ${clean.join("\n      ")}`);

  // Prove the classifier claims cards and refuses non-cards.
  const claimed = scanCardRenders(good.files).map((r) => `${r.file}:${r.tag}`);
  for (const must of [`${SRC}/pages/x/BoardPage.tsx:StatTile`, `${SRC}/pages/x/BoardPage.tsx:DrillKpiCard`]) {
    if (!claimed.includes(must)) failures.push(`classifier MISSED a card render: ${must}`);
  }
  for (const mustNot of [
    `${SRC}/pages/x/DetailPanel.tsx:DetailRow`, // a detail row is not a metric
    `${SRC}/pages/x/EditForm.tsx:StatField`, // a form control is not a metric
    `${SRC}/components/vehicle-profile/ReeferSection.tsx:Card`, // a record-detail panel is not a primary surface
  ]) {
    if (claimed.includes(mustNot)) failures.push(`classifier over-claimed a non-card: ${mustNot}`);
  }
  if (scanCardRenders(good.files).some((r) => r.file.endsWith("CommentedOut.tsx") && !r.live)) {
    failures.push("classifier claimed a commented-out card render — comments are prose, not call sites");
  }
  if (scanHonesty(good.files).some((h) => h.file.endsWith("TemplateKpiBar.tsx"))) {
    failures.push("honesty scan claimed an interpolated template literal — that is live-backed formatting");
  }
  if (scanHandRolledChrome(good.files).some((c) => c.file.endsWith("ShellKpiCard.tsx"))) {
    failures.push("chrome scan claimed a loading skeleton / error shell — those hold no metric");
  }
  if (scanHonesty(good.files).some((h) => h.file.endsWith("EmptyFallbackKpiBar.tsx"))) {
    failures.push("honesty scan claimed `kpis ?? {}` — an EMPTY fallback leaves every field undefined, which is honest");
  }

  const mutations = selftestMutations(good);
  for (const [name, fixture, expected] of mutations) {
    const found = contractErrors(fixture, OPTS);
    if (!found.some((e) => expected.test(e))) {
      failures.push(
        `mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`
      );
    }
  }

  if (failures.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `PASS ${LABEL} --selftest — good fixture clean, classifier claims cards and refuses ` +
      `detail rows / form fields / detail panels / comments, ${mutations.length}/${mutations.length} mutations caught.`
  );
}

// ---------------------------------------------------------------------------------------------

function read(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") return MISSING;
    throw error;
  }
}

function collectFrontendFiles() {
  const files = {};
  const stack = [path.join(ROOT, SRC)];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "__tests__" || entry.name === "node_modules") continue;
        stack.push(full);
      } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) {
        files[path.relative(ROOT, full).split(path.sep).join("/")] = fs.readFileSync(full, "utf8");
      }
    }
  }
  return files;
}

const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!IS_ENTRY) {
  // imported as a library (component test / tooling) — export-only.
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = collectFrontendFiles();
  const src = { primitive: read(PRIMITIVE_FILE), files };
  if (process.env.KPI_INVENTORY_PRINT === "1") {
    const renders = scanCardRenders(files);
    const byFile = new Map();
    for (const r of renders) byFile.set(r.file, (byFile.get(r.file) ?? 0) + (r.live ? 0 : 1));
    for (const [file, dead] of [...byFile].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(dead).padStart(3)} dead  ${file}`);
    }
  }
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}: ${errors.length} problem(s)\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  const renders = scanCardRenders(files);
  console.log(
    `PASS ${LABEL} — ${renders.length} KPI/stat card render(s) on primary surfaces all drill to a target ` +
      `or state an honest reason (budget ${UNAVAILABLE_BUDGET}); no hand-rolled tile chrome, no hardcoded value, ` +
      "no zero-faked metric."
  );
}
