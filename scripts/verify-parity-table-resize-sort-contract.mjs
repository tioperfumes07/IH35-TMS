#!/usr/bin/env node
// Block 6 (GLOBAL-COLS-01) — ParityTable resize/sort framework contract guard.
//
// ParityTable is the shared QBO-parity list grammar; its column resize + sort ARE the "global
// column framework" every list surface inherits. This guard locks the hardened contract so a
// future edit can't silently regress it:
//   - resize handle stays reachable by MOUSE (drag), KEYBOARD (←/→ nudge), and TOUCH (tablet),
//     with a focusable a11y separator (before Block 6 it was mouse-only);
//   - resized widths persist (survive reload) and actually drive the column width;
//   - sortable columns keep a header sort toggle.
// Additive: pairs with the existing surface guard verify-tables-use-resizable-th (DB-5 lock) —
// that one checks WHICH surfaces render a resizable header; this one checks the shared component
// still HONORS the resize/sort contract.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LABEL = "verify-parity-table-resize-sort-contract";
const FILE = "apps/frontend/src/components/parity/ParityTable.tsx";
const abs = path.join(ROOT, FILE);
const src = fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : "";
const failures = [];

if (!src) {
  failures.push(`missing ${FILE}`);
} else {
  // Isolate the resize separator element (single occurrence) so handler checks are scoped to it.
  const sepStart = src.indexOf('role="separator"');
  const sepBlock = sepStart >= 0 ? src.slice(sepStart, sepStart + 700) : "";
  if (!sepBlock) failures.push('resize handle (role="separator") not found');
  if (!/onMouseDown=/.test(sepBlock)) failures.push("resize handle must keep the mouse-drag path (onMouseDown)");
  if (!/tabIndex=\{0\}/.test(sepBlock)) failures.push("resize handle must be keyboard-focusable (tabIndex={0})");
  if (!/onKeyDown=/.test(sepBlock)) failures.push("resize handle must support keyboard resize (onKeyDown)");
  if (!/onTouchStart=/.test(sepBlock)) failures.push("resize handle must support touch resize (onTouchStart)");

  // Keyboard nudge semantics + persistence + width application.
  if (!/ArrowLeft/.test(src) || !/ArrowRight/.test(src)) failures.push("keyboard resize must handle ArrowLeft/ArrowRight");
  if (!/savePersisted\(/.test(src)) failures.push("column widths must persist (savePersisted)");
  if (!/colWidths\[/.test(src)) failures.push("resized widths must drive the column width (colWidths)");

  // Sort toggle must remain for sortable columns.
  if (!/toggleSort\(/.test(src)) failures.push("sortable columns must render a header sort toggle (toggleSort)");
}

if (failures.length) {
  console.error(`${LABEL} — FAILED`);
  for (const m of failures) console.error(`- ${m}`);
  process.exit(1);
}
console.log(`${LABEL} — OK (resize mouse+keyboard+touch, width persistence, sort toggle locked)`);
