#!/usr/bin/env node
/**
 * LST-PICKER-03 — the "+ Create" affordance must live INSIDE the dropdown, not beside it.
 *
 * CostBreakdownBox's Section B item picker and its sub-row part picker were each a bare
 * SelectCombobox with a separate "+ Create" BUTTON next to it. The picker law (VERIFY-2 / §7) requires
 * inline create as the first row INSIDE the reference dropdown: an external button is a second place
 * to look, it is routinely missed on a dense line-item grid, and pressing it drops the operator out of
 * the row they were filling.
 *
 * Section A of the SAME component already used ReferenceSelect, so this was not a design question —
 * Section B and the part sub-row were simply never migrated, and the box shipped with two different
 * grammars for the same act.
 *
 * The guard matches on the SHAPE that is wrong — a create control rendered as a sibling <button> of a
 * picker — rather than on file names, so a seventh consumer written the same way is caught too.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const LABEL = "verify-inline-create-inside-picker";

/** Components whose pickers feed money/work-order line items — where this grammar matters most. */
const SCAN_DIRS = ["apps/frontend/src/components/forms", "apps/frontend/src/components/parity"];

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\/[^\n]*/g, " ");

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) {
      if (e === "node_modules" || e === "dist") continue;
      walk(full, out);
    } else if (e.endsWith(".tsx") && !e.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

/**
 * An external create control: a <button> whose visible text or aria-label is a create affordance AND
 * which sits in the same flex row as a picker. Detected as "quick create"/"+ Create" adjacent to a
 * SelectCombobox within one small window of markup.
 */
export function findExternalCreateButtons(src) {
  const clean = strip(src);
  const hits = [];
  const buttonRe = /aria-label="Quick create ([a-z]+)"/gi;
  let m;
  while ((m = buttonRe.exec(clean)) !== null) {
    // NEAREST PICKER WINS, rather than a fixed look-back distance. The first version used a 1200-char
    // window and found only 1 of the 3 real create buttons in CostBreakdownBox, because a picker with
    // a long inline onChange handler pushes its opening tag further back than any constant you pick.
    // Distance is the wrong question: what matters is which picker this button is a sibling OF.
    const before = clean.slice(0, m.index);
    const lastSelect = before.lastIndexOf("<SelectCombobox");
    const lastReference = before.lastIndexOf("<ReferenceSelect");
    if (lastSelect > lastReference) hits.push(m[1]);
  }
  return hits;
}

export function run() {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const offenders = [];
  for (const f of files) {
    const hits = findExternalCreateButtons(readFileSync(f, "utf8"));
    if (hits.length > 0) offenders.push(`${relative(ROOT, f)} (${hits.join(", ")})`);
  }

  if (files.length === 0) {
    return { ok: false, message: `${LABEL} FAIL: scanned ZERO files — the guard lost its subject.` };
  }

  const ok = offenders.length === 0;
  return {
    ok,
    scanned: files.length,
    message: ok
      ? `${LABEL} OK — ${files.length} form/parity component(s) scanned; no picker has a create control ` +
        `rendered beside it instead of inside it.`
      : `${LABEL} FAIL — ${offenders.length} picker(s) render "+ Create" as a SIBLING BUTTON instead of the ` +
        `first row inside the dropdown (VERIFY-2 / §7): ${offenders.join("; ")}. Use ReferenceSelect with ` +
        `addNewLabel so create happens without leaving the row.`,
  };
}

function selftest() {
  const clean = `
    <ReferenceSelect options={x} createKind="item" addNewLabel="+ Add new item" />
  `;
  if (findExternalCreateButtons(clean).length !== 0) {
    console.error("SELFTEST FAIL: a compliant ReferenceSelect was flagged.");
    process.exit(1);
  }
  console.log("  ok: ReferenceSelect with inline create is not flagged");

  // The exact shape that shipped in CostBreakdownBox before this fix.
  const offending = `
    <div className="flex items-center gap-1">
      <SelectCombobox value={v} onChange={f}>
        <option value="">Select product/service...</option>
      </SelectCombobox>
      <button type="button" onClick={g} aria-label="Quick create item">+ Create</button>
    </div>
  `;
  const caught = findExternalCreateButtons(offending);
  if (!caught.includes("item")) {
    console.error(`SELFTEST FAIL: the real pre-fix shape was NOT caught (got ${JSON.stringify(caught)})`);
    process.exit(1);
  }
  console.log("  caught: SelectCombobox + sibling '+ Create' button (the real pre-fix shape)");

  // A create button with NO picker beside it is a different control and must not be flagged.
  const standalone = `<button type="button" aria-label="Quick create item">+ Create</button>`;
  if (findExternalCreateButtons(standalone).length !== 0) {
    console.error("SELFTEST FAIL: a standalone create button with no adjacent picker was flagged.");
    process.exit(1);
  }
  console.log("  ok: a create button with no adjacent picker is out of scope");

  console.log("SELFTEST PASS — offending shape caught, compliant and out-of-scope shapes silent.");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
