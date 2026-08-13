#!/usr/bin/env node
/** @matrix-built {"modules":["home","tasks","fuel","dispatch","driver-hub","maintenance","safety","compliance","drivers","fleet","insurance","legal","eld","cash-flow","settlements","accounting","banking","factoring","finance","customers","vendors","inventory","form_425","lists","reports","docs","users","help","program","system"],"cols":["picker_law","qbo_chrome"],"leafRe":".*(create|modal|drawer|wizard).*","task":"CLS-NESTED-CREATOR-SUBMIT","vertical":"all-frontend-create-surfaces"} */
/**
 * GUARD: every modal/drawer <form> must intercept submit — no native GET.
 *
 * AUDIT-COVERAGE row 113 (dispatch · customer_picker, FAIL): Book Load's inline "+ Add new customer"
 * saved nothing. Root cause recorded in ParityDrawer.tsx:50-61 — the wizard wraps its body in <form>,
 * so an inline creator's <form> became a form nested in a form. The HTML5 parser DELETES a nested
 * <form> start tag, so the inner onSubmit never runs and its <button type="submit"> re-associates with
 * the OUTER wizard form, submitting THAT as a native GET (`?customer_type=…`) and closing the wizard as
 * if it had succeeded. Standalone /customers worked precisely because there is no outer form there.
 *
 * The fixes are in place (portal + preventDefault + stopPropagation). This guard is the ratchet that
 * stops the class returning: a create form that forgets to intercept looks like success and silently
 * loses the record — the worst failure shape there is.
 *
 * ASSERTS, per <form> opening tag under all frontend source: an `onSubmit` handler is present.
 * Two further rules on inline creators specifically, because preventDefault alone was NOT enough here:
 * they must also `stopPropagation` (React bubbles across the portal into the wizard's outer form).
 *
 * Run:  node scripts/verify-inline-create-forms-stop-native-submit.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/frontend/src");
const LABEL = "verify-inline-create-forms-stop-native-submit";

/** Files whose <form> is illustrative/among comments only, or which render no real create form. */
const NOT_A_CREATE_FORM = new Set([
  "apps/frontend/src/components/Modal.tsx", // generic shell; the word appears in a comment
  "apps/frontend/src/components/parity/ParityDrawer.tsx", // hosts the fix narrative in comments
]);

/**
 * KIND-SWEEP QUEUE — must remain empty. Creators may not defer React-portal interception.
 *
 * Row 113 was fixed on the two files that were reported (CreateDriverModal, CreateUnitModal). This
 * guard swept the class and found NINE MORE inline creators with the same latent shape: they call
 * preventDefault (so the browser will not navigate) but NOT stopPropagation — so when rendered inside
 * the Book Load wizard, React still bubbles the submit across the portal into the wizard's outer
 * <form>. That is the half of the defect that made row 113 look like success.
 *
 * The full source sweep is now drained; every discovered create Modal/Drawer blocks both browser
 * default submission and React propagation. New exceptions fail the build rather than joining a
 * deferred queue.
 */
const KIND_SWEEP_QUEUE = new Map();

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/** Return each <form ...> opening tag body found in the (comment-stripped) source. */
export function formTags(code) {
  const tags = [];
  const re = /<form\b/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    const end = code.indexOf(">", m.index);
    tags.push(code.slice(m.index, end === -1 ? m.index + 400 : end + 1));
  }
  return tags;
}

export function collectProblems(files) {
  const problems = [];
  let formCount = 0;
  let creatorCount = 0;
  for (const { rel, src } of files) {
    if (NOT_A_CREATE_FORM.has(rel)) continue;
    const code = strip(src);
    const tags = formTags(code);
    formCount += tags.length;
    for (const tag of tags) {
      if (!/onSubmit/.test(tag)) {
        problems.push(
          `${rel}: a <form> has no onSubmit handler. Nested inside the Book Load wizard's outer <form> this ` +
            `submits natively (GET) and silently discards the record — AUDIT-COVERAGE row 113.`
        );
      }
    }
    // Inline creators rendered inside the wizard need stopPropagation too, not just preventDefault.
    const isInlineCreator = /Modal|Drawer/.test(path.basename(rel)) && /Create|New|Add/.test(path.basename(rel));
    if (isInlineCreator && tags.length > 0) {
      creatorCount += 1;
      const queued = KIND_SWEEP_QUEUE.has(rel);
      const clean = code.includes("preventDefault") && code.includes("stopPropagation");
      if (!clean && !queued) {
        problems.push(
          `${rel}: inline creator form does not both preventDefault AND stopPropagation. React bubbles submit ` +
            `ACROSS the modal portal into the wizard's outer <form>; preventDefault alone does not stop that ` +
            `(see CreateUnitModal). Fix it, or add it to KIND_SWEEP_QUEUE with a reason.`
        );
      }
      if (clean && queued) {
        problems.push(`${rel}: now intercepts both — remove it from KIND_SWEEP_QUEUE so the sweep cannot slip back.`);
      }
    }
  }
  if (files.length > 100 && formCount < 86) problems.push(`frontend form inventory shrank to ${formCount}; audit removals before lowering the ratchet`);
  if (files.length > 100 && creatorCount < 21) problems.push(`nested creator inventory shrank to ${creatorCount}; audit removals before lowering the ratchet`);
  if (KIND_SWEEP_QUEUE.size !== 0) problems.push("KIND_SWEEP_QUEUE must remain empty — nested creator submit defects cannot be deferred");
  return problems;
}

function readTree() {
  return walk(DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const good = `<form onSubmit={(e)=>{e.preventDefault();e.stopPropagation();}}>`;
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    { name: "form with no onSubmit is caught", files: [mk("apps/frontend/src/components/x/Foo.tsx", "<form className='a'>")], expectAtLeast: 1 },
    { name: "creator missing stopPropagation is caught", files: [mk("apps/frontend/src/components/x/CreateFooModal.tsx", "<form onSubmit={(e)=>{e.preventDefault();}}>")], expectAtLeast: 1 },
    { name: "creator with both passes", files: [mk("apps/frontend/src/components/x/CreateFooModal.tsx", good)], expect: 0 },
    { name: "commented-out form is ignored", files: [mk("apps/frontend/src/components/x/Bar.tsx", "// <form>\nconst a=1;")], expect: 0 },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.files ?? readTree());
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(DIR)) {
    console.error(`${LABEL}: FAIL — ${DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  return 0;
}

process.exit(main());
