#!/usr/bin/env node
/**
 * C7 — CREATE SURFACES USE THE SHARED 480px RIGHT DRAWER, NOT A CENTERED MODAL.
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * apps/frontend/src/components/Modal.tsx is the software-wide dialog shell and it renders ONE
 * shape: a centered card (`flex items-center justify-center` + `max-w-[42rem]`). Every "+ Create"
 * surface in the product therefore opens as a centered box floating over the list it was launched
 * from. That is the wrong chrome for a create form in a TMS/ERP: QuickBooks, NetSuite, McLeod and
 * Alvys all put record creation in a bounded RIGHT DRAWER so the underlying list stays readable,
 * so a nested create can stack drawer-on-drawer, and so a create launched from a money panel never
 * covers the money panel with an opaque centered box.
 *
 * The repo already proved the shape is right in one corner: CHROME-11 made the NESTED Create-Driver
 * call site render a ParityDrawer "never a centered Modal on top of an already-open money drawer"
 * (components/drivers/CreateDriverModal.tsx). But the top-level surfaces were never converted,
 * because the shared Modal had no drawer variant to convert them TO.
 *
 * FIX PRIMITIVE (one change, propagates): Modal gains `variant="drawer"` — a 480px right-anchored
 * panel that keeps the SAME focus trap, the SAME Escape handling and the SAME unsaved-changes
 * (ConfirmDiscardDialog) guard the centered variant already has. Call sites add one prop.
 *
 * Run this against pre-fix origin/main and it FAILS: `variant` does not exist on Modal, the 480px
 * token does not exist, and every create surface below is a centered modal.
 *
 * WHAT COUNTS AS A "CREATE SURFACE" (deliberately NARROW — stated, not an allowlist-to-silence)
 * ---------------------------------------------------------------------------------------------
 * A `<Modal>` render is in scope when EITHER:
 *   (A) VERB — a string literal inside its `title` expression leads with a create verb:
 *       /(^\s*(?:\+\s*)?|·\s*|\bQuick\s+)(Create|Book|New|Add)\b/  — this is §7's locked
 *       "+ Create"/"+ Book" vocabulary plus the two legacy spellings ("New", "Add") that the
 *       vocabulary lock is retiring; ternary branches are each inspected, so
 *       `mode === "create" ? "New X" : "Edit X"` is in scope.
 *   (B) MODE — the file declares a create mode (`mode === "create"` / `"create" | "edit"` /
 *       `isEdit ?`) and renders exactly one `<Modal>`, i.e. that Modal IS the create/edit form
 *       shell even though its title arrives as a prop (pages/lists/dispatch/CatalogEntryModal.tsx).
 *
 * NARROWED ON PURPOSE, with the reason (so nobody widens it by accident and nobody silences it):
 *   - Surfaces whose leading verb is a DOMAIN action ("Log Safety Event", "File claim", "Register
 *     Contract", "Record Purchase", "Report load abandonment") are NOT claimed. They do create a
 *     row, but their verb is ambiguous between "create a record" and "perform a workflow action",
 *     and a chrome guard must not be the thing that decides product semantics. They are named in
 *     the PR's REMAINING section instead of being hidden in an allowlist.
 *   - Surfaces already built on components/parity/ParityDrawer.tsx are NOT claimed: they are
 *     already right drawers, so they are not this defect class. (They are 576/700px and lack the
 *     focus trap + unsaved guard — a real follow-on, reported in REMAINING, not silenced here.)
 *   - Confirm / preview / detail / success modals are out of scope by construction: they are not
 *     create forms, and this ratchet must not flip them.
 *   - Hand-rolled right overlays are NOT flagged wholesale. An earlier draft of this guard did, and
 *     it fired on pages/daily-tasks/DailyTasksPage.tsx — whose hand-rolled panel is a task DETAIL
 *     (read) drawer, not a create shell. A guard about CREATE chrome must not dictate the shape of
 *     READ surfaces, so the assertion was narrowed to the stacking contract below instead of being
 *     allowlisted away. The remaining hand-rolled drawers are named in the PR's REMAINING section.
 *
 * OWNER-RATIFIED WIDE-WIZARD EXCEPTIONS (exactly two, and the list may never grow)
 *   - pages/dispatch/components/BookLoadModalV4.tsx  — Book Load
 *   - pages/maintenance/components/CreateWorkOrderModal.tsx — Create Work Order
 * Both are multi-step wide wizards the owner ratified as wizards, not drawers. The guard asserts
 * they are STILL wide wizards (a reverse ratchet: nobody may quietly drawer-ise them either) and
 * that each carries the annotation in source, so the exception is visible where the code is.
 *
 *   node scripts/verify-create-surface-is-drawer.mjs
 *   node scripts/verify-create-surface-is-drawer.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const LABEL = "verify-create-surface-is-drawer";
const MISSING = " MISSING ";

const MODAL_FILE = `${SRC}/components/Modal.tsx`;
const SIZING_FILE = `${SRC}/components/parity/sizing.ts`;

/** Owner-ratified wide wizards. EXACTLY these two — the list is a ratchet and may never grow. */
const WIDE_WIZARD_EXCEPTIONS = [
  [`${SRC}/pages/dispatch/components/BookLoadModalV4.tsx`, "Book Load"],
  [`${SRC}/pages/maintenance/components/CreateWorkOrderModal.tsx`, "Create Work Order"],
];
/** Annotation every exception file must carry so the exception is visible at the code, not only here. */
const EXCEPTION_TOKEN = "C7-WIDE-WIZARD-EXCEPTION";

/** The create verbs, in the positions that mean "this dialog creates a record". */
const CREATE_VERB = /(?:^\s*(?:\+\s*)?|·\s*|\bQuick\s+)(Create|Book|New|Add)\b/;
/** A file that declares a create/edit mode — channel (B). */
const CREATE_MODE = /mode\s*===\s*["']create["']|["']create["']\s*\|\s*["']edit["']|\bisEdit\s*\?/;

// ---------------------------------------------------------------------------------------------
// JSX scanning (regex-free brace/quote walker — JSX attribute values nest braces and template
// literals, so a plain regex mis-slices `title={a ? `x ${b}` : "y"}`).
// ---------------------------------------------------------------------------------------------

/**
 * Blank out `//` and block comments, preserving every byte offset and newline so line numbers and
 * slices stay exact. Required because this guard's own contract text lives in doc comments that
 * quote the very patterns it forbids (e.g. the C7-WIDE-WIZARD-EXCEPTION headers quote
 * `variant="drawer"` while explaining that the file must NOT use it). A guard must judge
 * executable code, never prose.
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

/** Opening tags for `<Name ...>`, brace/string aware. */
export function openingTags(source, name) {
  const out = [];
  const re = new RegExp(`<${name}\\b`, "g");
  let m;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let brace = 0;
    let str = null;
    while (i < source.length) {
      const c = source[i];
      if (str) {
        if (c === str && source[i - 1] !== "\\") str = null;
      } else if (c === '"' || c === "'" || c === "`") {
        str = c;
      } else if (c === "{") {
        brace += 1;
      } else if (c === "}") {
        brace -= 1;
      } else if (c === ">" && brace === 0) {
        break;
      }
      i += 1;
    }
    out.push({
      text: source.slice(m.index, i + 1),
      line: source.slice(0, m.index).split("\n").length,
    });
  }
  return out;
}

/**
 * Value of attribute `name` on an opening tag.
 * `{ kind: "string" }` for `title="Create X"` (the value IS the literal);
 * `{ kind: "expr" }` for `title={...}` (the value is source that may contain literals).
 */
export function attrValue(tagText, name) {
  const re = new RegExp(`\\s${name}=`, "g");
  const m = re.exec(tagText);
  if (!m) return null;
  let i = m.index + m[0].length;
  const q = tagText[i];
  if (q === '"' || q === "'") {
    const end = tagText.indexOf(q, i + 1);
    return { kind: "string", value: end === -1 ? "" : tagText.slice(i + 1, end) };
  }
  if (q !== "{") return { kind: "expr", value: "" };
  let depth = 0;
  let str = null;
  let j = i;
  for (; j < tagText.length; j += 1) {
    const c = tagText[j];
    if (str) {
      if (c === str && tagText[j - 1] !== "\\") str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  return { kind: "expr", value: tagText.slice(i + 1, j) };
}

/** Every string/template literal inside an expression, with `${...}` interpolations blanked out. */
export function literalsIn(expr) {
  const out = [];
  const re = /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`((?:[^`\\]|\\.)*)`/g;
  let m;
  while ((m = re.exec(expr))) out.push((m[1] ?? m[2] ?? m[3] ?? "").replace(/\$\{[^}]*\}/g, " "));
  return out;
}

/** Resolve `title={someLocalConst}` one hop, so a const-declared ternary title is still classified. */
function resolveTitleExpr(source, expr) {
  const id = expr.trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(id)) return expr;
  const m = source.match(new RegExp(`const\\s+${id}\\s*=([\\s\\S]*?);`));
  return m ? m[1] : expr;
}

/**
 * The create surfaces in a { relPath: source } map. Pure — the selftest feeds it fixtures.
 */
export function scanCreateSurfaces(files) {
  const surfaces = [];
  for (const [rel, raw] of Object.entries(files)) {
    if (rel === MODAL_FILE) continue; // the shell itself is not a call site
    if (raw === MISSING) continue;
    const source = blankComments(raw);
    const tags = openingTags(source, "Modal");
    if (tags.length === 0) continue;
    const fileDeclaresCreateMode = CREATE_MODE.test(source);
    for (const tag of tags) {
      const rawTitle = attrValue(tag.text, "title");
      let titleExpr = "";
      let literals = [];
      if (rawTitle && rawTitle.kind === "string") {
        titleExpr = rawTitle.value;
        literals = [rawTitle.value];
      } else if (rawTitle) {
        titleExpr = resolveTitleExpr(source, rawTitle.value);
        literals = literalsIn(titleExpr);
      }
      const byVerb = literals.some((lit) => CREATE_VERB.test(lit));
      const byMode = fileDeclaresCreateMode && tags.length === 1;
      if (!byVerb && !byMode) continue;
      surfaces.push({
        file: rel,
        line: tag.line,
        title: titleExpr.replace(/\s+/g, " ").trim().slice(0, 110) || "(title from prop)",
        channel: byVerb ? "verb" : "mode",
        isDrawer: /variant=["']drawer["']/.test(tag.text),
      });
    }
  }
  return surfaces.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));
}

// ---------------------------------------------------------------------------------------------
// Contract
// ---------------------------------------------------------------------------------------------

/**
 * @param {{ modal: string, sizing: string, files: Record<string,string> }} src
 */
export function contractErrors(src) {
  const errors = [];
  const { modal, sizing, files } = src;

  // --- L4/L6: the shared primitive must exist, be 480px, be right-anchored, keep a11y ----------
  if (modal === MISSING) {
    errors.push(`PRIMITIVE: missing file ${MODAL_FILE}`);
  } else {
    if (!/variant\??:\s*["']center["']\s*\|\s*["']drawer["']/.test(modal)) {
      errors.push(
        `PRIMITIVE: ${MODAL_FILE} declares no \`variant?: "center" | "drawer"\` prop — there is no drawer shape to convert create surfaces to.`
      );
    }
    if (!/variant\s*=\s*["']center["']/.test(modal)) {
      errors.push(
        `ADDITIVE: ${MODAL_FILE} must default \`variant\` to "center" so the ~120 existing non-create modals keep their shape.`
      );
    }
    if (!/PARITY_CREATE_DRAWER_WIDTH/.test(modal)) {
      errors.push(
        `PRIMITIVE-480: ${MODAL_FILE} does not use the shared PARITY_CREATE_DRAWER_WIDTH token — the 480px width must come from parity/sizing, never a literal in the shell.`
      );
    }
    if (!/justify-end/.test(modal)) {
      errors.push(`PRIMITIVE-RIGHT: ${MODAL_FILE} drawer variant is not right-anchored (no \`justify-end\` overlay).`);
    }
    // VERIFY-1: nested create = drawer-on-drawer. ParityDrawer (money / inline create) sits at
    // z-[60] above page wizards (z-50). This Modal overlay must stay at z-[70] so a create drawer
    // opened FROM a ParityDrawer (or from Book Load) stacks ABOVE that parent — otherwise Save
    // clicks hit the parent backdrop and the create never POSTs (VERIFY-1 / Book Load live 2026-08-04).
    if (!/createPortal\(/.test(modal)) {
      errors.push(
        `NESTED-STACKING: ${MODAL_FILE} must render through \`createPortal\` into document.body, or a create drawer opened from a money panel is trapped inside that panel's stacking context.`
      );
    }
    if (!/z-\[70\]/.test(modal)) {
      errors.push(
        `NESTED-STACKING: ${MODAL_FILE} overlay must stay at \`z-[70]\` — components/parity/ParityDrawer.tsx is z-[60], and a nested create drawer has to stack ABOVE the money/wizard shell that opened it (VERIFY-1).`
      );
    }
    // a11y + unsaved guard must be shared, never gated on the variant.
    const hasEscapeHandling =
      /useEscapeKey\(attemptClose,\s*open\)/.test(modal) ||
      /useEscapeKey\(\(\)\s*=>\s*\{[\s\S]{0,400}?attemptClose\(\);[\s\S]{0,120}?\},\s*open\)/.test(modal);
    if (!hasEscapeHandling) {
      errors.push(`PRIMITIVE-A11Y: ${MODAL_FILE} lost its Escape handling through \`attemptClose\`.`);
    }
    for (const [needle, why] of [
      ["ConfirmDiscardDialog", "unsaved-changes guard"],
      ['event.key !== "Tab"', "focus trap"],
    ]) {
      if (!modal.includes(needle)) {
        errors.push(`PRIMITIVE-A11Y: ${MODAL_FILE} lost its ${why} (\`${needle}\` gone).`);
      }
    }
    // Gating detection: `variant` (or any boolean derived from it in one hop, e.g.
    // `const isDrawer = variant === "drawer"`) must never appear on a line that decides whether
    // Escape / the focus trap / the unsaved-changes dialog runs.
    const variantAliases = new Set(["variant"]);
    for (const m of modal.matchAll(/const\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\bvariant\s*(?:===|!==)[^;\n]*;/g)) {
      variantAliases.add(m[1]);
    }
    const A11Y_LINE = /useEscapeKey\s*\(|ConfirmDiscardDialog|event\.key !== "Tab"/;
    for (const [index, line] of modal.split("\n").entries()) {
      if (!A11Y_LINE.test(line)) continue;
      const hit = [...variantAliases].find((alias) => new RegExp(`\\b${alias}\\b`).test(line));
      if (hit) {
        errors.push(
          `PRIMITIVE-A11Y: ${MODAL_FILE}:${index + 1} gates focus-trap/Escape/unsaved-guard on \`${hit}\` — the drawer must inherit the SAME a11y as the centered card.`
        );
      }
    }
  }

  if (sizing === MISSING) {
    errors.push(`PRIMITIVE-480: missing file ${SIZING_FILE}`);
  } else {
    if (!/createDrawerWidthPx:\s*480\b/.test(sizing)) {
      errors.push(`PRIMITIVE-480: ${SIZING_FILE} must define \`createDrawerWidthPx: 480\` (owner-specified create-drawer width).`);
    }
    if (!/PARITY_CREATE_DRAWER_WIDTH\s*=\s*["']w-full sm:w-\[480px\]["']/.test(sizing)) {
      errors.push(
        `PRIMITIVE-480: ${SIZING_FILE} must export \`PARITY_CREATE_DRAWER_WIDTH = "w-full sm:w-[480px]"\` (full-bleed on mobile, 480px on desktop).`
      );
    }
    for (const legacy of ["drawerWidthPx: 576", 'PARITY_DRAWER_WIDTH = "w-full sm:w-[576px]"']) {
      if (!sizing.includes(legacy)) {
        errors.push(`ADDITIVE: ${SIZING_FILE} dropped the pre-existing token \`${legacy}\` — C7 is additive, it never removes a token.`);
      }
    }
  }

  // --- L8: the owner-ratified exceptions -------------------------------------------------------
  if (WIDE_WIZARD_EXCEPTIONS.length !== 2) {
    errors.push(
      `EXCEPTIONS: the wide-wizard allowlist has ${WIDE_WIZARD_EXCEPTIONS.length} entries — the owner ratified exactly 2 (Book Load, Create Work Order). This list is a ratchet and may never grow.`
    );
  }
  const exceptionFiles = new Set(WIDE_WIZARD_EXCEPTIONS.map(([f]) => f));
  for (const [rel, label] of WIDE_WIZARD_EXCEPTIONS) {
    const source = files[rel];
    if (source === undefined || source === MISSING) {
      errors.push(`EXCEPTIONS: ratified wide wizard "${label}" is missing at ${rel} (renamed? the exception must move with it).`);
      continue;
    }
    if (!source.includes(EXCEPTION_TOKEN)) {
      errors.push(
        `EXCEPTIONS: ${rel} ("${label}") carries no \`${EXCEPTION_TOKEN}\` annotation — an owner-ratified exception must be readable at the code, not only in the guard.`
      );
    }
    // Code only: the annotation itself quotes `variant="drawer"` while forbidding it.
    if (/variant=["']drawer["']/.test(blankComments(source))) {
      errors.push(
        `EXCEPTIONS: ${rel} ("${label}") was converted to the drawer — the owner ratified it as a WIDE WIZARD. Reverse ratchet: do not drawer-ise it.`
      );
    }
  }

  // --- L4: every create surface must be the drawer ---------------------------------------------
  const surfaces = scanCreateSurfaces(files);
  const offenders = surfaces.filter((s) => !s.isDrawer && !exceptionFiles.has(s.file));
  for (const s of offenders) {
    errors.push(
      `DRAWER-LAW: ${s.file}:${s.line} opens a CENTERED modal for a create surface [${s.channel}] — title: ${s.title}. Pass \`variant="drawer"\`.`
    );
  }

  return errors;
}

// ---------------------------------------------------------------------------------------------
// selftest — plants defects and proves each assertion bites; then proves the corrected shape passes
// ---------------------------------------------------------------------------------------------

function selftest() {
  const failures = [];

  const goodModal = [
    'import { PARITY_CREATE_DRAWER_WIDTH } from "./parity/sizing";',
    'type ModalProps = { variant?: "center" | "drawer" };',
    'export function Modal({ variant = "center" }: ModalProps) {',
    "  useEscapeKey(attemptClose, open);",
    '  useEffect(() => { const onKeyDown = (event) => { if (event.key !== "Tab") return; }; }, [open]);',
    '  const isDrawer = variant === "drawer";',
    "  const overlay = isDrawer ? `fixed inset-0 z-[70] flex justify-end bg-black/50` : `fixed inset-0 z-[70] flex items-center justify-center`;",
    "  const panel = isDrawer ? `h-full ${PARITY_CREATE_DRAWER_WIDTH}` : `max-w-[42rem]`;",
    "  return createPortal(<><div className={overlay}>{children}</div><ConfirmDiscardDialog /></>, document.body);",
    "}",
  ].join("\n");

  const goodSizing = [
    "export const paritySizing = { drawerWidthPx: 576, createDrawerWidthPx: 480 } as const;",
    'export const PARITY_DRAWER_WIDTH = "w-full sm:w-[576px]";',
    'export const PARITY_CREATE_DRAWER_WIDTH = "w-full sm:w-[480px]";',
  ].join("\n");

  const good = {
    modal: goodModal,
    sizing: goodSizing,
    files: {
      [MODAL_FILE]: goodModal,
      [`${SRC}/pages/x/CreateThingModal.tsx`]:
        '<Modal open={open} onClose={onClose} title="Create Thing" variant="drawer">body</Modal>',
      [`${SRC}/pages/x/CatalogRowModal.tsx`]:
        'const label = mode === "create" ? a : b;\n<Modal open={open} onClose={onClose} title={title} variant="drawer">body</Modal>',
      [`${SRC}/pages/x/ConfirmVoidModal.tsx`]: '<Modal open={open} onClose={onClose} title="Void this row?">body</Modal>',
      [`${SRC}/pages/x/UploadedOkModal.tsx`]: '<Modal open={open} onClose={onClose} title="Driver created successfully">ok</Modal>',
      [`${SRC}/pages/dispatch/components/BookLoadModalV4.tsx`]:
        `// ${EXCEPTION_TOKEN}: Book Load stays a wide wizard (owner-ratified).\nexport function BookLoadModalV4() { return null; }`,
      // The real annotations QUOTE `variant="drawer"` while forbidding it, and quote `<Modal ...>`
      // examples. Both exception fixtures reproduce that so comment-blanking is proven, not assumed.
      [`${SRC}/pages/maintenance/components/CreateWorkOrderModal.tsx`]:
        `/** ${EXCEPTION_TOKEN}: WO-create stays a wide wizard (owner-ratified) — never variant="drawer". */\n` +
        '<Modal open={open} onClose={onClose} title="Create Work Order" wide>wo</Modal>',
      [`${SRC}/pages/x/CommentedOut.tsx`]:
        '// legacy shape, kept for reference: <Modal open={o} onClose={c} title="Create Ghost">x</Modal>\nexport const nothing = 1;',
    },
  };

  const clean = contractErrors(good);
  if (clean.length) failures.push(`good fixture is NOT clean:\n      ${clean.join("\n      ")}`);

  // Prove the classifier itself: it must claim create titles and must NOT claim the others.
  const claimed = scanCreateSurfaces(good.files).map((s) => s.file);
  for (const must of [`${SRC}/pages/x/CreateThingModal.tsx`, `${SRC}/pages/x/CatalogRowModal.tsx`]) {
    if (!claimed.includes(must)) failures.push(`classifier MISSED a create surface: ${must}`);
  }
  for (const mustNot of [
    `${SRC}/pages/x/ConfirmVoidModal.tsx`,
    `${SRC}/pages/x/UploadedOkModal.tsx`,
    `${SRC}/pages/x/CommentedOut.tsx`, // a commented-out example is prose, not a call site
  ]) {
    if (claimed.includes(mustNot)) failures.push(`classifier over-claimed a non-create surface: ${mustNot}`);
  }

  const withFile = (base, rel, source) => ({ ...base, files: { ...base.files, [rel]: source } });

  const mutations = [
    [
      "a create surface stays a centered modal",
      withFile(good, `${SRC}/pages/x/CreateThingModal.tsx`, '<Modal open={open} onClose={onClose} title="Create Thing">body</Modal>'),
      /DRAWER-LAW: .*CreateThingModal/,
    ],
    [
      "a NEW create surface lands centered (the ratchet must catch tomorrow's regression)",
      withFile(good, `${SRC}/pages/x/BrandNewPage.tsx`, '<Modal open={o} onClose={c} title="+ Create Widget">form</Modal>'),
      /DRAWER-LAW: .*BrandNewPage/,
    ],
    [
      "a legacy-vocabulary create surface lands centered",
      withFile(good, `${SRC}/pages/x/LegacyVocab.tsx`, '<Modal open={o} onClose={c} title="New Detail Type">form</Modal>'),
      /DRAWER-LAW: .*LegacyVocab/,
    ],
    [
      "a ternary create/edit surface lands centered",
      withFile(
        good,
        `${SRC}/pages/x/Ternary.tsx`,
        '<Modal open={o} onClose={c} title={isEdit ? "Edit Reason" : "Create Reason"}>form</Modal>'
      ),
      /DRAWER-LAW: .*Ternary/,
    ],
    [
      "a mode-driven surface whose title is a prop lands centered",
      withFile(
        good,
        `${SRC}/pages/x/CatalogRowModal.tsx`,
        'const label = mode === "create" ? a : b;\n<Modal open={o} onClose={c} title={title}>form</Modal>'
      ),
      /DRAWER-LAW: .*CatalogRowModal/,
    ],
    [
      "the drawer variant is removed from the shared shell",
      { ...good, modal: goodModal.replace('variant?: "center" | "drawer"', "wide?: boolean") },
      /PRIMITIVE: .*declares no/,
    ],
    [
      "the shell stops defaulting to the centered shape (would flip ~120 untouched modals)",
      { ...good, modal: goodModal.replace('variant = "center"', 'variant = "drawer"') },
      /ADDITIVE: .*default `variant` to "center"/,
    ],
    [
      "the drawer stops being right-anchored",
      { ...good, modal: goodModal.replace("justify-end", "justify-center") },
      /PRIMITIVE-RIGHT/,
    ],
    [
      "the width stops coming from the shared token",
      { ...good, modal: goodModal.replace(/PARITY_CREATE_DRAWER_WIDTH/g, "w-[520px]") },
      /PRIMITIVE-480: .*PARITY_CREATE_DRAWER_WIDTH token/,
    ],
    [
      "the 480px token is widened behind our back",
      { ...good, sizing: goodSizing.replace("createDrawerWidthPx: 480", "createDrawerWidthPx: 560") },
      /createDrawerWidthPx: 480/,
    ],
    [
      "the tailwind width class drifts from the px token",
      { ...good, sizing: goodSizing.replace("sm:w-[480px]", "sm:w-[560px]") },
      /PARITY_CREATE_DRAWER_WIDTH = /,
    ],
    [
      "the pre-existing 576px drawer token is deleted instead of left alone",
      { ...good, sizing: goodSizing.replace("drawerWidthPx: 576, ", "") },
      /ADDITIVE: .*drawerWidthPx: 576/,
    ],
    [
      "the focus trap disappears from the shared shell",
      { ...good, modal: goodModal.replace('if (event.key !== "Tab") return;', "") },
      /PRIMITIVE-A11Y: .*focus trap/,
    ],
    [
      "Escape handling disappears",
      { ...good, modal: goodModal.replace("useEscapeKey(attemptClose, open);", "") },
      /PRIMITIVE-A11Y: .*Escape handling/,
    ],
    [
      "the unsaved-changes guard disappears",
      { ...good, modal: goodModal.replace(/ConfirmDiscardDialog/g, "Nothing") },
      /PRIMITIVE-A11Y: .*unsaved-changes guard/,
    ],
    [
      "the unsaved guard is gated so only the centered card keeps it",
      {
        ...good,
        modal: goodModal.replace(
          "  return createPortal(",
          '  const skip = variant === "drawer";\n  const dlg = skip ? null : <ConfirmDiscardDialog />;\n  return createPortal('
        ),
      },
      /PRIMITIVE-A11Y: .*gates focus-trap/,
    ],
    [
      "a ratified wide wizard is quietly drawer-ised (in CODE, not in its annotation)",
      withFile(
        good,
        `${SRC}/pages/maintenance/components/CreateWorkOrderModal.tsx`,
        `// ${EXCEPTION_TOKEN}\n<Modal open={o} onClose={c} title="Create Work Order" variant="drawer">wo</Modal>`
      ),
      /EXCEPTIONS: .*ratified it as a WIDE WIZARD/,
    ],
    [
      "a create surface is 'converted' only inside a comment while the code stays centered",
      withFile(
        good,
        `${SRC}/pages/x/CreateThingModal.tsx`,
        '/* TODO: pass variant="drawer" here */\n<Modal open={o} onClose={c} title="Create Thing">body</Modal>'
      ),
      /DRAWER-LAW: .*CreateThingModal/,
    ],
    [
      "a ratified wide wizard loses its in-source annotation",
      withFile(good, `${SRC}/pages/dispatch/components/BookLoadModalV4.tsx`, "export function BookLoadModalV4() { return null; }"),
      /EXCEPTIONS: .*carries no/,
    ],
    [
      "a ratified wide wizard is renamed away",
      { ...good, files: Object.fromEntries(Object.entries(good.files).filter(([k]) => !k.includes("BookLoadModalV4"))) },
      /EXCEPTIONS: .*is missing at/,
    ],
    [
      "the shell stops portalling, so a nested create drawer is trapped in the money panel",
      { ...good, modal: goodModal.replace("createPortal(", "wrap(") },
      /NESTED-STACKING: .*createPortal/,
    ],
    [
      "the overlay is demoted below the ParityDrawer money panel",
      { ...good, modal: goodModal.replace(/z-\[70\]/g, "z-30") },
      /NESTED-STACKING: .*z-\[70\]/,
    ],
    ["the shared shell file disappears", { ...good, modal: MISSING }, /PRIMITIVE: missing file/],
    ["the sizing token file disappears", { ...good, sizing: MISSING }, /PRIMITIVE-480: missing file/],
  ];

  for (const [name, fixture, expected] of mutations) {
    const found = contractErrors(fixture);
    if (!found.some((e) => expected.test(e))) {
      failures.push(`mutation NOT caught: ${name}\n      expected ${expected}\n      got: ${found.join(" | ") || "(no errors)"}`);
    }
  }

  if (failures.length) {
    console.error(`FAIL ${LABEL} --selftest:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(
    `PASS ${LABEL} --selftest — good fixture clean, classifier claims create/rejects non-create, ${mutations.length}/${mutations.length} mutations caught.`
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
        files[path.relative(ROOT, full)] = fs.readFileSync(full, "utf8");
      }
    }
  }
  return files;
}

// Only act when run as the entry point — the helpers above are imported by tooling and by the
// component test, and a module that scans the repo on import is a footgun.
const IS_ENTRY = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (!IS_ENTRY) {
  // imported as a library — export-only.
} else if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const files = collectFrontendFiles();
  const src = { modal: read(MODAL_FILE), sizing: read(SIZING_FILE), files };
  const errors = contractErrors(src);
  if (errors.length) {
    console.error(`FAIL ${LABEL}: ${errors.length} problem(s)\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  const surfaces = scanCreateSurfaces(files);
  console.log(
    `PASS ${LABEL} — ${surfaces.length} create surface(s) open the shared 480px right drawer; ` +
      `${WIDE_WIZARD_EXCEPTIONS.length} owner-ratified wide wizards annotated and left as wizards.`
  );
}
