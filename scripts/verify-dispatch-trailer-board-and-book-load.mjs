#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leafRe":"^home\\.list$","task":"LINK-F5163-DISPATCH-BOARD-TRAILER"} */
/** @matrix-built {"modules":["dispatch"],"cols":["trailer"],"leafRe":"^(secondary\\.book_load|planning\\.reserve|dispatch\\.modal\\.book_load_modal_v4|dispatch\\.panel\\.(auth_gate|pre_dispatch_validation)|dispatch\\.parity\\.book_load_equipment_section)$","task":"LINK-F5163-DISPATCH-BOOK-LOAD-TRAILER"} */
/**
 * OWNER-EXECUTION-PLAN vertical trailer-column sweep (2026-08-14):
 * - home.list: DispatchBoard.tsx's "Trailer" column genuinely renders InlineTrailerPicker /
 *   EntityLink kind="trailer" per load row.
 * - secondary.book_load / planning.reserve / dispatch.modal.book_load_modal_v4 all resolve to the
 *   same BookLoadModalV4.tsx, which has real assigned_trailer_unit_id / load_trailer_equipment_id /
 *   trailer_type form fields, wired into its Auth-Gate and Pre-Dispatch-Validation panels via a real
 *   trailerUuid prop, and its Equipment section via a real trailer picker bound to
 *   load_trailer_equipment_id.
 *
 * Self-test: node scripts/verify-dispatch-trailer-board-and-book-load.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  board: "apps/frontend/src/pages/dispatch/DispatchBoard.tsx",
  bookLoad: "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx",
  authGate: "apps/frontend/src/components/dispatch/AuthGatePanel.tsx",
  preDispatch: "apps/frontend/src/components/dispatch/PreDispatchValidationPanel.tsx",
  equipmentSection: "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx",
};
const LABEL = "verify-dispatch-trailer-board-and-book-load";

export function audit(src) {
  const failures = [];
  if (!/<InlineTrailerPicker/.test(src.board)) {
    failures.push(`${FILES.board}: dispatch board Trailer column must render a real InlineTrailerPicker`);
  }
  if (!/\{ key: "trailer", header: "Trailer", cell: \(load\) => renderTrailerCell\(load\) \}/.test(src.board)) {
    failures.push(`${FILES.board}: dispatch board must wire the Trailer column into its real cell renderer`);
  }
  if (!/<EntityLinkOrTombstone[\s\S]{0,80}kind="trailer"[\s\S]{0,180}name=\{load\.trailer_number\}[\s\S]{0,60}noun="Trailer"/.test(src.board)) {
    failures.push(`${FILES.board}: nullable trailer fallback must use the unresolved-safe canonical drill`);
  }
  if (!/assigned_trailer_unit_id:\s*string/.test(src.bookLoad)) {
    failures.push(`${FILES.bookLoad}: Book Load must carry a real assigned_trailer_unit_id field`);
  }
  if (!/load_trailer_equipment_id:\s*string/.test(src.bookLoad)) {
    failures.push(`${FILES.bookLoad}: Book Load must carry a real load_trailer_equipment_id field`);
  }
  if (!/const assignedTrailerUnitId = form\.watch\("assigned_trailer_unit_id"\)/.test(src.bookLoad)) {
    failures.push(`${FILES.bookLoad}: Book Load must actually read the trailer field it declares, not just declare it`);
  }
  if (!/trailerUuid\?:\s*string/.test(src.authGate)) {
    failures.push(`${FILES.authGate}: Auth-Gate panel must accept a real trailerUuid prop`);
  }
  if (!/if \(props\.trailerUuid\) params\.set\("trailer_uuid", props\.trailerUuid\)/.test(src.authGate)) {
    failures.push(`${FILES.authGate}: Auth-Gate panel must forward the trailer id into its validation call`);
  }
  if (!/trailerUuid\?:\s*string \| null/.test(src.preDispatch)) {
    failures.push(`${FILES.preDispatch}: Pre-Dispatch-Validation panel must accept a real trailerUuid prop`);
  }
  if (!/if \(!watch \|\| !setValue \|\| watch\("load_trailer_equipment_id"\)\) return/.test(src.equipmentSection)) {
    failures.push(`${FILES.equipmentSection}: equipment section must read/write the real load_trailer_equipment_id field`);
  }
  return failures;
}

function loadSrc(root) {
  return Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(path.join(root, f), "utf8")]));
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    ["board-picker", "board", /<InlineTrailerPicker/g, "<span"],
    ["board-column", "board", /\{ key: "trailer", header: "Trailer", cell: \(load\) => renderTrailerCell\(load\) \}/g, '{ key: "trailer", header: "Trailer", cell: () => null }'],
    ["board-tombstone", "board", /name=\{load\.trailer_number\}/, "name={null}"],
    ["bookload-field-unit", "bookLoad", /assigned_trailer_unit_id:\s*string/, "assigned_trailer_unit_id_unused: string"],
    ["bookload-watch", "bookLoad", /const assignedTrailerUnitId = form\.watch\("assigned_trailer_unit_id"\)/, "const assignedTrailerUnitId = null"],
    ["authgate-prop", "authGate", /trailerUuid\?:\s*string/, "trailerUuid_unused?: string"],
    ["authgate-forward", "authGate", /if \(props\.trailerUuid\) params\.set\("trailer_uuid", props\.trailerUuid\)/, "// removed"],
    ["predispatch-prop", "preDispatch", /trailerUuid\?:\s*string \| null/, "trailerUuid_unused?: string | null"],
    ["equipment-watch", "equipmentSection", /if \(!watch \|\| !setValue \|\| watch\("load_trailer_equipment_id"\)\) return/, "if (true) return"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const mutated = { ...good, [key]: good[key].replace(pattern, replacement) };
    if (mutated[key] === good[key]) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: pattern did not match source, re-anchor`);
      process.exit(1);
    }
    if (audit(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — ${name}: mutation escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch board and Book Load's trailer wiring are real`);
