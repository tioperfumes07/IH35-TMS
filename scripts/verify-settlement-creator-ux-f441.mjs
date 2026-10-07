#!/usr/bin/env node
/**
 * SETL-F441 — Settlement Creator dense-form UX + miles wiring permanent locks.
 *
 * Owner 2026-10-07: "Showing the first 201" must not sit under Customer; StateSelect must be
 * filter Combobox chrome (no ▾); MoneyInput $ QBO-correct; discard dialog normal box not fullscreen;
 * loaded/empty miles from DB + route engine (hand-typed city geocoded).
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-settlement-creator-ux-f441";
const files = {
  entityPicker: "apps/frontend/src/components/EntityPicker.tsx",
  combobox: "apps/frontend/src/components/Combobox.tsx",
  stateSelect: "apps/frontend/src/components/forms/StateSelect.tsx",
  discard: "apps/frontend/src/components/dialogs/ConfirmDiscardDialog.tsx",
  moneyFrame: "apps/frontend/src/lib/single-frame-classname.ts",
  drawer: "apps/frontend/src/pages/settlements/SettlementCreatorDrawer.tsx",
};

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

function run(src) {
  const out = [];
  if (!src.entityPicker) return [`RULE 1: ${files.entityPicker} missing`];
  if (!src.combobox) return [`RULE 2: ${files.combobox} missing`];
  if (!src.stateSelect) return [`RULE 3: ${files.stateSelect} missing`];
  if (!src.discard) return [`RULE 4: ${files.discard} missing`];
  if (!src.drawer) return [`RULE 5: ${files.drawer} missing`];

  // Cap notice must not render above the Combobox in EntityPicker (under the field label).
  if (
    /serverSearch\s*\?\s*\(\s*<CappedListNotice/.test(src.entityPicker) ||
    /\{config\.serverSearch\s*\?\s*\(\s*[\s\S]{0,80}<CappedListNotice/.test(src.entityPicker)
  ) {
    out.push(
      "RULE 1: EntityPicker still renders CappedListNotice above the Combobox — that puts " +
        "'Showing the first N' under the Customer label. Move it into listCapNotice.",
    );
  }
  if (!/listCapNotice=\{serverCapNotice\}/.test(src.entityPicker) && !/listCapNotice=\{/.test(src.entityPicker)) {
    out.push("RULE 1b: EntityPicker must pass listCapNotice into Combobox (cap honesty inside open listbox only).");
  }
  if (!/listCapNotice\?:/.test(src.combobox) || !/combobox-list-cap-notice/.test(src.combobox)) {
    out.push("RULE 2: Combobox must accept listCapNotice and render it inside the open listbox portal.");
  }

  // StateSelect = Combobox size=sm, no ▾ caret button.
  if (!/from \"\.\.\/Combobox\"/.test(src.stateSelect) && !/from '\.\.\/Combobox'/.test(src.stateSelect)) {
    out.push("RULE 3: StateSelect must use Combobox (filter chrome), not a custom ▾ button.");
  }
  if (/▾/.test(src.stateSelect)) {
    out.push("RULE 3b: StateSelect still contains ▾ — remove the caret; match other filter dropdowns.");
  }
  if (!/size=\"sm\"/.test(src.stateSelect) && !/size='sm'/.test(src.stateSelect)) {
    out.push("RULE 3c: StateSelect Combobox must be size=\"sm\" (h-7) to match other form boxes.");
  }

  // Discard = fixed ~320px box, not w-full max-w-md / rounded-lg fullscreen feel.
  if (!/w-\[320px\]/.test(src.discard)) {
    out.push("RULE 4: ConfirmDiscardDialog must pin w-[320px] — normal dialog, not full-screen stretch.");
  }
  if (/w-full max-w-md/.test(src.discard) || /rounded-lg/.test(src.discard)) {
    out.push("RULE 4b: ConfirmDiscardDialog must not use w-full max-w-md / rounded-lg (reads as oversized).");
  }
  if (!/rounded-sm/.test(src.discard)) {
    out.push("RULE 4c: ConfirmDiscardDialog radius must be rounded-sm (SQUARE-EDGES LAW).");
  }

  // Money $ frame: padding stripped from single-frame layout.
  if (src.moneyFrame && !/p\(\?:\[xytblr\]\|ad\)\?/.test(src.moneyFrame) && !/pad\?/.test(src.moneyFrame)) {
    // Accept either the regex token we shipped or an explicit p[xytblr] strip.
    if (!/p(?:\[xytblr\]|ad)/.test(src.moneyFrame) && !/OUTER_FRAME_TOKEN[\s\S]{0,200}p\(/.test(src.moneyFrame)) {
      out.push("RULE 5: single-frame-classname must strip padding tokens so MoneyInput's absolute $ is not guttered.");
    }
  }
  if (!/moneyInputClass/.test(src.drawer) || !/geocodeSearch/.test(src.drawer) || !/cityGeocodeQueries/.test(src.drawer)) {
    out.push("RULE 6: SettlementCreatorDrawer must use moneyInputClass + cityGeocodeQueries (geocodeSearch) for miles.");
  }

  return out;
}

if (process.argv.includes("--selftest")) {
  const good = {
    entityPicker: `const serverCapNotice = config.serverSearch ? <CappedListNotice shown={1} limit={1} /> : null;
<Combobox listCapNotice={serverCapNotice} />`,
    combobox: `listCapNotice?: ReactNode;\ndata-testid="combobox-list-cap-notice"`,
    stateSelect: `import { Combobox } from "../Combobox";\n<Combobox size="sm" options={options} />`,
    discard: `className="w-[320px] max-w-[calc(100vw-2rem)] rounded-sm border border-[#E5E7EB] bg-white p-3 shadow-lg"`,
    moneyFrame: `const OUTER_FRAME_TOKEN = /^(?:border(?:-.+)?|rounded(?:-.+)?|bg-.+|ring(?:-.+)?|shadow(?:-.+)?|p(?:[xytblr]|ad)?(?:-.+)?)$/;`,
    drawer: `const moneyInputClass = "w-full";\nimport { geocodeSearch } from "...";\nconst cityGeocodeQueries = useQueries({...});`,
  };
  const bad = {
    entityPicker: `{config.serverSearch ? (<CappedListNotice shown={201} limit={200} hint="Type to search for a customer that is not listed." />) : null}\n<Combobox />`,
    combobox: `export function Combobox() {}`,
    stateSelect: `<button>State<span>▾</span></button>`,
    discard: `className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-4 shadow-2xl"`,
    moneyFrame: `const OUTER_FRAME_TOKEN = /^(?:border(?:-.+)?|rounded(?:-.+)?)$/;`,
    drawer: `className={inputClass}`,
  };
  const cases = [
    ["fixed tree passes", good, 0],
    ["catches old defects", bad, 11],
  ];
  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}\n  ${run(src).join("\n  ")}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run({
  entityPicker: read(files.entityPicker),
  combobox: read(files.combobox),
  stateSelect: read(files.stateSelect),
  discard: read(files.discard),
  moneyFrame: read(files.moneyFrame),
  drawer: read(files.drawer),
});
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(
  `${NAME}: PASS — EntityPicker cap inside listbox; StateSelect Combobox sm; discard 320px; MoneyInput $ frame; city geocode → miles.`,
);
