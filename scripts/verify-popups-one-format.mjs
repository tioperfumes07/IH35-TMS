#!/usr/bin/env node
/**
 * GUARD — ONE POPUP FORMAT ACROSS THE WHOLE APP (owner 10-25-2026 1:46 PM + 4:02 PM CT).
 *
 * Owner: "the pop up be made to spec and size, not entire page, it must be small pop up … if reason needed the drop
 * down filter combobox. and if voiding the same thing" — then: "all formats should be fixed across the entire app all
 * modules modals pop up's".
 *
 * RULE 1 — every dialog is the shared <Modal> (centered card / create drawer) or <ParityDrawer> (side panel). A file that
 *   paints its own `fixed inset-0` overlay is a second popup shell with its own size, z-index, focus trap and Escape
 *   handling — exactly how page-wide popups and panels-under-panels happened. Measured 10-25: 40 files. The baseline
 *   below is SHRINK-ONLY: a converted file must leave the list (stale entries fail), a new file can never join it.
 *   NOT dialogs (permanent exemptions, named): the mobile sidebar backdrop, the Cmd-K switcher, full-screen media
 *   viewers (photo evidence, dashcam), and the two shells themselves.
 * RULE 2 — a shared <Modal> whose title is a confirm / void / cancel / reason / override / delete / reject decision is
 *   size="sm" (480px per 443.295). A decision popup is never page-wide. Review+decide boards that name
 *   sizePreset="md"|"lg"|"xl" (Fuel assignment md 720, etc.) are the 443.295 review sizes — not this rule.
 *
 * RULE 3 — (443.365-B) every catalog creator short-code field (an <input> under pages/lists whose value binds to a
 *   *_code / code / *Code field) carries data-control-kind="code", so the control sizing law sizes it 104px (owner design
 *   law rule 4). Measured 10-25: 23 in 22 files, 0 marked -> 23 marked.
 *
 * RULE 4 — (443.365-C) catalog creator field labels use FORM_LABEL_CLASS / FORM_LABEL_STACK_CLASS
 *   (components/forms/inputClass.ts), never a hand-typed `text-xs font-semibold text-gray-600` label. Measured 10-25: 136
 *   hand-typed labels in 28 files -> 0.
 *
 * Run: node scripts/verify-popups-one-format.mjs [--selftest] [--print]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");
const BASELINE = path.join(ROOT, "scripts/verify-popups-one-format.baseline.json");
const LABEL = "verify-popups-one-format";

const EXEMPT = new Set([
  "components/Modal.tsx",
  "components/parity/ParityDrawer.tsx",
  "components/Sidebar.tsx", // mobile nav backdrop, not a dialog
  "components/shared/CmdKQuickSwitcher.tsx", // command palette, not a dialog
  "components/safety/PhotoEvidenceViewer.tsx", // full-screen media viewer
  "pages/safety/DashcamViewerPage.tsx", // full-screen media viewer
  "components/dialogs/ConfirmDiscardDialog.tsx", // the unsaved-changes prompt <Modal> itself opens (part of the shell)
]);

const DECISION = /\b(void|cancel|reason|override|confirm|delete|discard|reject|remove|reverse|unmatch|unapply|write[ -]?off|suspend|terminate|deactivate)\b/i;
/** A catalog form that EDITS a reason list ("Create Termination Reason") is a form, not a decision. */
const FORM = /\b(create|edit|new|entry|add)\b/i;

/** Scan JSX opening tags `<Name ...>` (balanced braces/quotes) and return their attribute text. */
export function openingTags(src, name) {
  const out = [];
  const re = new RegExp(`<${name}(?=[\\s>/])`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + name.length + 1, depth = 0, q = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (q) { if (c === "\\") { i++; continue; } if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ index: m.index, attrs: src.slice(m.index + name.length + 1, i) });
  }
  return out;
}

export function titleText(attrs) {
  const m = attrs.match(/\btitle=(\{[\s\S]*?\}(?=\s+\w+=|\s*\/?$)|"[^"]*"|'[^']*')/);
  return m ? m[1] : "";
}

export function analyse(files, baseline) {
  const problems = [];
  const overlays = [];
  for (const [rel, src] of files) {
    if (/\.test\.|__tests__/.test(rel)) continue;
    if (/fixed inset-0/.test(src) && !EXEMPT.has(rel)) overlays.push(rel);
    for (const t of openingTags(src, "Modal")) {
      const title = titleText(t.attrs);
      // 443.295 — sizePreset md/lg/xl is the named review+decide width; only bare decision cards must be size="sm".
      const namedReview = /\bsizePreset=["'](md|lg|xl)["']/.test(t.attrs);
      if (title && DECISION.test(title) && !FORM.test(title) && !/\bsize="sm"/.test(t.attrs) && !namedReview) {
        const line = src.slice(0, t.index).split("\n").length;
        problems.push(`${rel}:${line} decision popup ${title.slice(0, 70)} is not size="sm" (owner 10-25: small popup, never page-wide)`);
      }
    }
  }
  for (const [rel, src] of files) {
    if (!rel.startsWith("pages/lists/") || /\.test\.|__tests__/.test(rel)) continue;
    for (const t of openingTags(src, "input")) {
      if (/\btype="(checkbox|radio|hidden|file|date|number)"/.test(t.attrs)) continue;
      if (/\bvalue=\{[^}]*?(?:\w+_code|\bcode|\w+Code)\b[^}]*\}/.test(t.attrs) && !/data-control-kind="code"/.test(t.attrs)) {
        const line = src.slice(0, t.index).split("\n").length;
        problems.push(`${rel}:${line} short-code field without data-control-kind="code" (owner design law rule 4: code box 104px)`);
      }
    }
  }
  const HAND_LABEL = /<label className="(?:block|flex flex-col gap-1) text-xs font-semibold text-(?:gray-600|\[#4B5563\])"/g;
  for (const [rel, src] of files) {
    if (!rel.startsWith("pages/lists/") || /\.test\.|__tests__/.test(rel)) continue;
    const n = (src.match(HAND_LABEL) || []).length;
    if (n) problems.push(`${rel}: ${n} hand-typed field label(s) — use FORM_LABEL_CLASS / FORM_LABEL_STACK_CLASS (one creator label style)`);
  }
  const base = new Set(baseline);
  for (const f of overlays) if (!base.has(f)) problems.push(`${f}: paints its own \`fixed inset-0\` overlay — use <Modal> (size="sm" for decisions) or <ParityDrawer>; new popup shells are refused`);
  for (const f of base) if (!overlays.includes(f)) problems.push(`${f}: no longer paints its own overlay — remove it from scripts/verify-popups-one-format.baseline.json (shrink-only)`);
  return { problems, overlays };
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.tsx$/.test(e.name)) acc.push([path.relative(SRC, p).split(path.sep).join("/"), fs.readFileSync(p, "utf8")]);
  }
  return acc;
}

function selftest() {
  const T = [];
  const t = (n, f) => { try { f(); T.push([n, true]); } catch (e) { T.push([n, false, e.message]); } };
  t("decision Modal without sm FAILS", () => {
    const r = analyse([["a.tsx", '<Modal open={o} title="Void check" onClose={c}>x</Modal>']], []);
    if (r.problems.length !== 1) throw new Error(r.problems.join("|"));
  });
  t("decision Modal with sm PASSES; translated title is read", () => {
    const r = analyse([["a.tsx", '<Modal open={o} size="sm" title={t("Cancel load")} onClose={() => { if (x > 1) c(); }}>x</Modal>']], []);
    if (r.problems.length) throw new Error(r.problems.join("|"));
  });
  t("catalog form editing a reason list is a form, not a decision", () => {
    const r = analyse([["a.tsx", '<Modal open title={isEdit ? "Edit Termination Reason" : "Create Termination Reason"} onClose={c}>x</Modal>']], []);
    if (r.problems.length) throw new Error(r.problems.join("|"));
  });
  t("form Modal at default size PASSES", () => {
    const r = analyse([["a.tsx", '<Modal open title="New vendor" onClose={c}>x</Modal>']], []);
    if (r.problems.length) throw new Error(r.problems.join("|"));
  });
  t("new hand-built overlay FAILS", () => {
    const r = analyse([["b.tsx", '<div className="fixed inset-0 z-50">']], []);
    if (!r.problems.some((p) => p.includes("new popup shells are refused"))) throw new Error(r.problems.join("|"));
  });
  t("baselined overlay PASSES; converted one left in the baseline FAILS", () => {
    if (analyse([["b.tsx", '<div className="fixed inset-0">']], ["b.tsx"]).problems.length) throw new Error("baselined should pass");
    if (!analyse([["b.tsx", "<Modal open title=\"x\" onClose={c}/>"]], ["b.tsx"]).problems.some((p) => p.includes("shrink-only"))) throw new Error("stale baseline escaped");
  });
  t("catalog code field without the 104px marker FAILS; marked PASSES", () => {
    if (!analyse([["pages/lists/x/A.tsx", '<input value={form.reason_code} onChange={(e) => set(e.target.value)} />']], []).problems.some((p) => p.includes("short-code"))) throw new Error("unmarked code escaped");
    if (analyse([["pages/lists/x/A.tsx", '<input data-control-kind="code" value={form.reason_code} />']], []).problems.length) throw new Error("marked failed");
  });
  t("hand-typed catalog label FAILS; the constant PASSES", () => {
    if (!analyse([["pages/lists/x/B.tsx", '<label className="block text-xs font-semibold text-gray-600">Name</label>']], []).problems.some((p) => p.includes("hand-typed field label"))) throw new Error("hand label escaped");
    if (analyse([["pages/lists/x/B.tsx", "<label className={FORM_LABEL_CLASS}>Name</label>"]], []).problems.length) throw new Error("constant failed");
  });
  t("exempt media viewer PASSES", () => {
    if (analyse([["components/Sidebar.tsx", '<div className="fixed inset-0">']], []).problems.length) throw new Error("exempt failed");
  });
  const bad = T.filter((x) => !x[1]);
  for (const [n, ok, e] of T) console.log(`  ${ok ? "PASS" : "FAIL"}  ${n}${e ? " — " + e : ""}`);
  console.log(`${LABEL} --selftest ${bad.length ? "FAIL" : "PASS"} ${T.length - bad.length}/${T.length}`);
  process.exit(bad.length ? 1 : 0);
}

const IS_MAIN = import.meta.url === `file://${process.argv[1]}`;
if (!IS_MAIN) { /* imported as a library (openingTags) */ }
else if (process.argv.includes("--selftest")) selftest();
else {
  const baseline = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")).overlays : [];
  const { problems, overlays } = analyse(walk(SRC), baseline);
  if (process.argv.includes("--print")) { console.log(JSON.stringify(overlays.sort(), null, 2)); process.exit(0); }
  console.log(`${LABEL}: hand-built overlays ${overlays.length} (baseline ${baseline.length}, shrink-only)`);
  if (problems.length) { console.error(`${LABEL} FAIL — ${problems.length}:\n  - ${problems.join("\n  - ")}`); process.exit(1); }
  console.log(`${LABEL} OK`);
}
