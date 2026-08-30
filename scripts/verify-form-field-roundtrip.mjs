#!/usr/bin/env node
/**
 * C9 — NO RENDERED FIELD IS DROPPED ON SAVE (form field → payload round-trip contract).
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * A field is RENDERED on a create/edit form. The operator fills it in and presses save. The value
 * is silently discarded because it never reaches the submit payload. There is no error, no warning,
 * no disabled state — the operator believes the data is stored. For a carrier this is the worst UI
 * class in the product: it fabricates a record of something that was never recorded. An accident
 * report whose "Record Type" always says "Accident", a booked load whose "Driver pay rate / mi" the
 * dispatcher typed and the load never carries, a work order whose tax rate is invented at render
 * time — each one is an evidence record that lies, and nothing in the app ever says so.
 *
 * QuickBooks, NetSuite, McLeod and Alvys all hold the same contract: a field you can type into is a
 * field that persists, and a field that cannot persist yet is rendered read-only with the reason
 * stated. That contract is what this guard enforces.
 *
 * WHAT IT ASSERTS — three independent detectors, each narrow and each stated
 * -------------------------------------------------------------------------
 * D1 DEAD CONTROL — a form control whose change handler is a literal no-op (`onChange={() => {}}`,
 *    `() => undefined`, `() => null`, `noop`). The operator cannot even change it; the value on the
 *    wire is whatever the JSX hardcoded. Allowed ONLY when the control is inert-by-declaration
 *    (readOnly / disabled) AND carries the NOT-PERSISTED annotation below.
 *
 * D2 ORPHAN FIELD STATE — a `useState` bound as the `value`/`checked` of a form control (or whose
 *    setter IS the control's change handler), rendered INSIDE a form surface (`<form>`, `<Modal>`,
 *    `<ParityDrawer>`, `<CreateDrawer>`), whose getter never reaches any submit payload in the file.
 *
 * D3 DROPPED react-hook-form FIELD — a field NAME registered/rendered through react-hook-form
 *    (`register("x")`, `<Controller name="x">`, `setValue("x", …)`, `dataField="x"`, or a literal
 *    `{ field: "x" }` toggle table fed to `register`) that never appears in the submit payload the
 *    form's own writer call builds. Child sections that receive `register`/`setValue` are part of
 *    the same form group, so a field rendered in `BookLoadEquipmentSection` is judged against
 *    `BookLoadModalV4`'s payload.
 *
 * DELIBERATELY CONSERVATIVE (stated so nobody "widens it later" by accident, and nobody silences it)
 * ---------------------------------------------------------------------------------------------
 * The payload side is an OVER-approximation on purpose: a value counts as reaching the server if it
 * is reachable from ANY write-shaped call — an `api/` writer import, `.mutate`/`.mutateAsync`,
 * `useMutation`, an `onSubmit` handler body, `apiRequest`/`fetch`, a hook-provided mutator
 * (`createDispute(...)`), or a `client.create(...)` member call — following local `const` bindings,
 * function bodies, and object mutation (`body.x = value`, `rows.push(value)`, `Object.assign`).
 * A guard about SILENT DATA LOSS must never cry wolf, so anything with a plausible path to the wire
 * is cleared. The consequence is that this guard reports a LOWER BOUND; per-form residue is named
 * in the PR's REMAINING section rather than hidden in an allowlist.
 *
 * Query/filter parameters are NOT claimed: a value reachable from a `useQuery` call or from a
 * `.filter/.some/.find/.includes` expression is consumed by the UI or sent as a query parameter —
 * it is not a persisted field, so a search box is not this defect class.
 *
 * Controls OUTSIDE a form surface are not claimed by D2: list-page filter bars, sort pickers and
 * pagination are real controls whose state is not supposed to be saved.
 *
 * THE ESCAPE HATCH IS HONESTY, NOT SILENCE
 * ----------------------------------------
 * Some rendered fields have nowhere to land: the column does not exist and the migration is
 * owner-applied (financial-cluster / HELD). ADDITIVE-ONLY forbids deleting the field. The honest
 * resolution — and the only one this guard accepts — is to render it INERT and SAY SO:
 *
 *     readOnly (or disabled) + the annotation token `C9-NOT-PERSISTED` on the element or in a comment
 *     immediately above it, naming exactly what is missing.
 *
 * The second, narrower hatch is `C9-CARRIED-THROUGH`: the control is transient and its own change
 * handler pushes the operator's entry into another field that IS in the payload. Nothing is lost, so
 * the control need not be inert — but the claim must be written down at the site, because a reviewer
 * has to be able to check it. If the entry lands in the WRONG SHAPE (an id flattened into a memo
 * string instead of an FK) that is defect class C13 — reported there, never silenced here.
 *
 * `C9-SUBMISSION-GATE` is narrower still: an acknowledgement is intentionally transient, but its
 * state must gate a real submit control AND drive a rendered disabled reason. The annotation alone
 * never excuses a field; both effects are proved from the same getter.
 *
 * Annotations are read from the RAW source, so the reason can be an ordinary comment.
 *
 * An annotated field is counted, listed under BLOCKED, and does NOT fail the build — but the count
 * is a RATCHET: it may shrink, never grow. Adding a new unsaveable field fails.
 *
 *   node scripts/verify-form-field-roundtrip.mjs
 *   node scripts/verify-form-field-roundtrip.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = "apps/frontend/src";
const LABEL = "verify-form-field-roundtrip";

/**
 * Annotations. Both are looked up in the RAW source (comments included) at the same byte offsets —
 * `blankComments` preserves offsets exactly — so the REASON lives where a developer would naturally
 * write it: a comment at the field.
 *
 *   C9-NOT-PERSISTED   the field has nowhere to land (owner-gated column/endpoint). The control MUST
 *                      also be readOnly/disabled: the UI stops claiming it captured something.
 *   C9-CARRIED-THROUGH the control is transient, and its own change handler carries the operator's
 *                      entry into another field that IS in the payload (a picker that appends a note
 *                      line, a picker that also sets the label the payload sends). Nothing is lost.
 *                      If it lands in the WRONG SHAPE — an id flattened into a memo string instead of
 *                      an FK — that is defect class C13, reported there, never silenced here.
 */
export const NOT_PERSISTED = "C9-NOT-PERSISTED";
export const CARRIED_THROUGH = "C9-CARRIED-THROUGH";
export const SUBMISSION_GATE = "C9-SUBMISSION-GATE";

function provesSubmissionGate(src, getter) {
  const escaped = getter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const disabledUsesState = new RegExp(`\\bdisabled\\s*=\\s*\\{[\\s\\S]{0,1200}?\\b${escaped}\\b`).test(src);
  const reasonDecl = [...src.matchAll(/\bconst\s+([A-Za-z_$][\w$]*(?:DisabledReason|BlockReason))\s*=/g)]
    .find((match) => new RegExp(`\\b${escaped}\\b`).test(sliceStatement(src, match.index)));
  const reasonRendered = reasonDecl
    ? new RegExp(`\\{\\s*${reasonDecl[1]}\\s*\\}`).test(src.slice(reasonDecl.index + reasonDecl[0].length))
    : false;
  return disabledUsesState && reasonRendered;
}

/**
 * Ratchet: how many rendered fields may currently be inert-and-annotated because the column /
 * endpoint is owner-gated. This number may only ever go DOWN. Raising it requires the owner to have
 * applied the migration and the field to have been wired — at which point the number drops instead.
 */
// C9 wire PR: every previously blocked field is persisted (HOLD migrations 160/170/180).
// Budget may only shrink — never raise this number.
export const BLOCKED_BUDGET = 0;

// =================================================================================================
// source utilities
// =================================================================================================

/**
 * Blank `//` and block comments, preserving every byte offset and newline so line numbers and
 * slices stay exact. Required because this guard's own contract text quotes the very patterns it
 * forbids (`onChange={() => {}}`), and because the fixed call sites explain the fix in comments
 * that name the payload keys. A guard must judge executable code, never prose.
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
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) {
        out += source[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Slice from `start` (which must be the opening char) through its balanced close, quote-aware. */
export function sliceBalanced(src, start, open, close) {
  let depth = 0;
  let str = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === open) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return src.slice(start);
}

/** Slice one statement's right-hand side: to the first depth-0 `;` or unbalanced closer. */
export function sliceStatement(src, start) {
  let depth = 0;
  let str = null;
  let i = start;
  for (; i < src.length; i++) {
    const c = src[i];
    if (str) {
      if (c === "\\") {
        i += 1;
        continue;
      }
      if (c === str) str = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      str = c;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") {
      depth += 1;
      continue;
    }
    if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth -= 1;
      continue;
    }
    if (c === ";" && depth === 0) break;
  }
  return src.slice(start, i);
}

export const lineOf = (src, index) => src.slice(0, index).split("\n").length;

const identsOf = (text) => new Set([...text.matchAll(/[A-Za-z_$][\w$]*/g)].map((m) => m[0]));

// =================================================================================================
// JSX helpers
// =================================================================================================

/** Tags that are FORM CONTROLS — the operator types/selects into them. */
const FIELD_TAG_EXACT = new Set([
  "input",
  "textarea",
  "select",
  "Combobox",
  "SelectCombobox",
  "ReferenceSelect",
  "EntityPicker",
  "DatePicker",
  "MoneyInput",
  "TotalsStack",
  "UploadZone",
  "DriverPickerWithCreate",
  "InlineUnitPicker",
  "InlineTrailerPicker",
  "TwoSectionLineEditor",
]);
const FIELD_TAG_SUFFIX =
  /(Picker|Select|Combobox|Input|Field|Editor|Checkbox|Radio|Switch|Toggle|TextArea|Textarea|Upload|Money)$/;

export function isFieldTag(tag) {
  return FIELD_TAG_EXACT.has(tag) || FIELD_TAG_SUFFIX.test(tag);
}

/** Surfaces that mean "this is a form the operator submits", not list chrome. */
const SURFACE_TAGS = ["form", "Modal", "ParityDrawer", "CreateDrawer", "QuickCreateEntityModal"];

/** Byte spans of every form surface in a file. Nested same-name surfaces are handled. */
export function formSurfaceSpans(src) {
  const spans = [];
  for (const tag of SURFACE_TAGS) {
    for (const m of src.matchAll(new RegExp(`<${tag}(?=[\\s/>])`, "g"))) {
      let depth = 0;
      let str = null;
      let tagEnd = -1;
      let selfClose = false;
      for (let i = m.index; i < src.length; i++) {
        const c = src[i];
        if (str) {
          if (c === "\\") {
            i += 1;
            continue;
          }
          if (c === str) str = null;
          continue;
        }
        if (c === '"' || c === "'" || c === "`") {
          str = c;
          continue;
        }
        if (c === "{") {
          depth += 1;
          continue;
        }
        if (c === "}") {
          depth -= 1;
          continue;
        }
        if (depth === 0 && c === ">") {
          selfClose = src[i - 1] === "/";
          tagEnd = i;
          break;
        }
      }
      if (tagEnd < 0) continue;
      if (selfClose) {
        spans.push([m.index, tagEnd]);
        continue;
      }
      const openN = new RegExp(`<${tag}(?=[\\s/>])`, "g");
      const closeN = new RegExp(`</${tag}\\s*>`, "g");
      let level = 1;
      let cursor = tagEnd + 1;
      let end = src.length;
      while (level > 0) {
        closeN.lastIndex = cursor;
        openN.lastIndex = cursor;
        const close = closeN.exec(src);
        if (!close) break;
        const open = openN.exec(src);
        if (open && open.index < close.index) {
          level += 1;
          cursor = open.index + 1;
          continue;
        }
        level -= 1;
        cursor = close.index + 1;
        end = close.index + close[0].length;
      }
      spans.push([m.index, end]);
    }
  }
  return spans;
}

/** Walk backwards from a JSX attribute to the opening tag that owns it. */
export function owningTag(src, attrIndex) {
  let depth = 0;
  for (let i = attrIndex - 1; i >= 0; i--) {
    const c = src[i];
    if (c === "}") {
      depth += 1;
      continue;
    }
    if (c === "{") {
      if (depth === 0) return null;
      depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (c === ">") return null;
    if (c === "<") {
      const m = /^<\s*([A-Za-z_$][\w$.]*)/.exec(src.slice(i, i + 96));
      if (!m) return null;
      let j = i;
      let str = null;
      let braces = 0;
      for (; j < src.length; j++) {
        const ch = src[j];
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
        if (ch === "{") {
          braces += 1;
          continue;
        }
        if (ch === "}") {
          braces -= 1;
          continue;
        }
        if (braces === 0 && ch === ">") break;
      }
      return { tag: m[1], attrs: src.slice(i, j + 1), start: i };
    }
  }
  return null;
}

/**
 * Like `owningTag`, but tolerant of JSX expression containers: `{...register("x")}` sits inside a
 * `{ … }`, so the strict walker (which stops at an unmatched `{`, correct for a plain attribute)
 * would never find the `<input>` that owns the spread.
 */
export function enclosingTag(src, index) {
  let depth = 0;
  for (let i = index - 1; i >= 0; i--) {
    const c = src[i];
    if (c === "}") {
      depth += 1;
      continue;
    }
    if (c === "{") {
      if (depth > 0) depth -= 1;
      continue;
    }
    if (depth > 0) continue;
    if (c === ">") return null;
    if (c === "<") return owningTag(src, i + 2);
  }
  return null;
}

/**
 * Inert-by-declaration: the UI itself tells the operator the value is not being taken. Covers the
 * plain DOM props and the repo's own explicit read-only MODE props (`taxRateMode="readonly"` on
 * TotalsStack), because a component that declares itself read-only is no less honest than an input
 * that carries `readOnly`.
 */
export function isInert(attrs) {
  if (/\b(?:[A-Za-z]*[Mm]ode)\s*=\s*["']readonly["']/.test(attrs)) return true;
  return /\breadOnly\b(?!\s*=\s*\{\s*false)|\bdisabled\b(?!\s*=\s*\{\s*false)/.test(attrs);
}

// =================================================================================================
// payload reachability
// =================================================================================================

const READ_PREFIX = /^(list|get|fetch|search|count|use[A-Z])/;
const API_WRITE_PREFIX =
  /^(create|open|update|patch|save|post|add|submit|record|book|assign|upsert|delete|void|apply|send|import|generate|spawn|link|attach|mark|approve|reject|resolve|register|file|request|confirm|cancel|complete|finalize|remove|reopen|release|revoke|restore|archive|activate|deactivate|renew|pay|adjust|reclass|acknowledge|escalate|transfer|merge|hold|forfeit|dispute|sync|convert|issue|log)/;
/** camelCase verb + Capital — hook mutators and local submit helpers, never a React setter. */
const LOCAL_WRITE_CALL =
  /\b((?:create|open|update|patch|save|submit|post|upsert|delete|void|apply|send|record|book|assign|spawn|issue|register|confirm|approve|reject|remove|archive|activate|deactivate|renew|pay|adjust|reclass|generate|import|convert|complete|finalize|resolve|escalate|acknowledge|attach|link|mark|log|file|request|sync|transfer|merge|hold|release|forfeit|dispute|verify|do|handle|perform|run|persist|commit|write|push|add|insert)[A-Z][\w$]*)\s*\(/g;
/** `client.create(...)`, `catalogClient.update(...)` — a writer reached through an object. */
const MEMBER_WRITE_CALL = /\.\s*(?:create|update|patch|save|remove|destroy|post|put|upsert|del|void)\s*\(/g;

/**
 * Names bound to the react-hook-form instance. They must NOT be expanded when judging D3: the
 * `useForm({ defaultValues: { … } })` literal names EVERY field, so following `form` would make
 * every field look like it reaches the payload — the exact fake-green this guard exists to prevent.
 */
export function useFormBindings(src) {
  const dropped = new Set();
  for (const m of src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*|\{[^}]*\})\s*(?::[^=;]+)?=\s*useForm\s*[<(]/g)) {
    const target = m[1];
    if (target.startsWith("{")) {
      for (const nm of target.matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) dropped.add(nm[2] || nm[1]);
    } else dropped.add(target);
  }
  return dropped;
}

/** Names bound to a zod schema — a schema NAMES every field but SENDS none. */
export function zodSchemaBindings(src) {
  const dropped = new Set();
  for (const m of src.matchAll(/\b(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=;]+)?=\s*z\s*\./g)) dropped.add(m[1]);
  return dropped;
}

/**
 * Blank the FIELD-NAME STRING inside react-hook-form addressing calls, preserving byte length.
 * `form.watch("driver_pay_rate_per_mile")` proves the field is READ, never that it is SENT; leaving
 * the literal in the reachable text would clear the very field this guard exists to catch.
 */
export function sanitizeRhfAddressing(src) {
  return src.replace(
    /\b(watch|register|setValue|getValues|setError|clearErrors|getFieldState|trigger|resetField|unregister)(\s*\(\s*)(["'])([\w.]+)\3/g,
    (_all, fn, gap, quote, name) => `${fn}${gap}${quote}${"_".repeat(name.length)}${quote}`
  );
}

/** Everything a value can flow through on its way to a write. */
export function buildFlow(src, drop = new Set()) {
  const defs = new Map();
  const addDef = (name, text) => defs.set(name, `${defs.get(name) ?? ""}\n${text}`);

  for (const m of src.matchAll(
    /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*|\{[^}]*\}|\[[^\]]*\])\s*(?::[^=;]+)?=\s*/g
  )) {
    const rhs = sliceStatement(src, m.index + m[0].length);
    const target = m[1];
    if (target.startsWith("{") || target.startsWith("[")) {
      for (const nm of target.matchAll(/([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/g)) {
        addDef(nm[2] || nm[1], rhs);
      }
    } else addDef(target, rhs);
  }
  for (const m of src.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)) {
    const brace = src.indexOf("{", m.index + m[0].length);
    if (brace > 0) addDef(m[1], sliceBalanced(src, brace, "{", "}"));
  }
  // Object mutation is how most payloads in this repo are assembled conditionally.
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*(?:\.[A-Za-z_$][\w$]*|\[[^\]]*\])\s*=\s*(?!=)/g)) {
    addDef(m[1], sliceStatement(src, m.index + m[0].length));
  }
  for (const m of src.matchAll(/\b([A-Za-z_$][\w$]*)\s*\.\s*(?:push|unshift|concat|set|add)\s*\(/g)) {
    addDef(m[1], sliceBalanced(src, m.index + m[0].length - 1, "(", ")"));
  }
  for (const m of src.matchAll(/\bObject\s*\.\s*assign\s*\(\s*([A-Za-z_$][\w$]*)\s*,/g)) {
    addDef(m[1], sliceBalanced(src, src.indexOf("(", m.index), "(", ")"));
  }

  for (const name of drop) defs.delete(name);

  const closure = (text) => {
    const seen = new Set();
    const stack = [...identsOf(text)];
    while (stack.length > 0) {
      const name = stack.pop();
      if (seen.has(name)) continue;
      seen.add(name);
      const def = defs.get(name);
      if (def) for (const next of identsOf(def)) if (!seen.has(next)) stack.push(next);
    }
    return seen;
  };
  /** The concatenated TEXT of everything reachable — so a payload KEY can be matched, not just a token. */
  const reachableText = (text) => {
    let out = text;
    for (const name of closure(text)) {
      const def = defs.get(name);
      if (def) out += `\n${def}`;
    }
    return out;
  };
  return { defs, closure, reachableText };
}

/** Concatenated argument text of everything that puts data on the wire. */
export function submitText(src) {
  const apiWriters = new Set();
  for (const m of src.matchAll(/import\s*(?:type\s+)?\{([^}]*)\}\s*from\s*["']([^"']+)["']/g)) {
    if (!/(^|\/)api(\/|$)/.test(m[2])) continue;
    for (const piece of m[1].split(",")) {
      const raw = piece.trim();
      if (!raw || /^type\s/.test(raw)) continue;
      const name = raw.split(/\s+as\s+/).pop().trim();
      if (name && API_WRITE_PREFIX.test(name) && !READ_PREFIX.test(name)) apiWriters.add(name);
    }
  }
  let primary = "";
  const addArgs = (re, into) => {
    let text = into;
    for (const m of src.matchAll(re)) text += `${sliceBalanced(src, m.index + m[0].length - 1, "(", ")")}\n`;
    return text;
  };
  for (const w of apiWriters) primary = addArgs(new RegExp(`\\b${w}\\s*\\(`, "g"), primary);
  primary = addArgs(/\.\s*mutateAsync\s*\(/g, primary);
  primary = addArgs(/\.\s*mutate\s*\(/g, primary);
  primary = addArgs(/\buseMutation\s*\(/g, primary);
  for (const m of src.matchAll(/\bonSubmit\s*=\s*\{/g)) {
    primary += `${sliceBalanced(src, m.index + m[0].length - 1, "{", "}")}\n`;
  }
  if (!primary.trim()) return "";
  // Secondary paths only widen an already-qualified form file.
  let extra = "";
  extra = addArgs(LOCAL_WRITE_CALL, extra);
  extra = addArgs(MEMBER_WRITE_CALL, extra);
  extra = addArgs(/\bapiRequest\s*\(/g, extra);
  extra = addArgs(/\bfetch\s*\(/g, extra);
  extra = addArgs(/\bhandleSubmit\s*\(/g, extra);
  return `${primary}\n${extra}`;
}

/** Values consumed as query/filter parameters — used, not discarded. */
export function filterText(src) {
  let text = "";
  const patterns = [
    /\buseQuery\s*\(/g,
    /\buseInfiniteQuery\s*\(/g,
    /\.\s*(?:filter|some|every|find|findIndex|includes|startsWith|indexOf)\s*\(/g,
  ];
  for (const re of patterns) {
    for (const m of src.matchAll(re)) text += `${sliceBalanced(src, m.index + m[0].length - 1, "(", ")")}\n`;
  }
  return text;
}

/**
 * Query controls commonly stage operator text (`draftQ`) and copy it into an applied state
 * (`searchQ`) only on Enter/Apply. The applied getter appears in useQuery; the draft getter appears
 * only inside `setSearchQ(draftQ.trim())`. Follow that state-to-state edge transitively so an Apply
 * search box is not misclassified as a persisted form field merely because it lives in a drawer
 * that also contains a real mutation form.
 */
export function filterStateClosure(src, closure) {
  const consumed = new Set(closure(filterText(src)));
  const states = [...src.matchAll(
    /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState/g
  )].map((m) => ({ getter: m[1], setter: m[2] }));

  let changed = true;
  while (changed) {
    changed = false;
    for (const target of states) {
      if (!consumed.has(target.getter)) continue;
      const setterCall = new RegExp(`\\b${target.setter}\\s*\\(`, "g");
      for (const call of src.matchAll(setterCall)) {
        const args = sliceBalanced(src, call.index + call[0].length - 1, "(", ")");
        for (const name of closure(args)) {
          if (consumed.has(name)) continue;
          consumed.add(name);
          changed = true;
        }
      }
    }
  }
  return consumed;
}

// =================================================================================================
// detectors
// =================================================================================================

const NOOP_HANDLER = /^\{\(?[\w,\s:]*\)?=>(?:\{\}|undefined|null|void0)\}$/;

/**
 * Annotation lookup over the RAW source. `blankComments` preserves byte offsets, so the tag's span
 * maps 1:1 onto the original text; the window before the tag lets the reason be a comment line
 * written directly above the field, which is where a reviewer will look for it.
 */
export const ANNOTATION_LOOKBACK = 1000;
export function annotationAt(raw, start, end, token) {
  return raw.slice(Math.max(0, start - ANNOTATION_LOOKBACK), end + 1).includes(token);
}

/** D1 — a control the operator cannot change and whose value the JSX invented. */
export function findDeadControls(rel, src, raw = src) {
  const problems = [];
  const blocked = [];
  for (const m of src.matchAll(/\bon(?:Change|ValueChange|Input)\s*=\s*\{/g)) {
    const body = sliceBalanced(src, m.index + m[0].length - 1, "{", "}");
    const norm = body.replace(/\s+/g, "");
    if (!(NOOP_HANDLER.test(norm) || norm === "{noop}")) continue;
    const owner = owningTag(src, m.index);
    if (!owner) continue;
    const where = `${rel}:${lineOf(src, m.index)}`;
    const end = owner.start + owner.attrs.length;
    if (annotationAt(raw, owner.start, end, NOT_PERSISTED) && isInert(owner.attrs)) {
      blocked.push(`${where}  <${owner.tag}> inert + ${NOT_PERSISTED}`);
      continue;
    }
    if (annotationAt(raw, owner.start, end, CARRIED_THROUGH)) {
      blocked.push(`${where}  <${owner.tag}> ${CARRIED_THROUGH}`);
      continue;
    }
    problems.push(
      `${where}  <${owner.tag}> change handler is a no-op ${norm} — the operator cannot change it and ` +
        `the rendered value is whatever the JSX hardcoded. Wire it, or make it readOnly/disabled and ` +
        `annotate ${NOT_PERSISTED}.`
    );
  }
  return { problems, blocked };
}

/** D2 — operator-editable state, inside a form surface, that never reaches the wire. */
export function findOrphanFieldState(rel, src, raw = src) {
  const problems = [];
  const blocked = [];
  const payload = submitText(src);
  if (!payload.trim()) return { problems, blocked, isForm: false };
  const { closure } = buildFlow(src);
  const PAYLOAD = closure(payload);
  const FILTERS = filterStateClosure(src, closure);
  const spans = formSurfaceSpans(src);
  const inSurface = (i) => spans.some(([a, b]) => i >= a && i <= b);

  const handlers = [];
  for (const m of src.matchAll(/\bon([A-Z][\w]*)\s*=\s*\{/g)) {
    const attr = `on${m[1]}`;
    if (!/Change$/.test(attr)) continue;
    if (!inSurface(m.index)) continue;
    handlers.push({ attr, index: m.index, body: sliceBalanced(src, m.index + m[0].length - 1, "{", "}") });
  }

  for (const m of src.matchAll(
    /\bconst\s*\[\s*([A-Za-z_$][\w$]*)\s*,\s*(set[A-Za-z_$][\w$]*)\s*\]\s*=\s*useState/g
  )) {
    const getter = m[1];
    const setter = m[2];
    if (PAYLOAD.has(getter) || FILTERS.has(getter)) continue;
    const setterRe = new RegExp(`\\b${setter}\\b`);
    const boundRe = new RegExp(`\\b(?:value|checked|defaultValue)\\s*=\\s*\\{[^}]*\\b${getter}\\b`);
    for (const h of handlers) {
      if (!setterRe.test(h.body)) continue;
      const owner = owningTag(src, h.index);
      if (!owner || !isFieldTag(owner.tag)) continue;
      const direct = h.body.replace(/[{}\s]/g, "") === setter;
      if (!direct && !boundRe.test(owner.attrs)) continue;
      const where = `${rel}:${lineOf(src, h.index)}`;
      const tagEnd = owner.start + owner.attrs.length;
      const marked = (token) =>
        annotationAt(raw, owner.start, tagEnd, token) || annotationAt(raw, m.index, m.index + 1, token);
      if (marked(NOT_PERSISTED) && isInert(owner.attrs)) {
        blocked.push(`${where}  <${owner.tag}> '${getter}' inert + ${NOT_PERSISTED}`);
        break;
      }
      if (marked(CARRIED_THROUGH)) {
        blocked.push(`${where}  <${owner.tag}> '${getter}' ${CARRIED_THROUGH}`);
        break;
      }
      if (marked(SUBMISSION_GATE) && provesSubmissionGate(src, getter)) break;
      problems.push(
        `${where}  <${owner.tag} ${h.attr}> field state '${getter}' (declared L${lineOf(src, m.index)}) ` +
          `never reaches a submit payload — the operator's entry is silently discarded.`
      );
      break;
    }
  }
  return { problems, blocked, isForm: true };
}

/**
 * A `setValue("x", …)` is only evidence that `x` IS a control when it sits in the change handler of
 * a form control AND that handler writes exactly ONE field. A handler that writes several is
 * choosing a canonical id and mirroring derived labels (`customer_id` + `customer_display_name`);
 * a chrome guard must not decide which of those the product intends to persist, so it claims none
 * of them and they are named in the PR's REMAINING section instead of being silenced here.
 */
export function setValueControlFields(src) {
  const out = [];
  for (const m of src.matchAll(/\bon([A-Z][\w]*)\s*=\s*\{/g)) {
    if (!/Change/.test(m[1])) continue;
    const owner = owningTag(src, m.index);
    if (!owner || !isFieldTag(owner.tag)) continue;
    const body = sliceBalanced(src, m.index + m[0].length - 1, "{", "}");
    const names = [...new Set([...body.matchAll(/\bsetValue\??\s*\(\s*["']([\w.]+)["']/g)].map((x) => x[1]))];
    if (names.length !== 1) continue;
    out.push([names[0], m.index]);
  }
  return out;
}

/**
 * Resolve `register(toggle.field)` — the field NAMES live in a local literal array of
 * `{ field: "x", label: "…" }`. Naming of the array and of the map variable varies, so every local
 * array literal in the file is inspected for the property the register call reads. A checkbox row
 * generated from a table is still a rendered field.
 */
function resolveIndirectRegisters(src, into, where, raw = src) {
  const props = new Set([...src.matchAll(/\bregister\s*\(\s*[A-Za-z_$][\w$]*\.(\w+)\s*[,)]/g)].map((m) => m[1]));
  if (props.size === 0) return;
  for (const decl of src.matchAll(/\b(?:const|let)\s+[A-Za-z_$][\w$]*\s*(?::[^=;]+)?=\s*\[/g)) {
    const open = src.indexOf("[", decl.index);
    const arr = sliceBalanced(src, open, "[", "]");
    for (const prop of props) {
      for (const fm of arr.matchAll(new RegExp(`\\b${prop}\\s*:\\s*["']([\\w.]+)["']`, "g"))) {
        const name = fm[1];
        if (into.has(name)) continue;
        // Offset of THIS row, not of the array — so the annotation and the inert marker are read at
        // the row that names the field. A generated control declares itself inert with an explicit
        // `disabled: true` on its own row, which is what the renderer must then honour.
        const at = open + fm.index;
        const rowStart = arr.lastIndexOf("{", fm.index);
        const row = rowStart >= 0 ? sliceBalanced(arr, rowStart, "{", "}") : "";
        into.set(name, {
          where: `${where}:${lineOf(src, at)}`,
          src,
          raw,
          index: at,
          owner: null,
          inert: /\bdisabled\s*:\s*true\b/.test(row),
        });
      }
    }
  }
}

/** D3 — a react-hook-form field name rendered somewhere in the form group but never submitted. */
export function findDroppedRhfFields(rel, src, group, raw = src) {
  const problems = [];
  const blocked = [];
  // The RHF payload test is deliberately STRICTER than D2's. Two things would otherwise fake-green
  // every field: the `useForm({ defaultValues: { … } })` literal (names every field) and the zod
  // schema (`z.object({ city: … })`, also names every field). Neither is evidence that the value is
  // SENT. So: RHF addressing strings are blanked, useForm/zod bindings are not followed, and
  // membership requires the name to appear as a property access or an object KEY on the way out.
  const flowSrc = sanitizeRhfAddressing(src);
  const payload = sanitizeRhfAddressing(submitText(src));
  if (!payload.trim()) return { problems, blocked };
  const drop = new Set([...useFormBindings(src), ...zodSchemaBindings(flowSrc)]);
  const { reachableText } = buildFlow(flowSrc, drop);
  const payloadBody = reachableText(payload);

  const rendered = new Map();
  for (const g of [{ rel, src, raw }, ...group]) {
    const gRaw = g.raw ?? g.src;
    const note = (name, index) => {
      // A readOnly/disabled control is not operator-entered, so its value cannot be "the operator's
      // entry silently discarded" — e.g. the auto-derived Class field (§7 locked, always readOnly).
      const owner = enclosingTag(g.src, index);
      const inert = Boolean(owner && isInert(owner.attrs));
      if (inert && !annotationAt(gRaw, owner.start, owner.start + owner.attrs.length, NOT_PERSISTED)) return;
      if (!rendered.has(name)) {
        rendered.set(name, { where: `${g.rel}:${lineOf(g.src, index)}`, src: g.src, raw: gRaw, index, owner, inert });
      }
    };
    for (const m of g.src.matchAll(/\bregister\s*\(\s*["']([\w.]+)["']/g)) note(m[1], m.index);
    for (const m of g.src.matchAll(/<Controller[\s\S]{0,240}?\bname\s*=\s*\{?["']([\w.]+)["']/g)) note(m[1], m.index);
    for (const m of g.src.matchAll(/\bdataField\s*=\s*["']([\w.]+)["']/g)) note(m[1], m.index);
    for (const [name, index] of setValueControlFields(g.src)) note(name, index);
    resolveIndirectRegisters(g.src, rendered, g.rel, gRaw);
  }

  for (const [name, info] of rendered) {
    const base = name.split(".")[0];
    const sent = new RegExp(`\\.${base}\\b|\\b${base}\\s*:|["']${base}["']\\s*[:,\\]]`).test(payloadBody);
    if (sent) continue;
    const start = info.owner ? info.owner.start : info.index;
    const end = info.owner ? info.owner.start + info.owner.attrs.length : info.index;
    // (info.inert is set from the element for a direct register, from the row for a generated one.)
    if (info.inert && annotationAt(info.raw, start, end, NOT_PERSISTED)) {
      blocked.push(`${info.where}  RHF "${name}" inert + ${NOT_PERSISTED}`);
      continue;
    }
    if (annotationAt(info.raw, start, end, CARRIED_THROUGH)) {
      blocked.push(`${info.where}  RHF "${name}" ${CARRIED_THROUGH}`);
      continue;
    }
    problems.push(
      `${info.where}  react-hook-form field "${name}" is rendered but never appears in the ` +
        `${path.basename(rel)} submit payload — the operator's entry is silently discarded.`
    );
  }
  return { problems, blocked };
}

// =================================================================================================
// tree scan
// =================================================================================================

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      walk(p, out);
    } else if (entry.name.endsWith(".tsx") && !entry.name.includes(".test.")) out.push(p);
  }
  return out;
}

export function scanTree(root) {
  const base = path.join(root, SRC);
  const files = walk(base);
  const problems = [];
  const blocked = [];
  let formFiles = 0;

  for (const abs of files) {
    const rel = path.relative(root, abs);
    const raw = fs.readFileSync(abs, "utf8");
    const src = blankComments(raw);

    const dead = findDeadControls(rel, src, raw);
    problems.push(...dead.problems);
    blocked.push(...dead.blocked);

    const orphan = findOrphanFieldState(rel, src, raw);
    problems.push(...orphan.problems);
    blocked.push(...orphan.blocked);
    if (orphan.isForm) formFiles += 1;

    if (/\buseForm\s*[<(]/.test(src)) {
      const group = [];
      for (const m of src.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
        const child = path.resolve(path.dirname(abs), `${m[1]}.tsx`);
        if (!fs.existsSync(child)) continue;
        const craw = fs.readFileSync(child, "utf8");
        const csrc = blankComments(craw);
        if (!/\bregister\s*\(|\bsetValue\??\s*\(|UseFormRegister|UseFormSetValue/.test(csrc)) continue;
        group.push({ rel: path.relative(root, child), src: csrc, raw: craw });
      }
      const rhf = findDroppedRhfFields(rel, src, group, raw);
      problems.push(...rhf.problems);
      blocked.push(...rhf.blocked);
    }
  }
  return { problems, blocked, formFiles, fileCount: files.length };
}

// =================================================================================================
// selftest — every assertion is proven capable of failing before the real tree is judged
// =================================================================================================

const CONTROL_CLEAN = `
import { useState } from "react";
import { createThing } from "../api/things";
import { Modal } from "../components/Modal";
export function CleanForm() {
  const [name, setName] = useState("");
  const [search, setSearch] = useState("");
  const rows = useQuery({ queryKey: ["x", search], queryFn: () => listThings({ search }) });
  const body = { name };
  const save = () => { void createThing(body); };
  return (
    <Modal open title="+ Create Thing" onClose={close}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={search} onChange={(e) => setSearch(e.target.value)} />
      <button onClick={save}>Save</button>
    </Modal>
  );
}
`;

function selftest() {
  const failures = [];
  const expectClean = (label, res) => {
    if (res.problems.length > 0) failures.push(`${label}: expected NO finding, got ${res.problems.join(" | ")}`);
  };
  const expectHit = (label, res, needle) => {
    if (!res.problems.some((p) => p.includes(needle))) {
      failures.push(`${label}: expected a finding containing "${needle}", got ${res.problems.length ? res.problems.join(" | ") : "none"}`);
    }
  };

  // --- D2 -----------------------------------------------------------------------------------
  const clean = blankComments(CONTROL_CLEAN);
  expectClean("D2 control: wired field is not flagged", findOrphanFieldState("clean.tsx", clean));

  const appliedSearch = blankComments(`
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ParityDrawer } from "../components/ParityDrawer";
export function AppliedSearchDrawer() {
  const [draftQ, setDraftQ] = useState("");
  const [searchQ, setSearchQ] = useState("");
  useQuery({ queryKey: ["rows", searchQ], queryFn: () => listRows({ q: searchQ }) });
  const save = useMutation({ mutationFn: () => createThing({ name: "x" }) });
  return (<ParityDrawer open onClose={close}>
    <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} />
    <button onClick={() => setSearchQ(draftQ.trim())}>Apply search</button>
  </ParityDrawer>);
}
`);
  expectClean(
    "D2 control: draft state carried into an applied useQuery state is a filter",
    findOrphanFieldState("applied-search.tsx", appliedSearch)
  );

  const planted = blankComments(
    CONTROL_CLEAN.replace(
      `      <input value={name} onChange={(e) => setName(e.target.value)} />`,
      `      <input value={name} onChange={(e) => setName(e.target.value)} />\n` +
        `      <input value={memo} onChange={(e) => setMemo(e.target.value)} />`
    ).replace(`  const [name, setName] = useState("");`, `  const [name, setName] = useState("");\n  const [memo, setMemo] = useState("");`)
  );
  expectHit("D2 plant: rendered-but-dropped field is caught", findOrphanFieldState("planted.tsx", planted), "'memo'");

  // the same dropped field, annotated + inert, is BLOCKED not FAILED
  const annotated = blankComments(
    CONTROL_CLEAN.replace(
      `      <input value={name} onChange={(e) => setName(e.target.value)} />`,
      `      <input value={name} onChange={(e) => setName(e.target.value)} />\n` +
        `      <input readOnly value={memo} data-c9="${NOT_PERSISTED} memo column pending" onChange={(e) => setMemo(e.target.value)} />`
    ).replace(`  const [name, setName] = useState("");`, `  const [name, setName] = useState("");\n  const [memo, setMemo] = useState("");`)
  );
  const annotatedRes = findOrphanFieldState("annotated.tsx", annotated);
  expectClean("D2 annotated: inert + annotation does not fail", annotatedRes);
  if (annotatedRes.blocked.length !== 1) failures.push("D2 annotated: expected exactly 1 BLOCKED entry");

  // classifier controls — each of these must NOT be claimed
  const filterOnly = blankComments(`
import { useState } from "react";
import { createThing } from "../api/things";
export function ListPage() {
  const [statusFilter, setStatusFilter] = useState("open");
  const save = () => { void createThing({}); };
  return (<div><select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} /></div>);
}
`);
  expectClean("D2 control: a filter OUTSIDE a form surface is not claimed", findOrphanFieldState("filter.tsx", filterOnly));

  const mutatedBody = blankComments(`
import { useState } from "react";
import { patchUnit } from "../api/mdata";
import { Modal } from "../components/Modal";
export function StatusModal() {
  const [soldTo, setSoldTo] = useState("");
  const submit = async () => {
    const body = {};
    body.sold_to = soldTo;
    await patchUnit(id, body);
  };
  return (<Modal open onClose={close}><input value={soldTo} onChange={(e) => setSoldTo(e.target.value)} /></Modal>);
}
`);
  expectClean("D2 control: value reaching the payload via object mutation is not claimed", findOrphanFieldState("mut.tsx", mutatedBody));

  const hookMutator = blankComments(`
import { useState } from "react";
import { Modal } from "../components/Modal";
export function DisputeModal() {
  const { createDispute } = useDisputes();
  const [why, setWhy] = useState("");
  async function handleSubmit() { await createDispute({ description: why }); }
  return (<Modal open onClose={close}><textarea value={why} onChange={(e) => setWhy(e.target.value)} /></Modal>);
}
`);
  if (findOrphanFieldState("hook.tsx", hookMutator).problems.length > 0) {
    failures.push("D2 control: a hook-provided mutator must count as a submit path");
  }

  const busyFlag = blankComments(`
import { useState } from "react";
import { addPhoto } from "../api/safety";
import { Modal } from "../components/Modal";
export function Photos() {
  const [uploading, setUploading] = useState(false);
  return (<Modal open onClose={close}><input type="file" onChange={(e) => { setUploading(true); void addPhoto(e.target.files[0]); }} /></Modal>);
}
`);
  expectClean("D2 control: a busy flag with no value binding is not a field", findOrphanFieldState("busy.tsx", busyFlag));

  const commented = blankComments(`
import { useState } from "react";
import { createThing } from "../api/things";
import { Modal } from "../components/Modal";
export function Commented() {
  const [ghost, setGhost] = useState("");
  const submit = () => createThing({ ghost });
  // <input value={ghost} onChange={(e) => setGhost(e.target.value)} />
  return (<Modal open onClose={close} />);
}
`);
  expectClean("D2 control: commented-out JSX is not judged", findOrphanFieldState("comment.tsx", commented));

  // --- D1 -----------------------------------------------------------------------------------
  const deadSrc = blankComments(`
export function D() {
  return (<Combobox options={[]} value={"accident"} onChange={() => {}} />);
}
`);
  expectHit("D1 plant: a no-op change handler is caught", findDeadControls("dead.tsx", deadSrc), "no-op");

  const deadOk = blankComments(`
export function D() {
  return (<Combobox disabled data-c9="${NOT_PERSISTED} record_type column pending" options={[]} value={"accident"} onChange={() => {}} />);
}
`);
  const deadOkRes = findDeadControls("deadok.tsx", deadOk);
  expectClean("D1 annotated: inert + annotation does not fail", deadOkRes);
  if (deadOkRes.blocked.length !== 1) failures.push("D1 annotated: expected exactly 1 BLOCKED entry");

  const liveHandler = blankComments(`
export function D() {
  return (<Combobox options={[]} value={v} onChange={(next) => setV(next ?? "")} />);
}
`);
  expectClean("D1 control: a real handler is not a no-op", findDeadControls("live.tsx", liveHandler));

  // --- D3 -----------------------------------------------------------------------------------
  const rhfClean = blankComments(`
import { useForm } from "react-hook-form";
import { createLoad } from "../api/dispatch";
export function BookForm() {
  const form = useForm({ defaultValues: { commodity: "", requires_tarps: false } });
  const submit = form.handleSubmit(async (values) => {
    await createLoad({ commodity: values.commodity, requires_tarps: values.requires_tarps });
  });
  return (<form onSubmit={submit}><input {...form.register("commodity")} /><input {...form.register("requires_tarps")} /></form>);
}
`);
  expectClean("D3 control: a submitted RHF field is not flagged", findDroppedRhfFields("rhf.tsx", rhfClean, []));

  const rhfDropped = blankComments(
    rhfClean.replace(`<input {...form.register("requires_tarps")} />`, `<input {...form.register("requires_tarps")} /><input {...form.register("requires_straps")} />`)
  );
  expectHit("D3 plant: an unsubmitted RHF field is caught", findDroppedRhfFields("rhf.tsx", rhfDropped, []), '"requires_straps"');

  const childSrc = blankComments(`
export function Section({ register }) {
  const toggles = [{ field: "requires_straps", label: "Straps" }];
  return (<div>{toggles.map((t) => (<input key={t.field} type="checkbox" {...register(t.field)} />))}</div>);
}
`);
  expectHit(
    "D3 plant: a field registered indirectly in a CHILD section is caught",
    findDroppedRhfFields("rhf.tsx", rhfClean, [{ rel: "child.tsx", src: childSrc }]),
    '"requires_straps"'
  );

  const rhfAnnotated = blankComments(
    rhfClean.replace(
      `<input {...form.register("requires_tarps")} />`,
      `<input {...form.register("requires_tarps")} />{/* x */}<input readOnly data-c9="${NOT_PERSISTED} column pending" {...form.register("requires_straps")} />`
    )
  );
  const rhfAnnRes = findDroppedRhfFields("rhf.tsx", rhfAnnotated, []);
  if (rhfAnnRes.problems.some((p) => p.includes("requires_straps"))) {
    failures.push("D3 annotated: an annotated RHF field must not fail");
  }

  // --- annotations ------------------------------------------------------------------------------
  // The reason must be writable as a COMMENT (offsets are preserved, so the raw text is searched).
  const commentAnnotated = `
export function D() {
  return (
    <>
      {/* ${NOT_PERSISTED}: record_type column does not exist on safety.accident_reports. */}
      <Combobox disabled options={[]} value={"accident"} onChange={() => {}} />
    </>
  );
}
`;
  const commentRes = findDeadControls("c.tsx", blankComments(commentAnnotated), commentAnnotated);
  expectClean("annotation: a COMMENT above an inert control satisfies the hatch", commentRes);
  if (commentRes.blocked.length !== 1) failures.push("annotation: comment-annotated control must be counted as BLOCKED");

  // …but only when the control is actually inert. An annotation on a LIVE control is still a lie.
  const commentLive = commentAnnotated.replace("<Combobox disabled", "<Combobox");
  expectHit(
    "annotation: an annotation on a still-live control does NOT excuse it",
    findDeadControls("c.tsx", blankComments(commentLive), commentLive),
    "no-op"
  );

  const carried = `
import { useState } from "react";
import { createInvoice } from "../api/accounting";
import { Modal } from "../components/Modal";
export function Inv() {
  const [notes, setNotes] = useState("");
  const [refCustomerId, setRefCustomerId] = useState(null);
  const save = () => createInvoice({ notes });
  return (
    <Modal open onClose={close}>
      {/* ${CARRIED_THROUGH}: the pick is appended to Notes by this handler and the picker resets. */}
      <ReferenceSelect value={refCustomerId} onChange={(next) => { setNotes(next); setRefCustomerId(null); }} />
    </Modal>
  );
}
`;
  const carriedRes = findOrphanFieldState("carried.tsx", blankComments(carried), carried);
  expectClean("annotation: CARRIED-THROUGH clears a transient picker", carriedRes);
  if (carriedRes.blocked.length !== 1) failures.push("annotation: carried-through control must be counted as BLOCKED");

  const carriedMissing = carried.replace(`{/* ${CARRIED_THROUGH}: the pick is appended to Notes by this handler and the picker resets. */}`, "");
  expectHit(
    "annotation: without the CARRIED-THROUGH claim the same transient picker IS flagged",
    findOrphanFieldState("carried.tsx", blankComments(carriedMissing), carriedMissing),
    "'refCustomerId'"
  );

  const submissionGate = `
import { useState } from "react";
import { createDriver } from "../api/drivers";
import { Modal } from "../components/Modal";
export function Driver() {
  const [acknowledged, setAcknowledged] = useState(false);
  const saveDisabledReason = !acknowledged ? "Acknowledge the policy before Save." : undefined;
  const save = () => createDriver({ first_name: "TEST" });
  return <Modal open onClose={close}>
    {/* ${SUBMISSION_GATE}: transient acknowledgement gates Save and renders its disabled reason. */}
    <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
    <button disabled={!acknowledged} onClick={save}>Save</button>
    {saveDisabledReason ? <p>{saveDisabledReason}</p> : null}
  </Modal>;
}`;
  expectClean(
    "annotation: proven transient submission gate is not a dropped field",
    findOrphanFieldState("submission-gate.tsx", blankComments(submissionGate), submissionGate),
  );
  const gateWithoutReason = submissionGate.replace("{saveDisabledReason ? <p>{saveDisabledReason}</p> : null}", "");
  expectHit(
    "annotation: submission gate without a rendered reason still fails",
    findOrphanFieldState("submission-gate.tsx", blankComments(gateWithoutReason), gateWithoutReason),
    "'acknowledged'",
  );

  // --- machinery ------------------------------------------------------------------------------
  if (owningTag(blankComments(`<Foo bar={1} onChange={x} />`), 18)?.tag !== "Foo") {
    failures.push("machinery: owningTag must resolve the tag that owns an attribute");
  }
  if (formSurfaceSpans(blankComments(`<Modal a><Modal b>x</Modal></Modal>`)).length !== 2) {
    failures.push("machinery: nested same-name surfaces must both be spanned");
  }
  if (!isInert(`<input readOnly value={x} />`) || isInert(`<input value={x} />`)) {
    failures.push("machinery: isInert must distinguish readOnly from a live input");
  }
  if (!isInert(`<TotalsStack taxRateMode="readonly" />`) || isInert(`<TotalsStack taxRateMode="editable" />`)) {
    failures.push("machinery: isInert must honour an explicit read-only MODE prop, and only that");
  }

  if (failures.length > 0) {
    console.error(`[${LABEL}] SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    // Hard exit, not a returned status: a selftest that collects failures and lets a caller decide
    // is one refactor away from the fake-green pattern verify-selftests-can-fail exists to stop.
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest OK — 28 assertions, every detector proven capable of failing.`);
  return 0;
}

// =================================================================================================
// main
// =================================================================================================

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const { problems, blocked, formFiles, fileCount } = scanTree(ROOT);
  console.log(`[${LABEL}] scanned ${fileCount} .tsx files; ${formFiles} carry a submit payload.`);
  if (blocked.length > 0) {
    console.log(`[${LABEL}] BLOCKED (${blocked.length}/${BLOCKED_BUDGET}) — rendered inert + ${NOT_PERSISTED}, owner-gated column/endpoint:`);
    for (const b of blocked) console.log(`  · ${b}`);
  }
  if (blocked.length > BLOCKED_BUDGET) {
    console.error(
      `[${LABEL}] FAIL — ${blocked.length} inert-and-annotated fields exceeds the ratchet budget ${BLOCKED_BUDGET}. ` +
        `This number may only shrink: wire the field, do not add another one that cannot be saved.`
    );
    return 1;
  }
  if (problems.length > 0) {
    console.error(`[${LABEL}] FAIL — ${problems.length} rendered field(s) dropped on save:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return 1;
  }
  console.log(`[${LABEL}] PASS — every rendered form field reaches its submit payload or is inert and annotated.`);
  return 0;
}

process.exitCode = main();
