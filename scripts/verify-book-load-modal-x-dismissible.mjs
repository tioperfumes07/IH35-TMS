#!/usr/bin/env node
/**
 * GUARD — the Book Load modal's header X must dismiss, and must respect unsaved work.
 *
 * STALE-ASSERTION FIX (2026-08-08). This guard used to require two literals:
 *
 *   onClick={handleBookLoadHeaderClose}
 *   const handleBookLoadHeaderClose ... attemptBookLoadClose()
 *
 * Both are gone, and the guard has FAILED on tip-main ever since — while the X worked perfectly. The modal
 * was refactored to the shared `<ModalCloseButton onClose={...} />` (which fires `onClose()` on click), so a
 * bespoke header handler is no longer needed. The guard was pinned to an implementation DETAIL — one
 * function's name — instead of the behaviour, so a good refactor reddened it.
 *
 * It is exempt in .guard-exempt.json and wired into no verify-step, so it never ran in CI and nobody saw it
 * rot. Wiring it as written would have failed CI on correct code, and the "fix" would have been to tear out
 * the shared component and re-inline a one-off handler — a regression, enforced by a guard.
 *
 * WHAT ACTUALLY MATTERS, and is asserted now:
 *   1. the header renders a close affordance at all;
 *   2. it is wired to `attemptBookLoadClose` — the handler that checks `isDirty` before closing — and NOT
 *      to a raw dismiss that would silently discard a half-filled load;
 *   3. `attemptBookLoadClose` still consults dirty state rather than closing unconditionally.
 * Either wiring form is accepted (shared component `onClose=` or a direct `onClick=`), because which one is
 * used is a refactor decision, not a contract.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const LABEL = "verify-book-load-modal-x-dismissible";
const REL = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

export function audit(src) {
  const problems = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  const closeAffordance =
    /<ModalCloseButton[\s\S]{0,200}?onClose=\{([A-Za-z_$][\w$]*)\}/.exec(code) ||
    /onClick=\{([A-Za-z_$][\w$]*)\}[^>]{0,120}aria-label="Close"/.exec(code);

  if (!closeAffordance) {
    problems.push(
      `${REL}: no header close affordance found (neither <ModalCloseButton onClose={…}/> nor an ` +
        `aria-label="Close" onClick). The modal would be dismissable only by Esc or backdrop.`,
    );
    return problems;
  }

  const handler = closeAffordance[1];
  if (handler !== "attemptBookLoadClose") {
    problems.push(
      `${REL}: the header close is wired to \`${handler}\`, not \`attemptBookLoadClose\`. The X must go ` +
        `through the dirty-state check, or a half-filled load is discarded without a prompt.`,
    );
  }

  // Window-based, not indent-based: an earlier version required the body to end with "\n  }" (two-space
  // indent). That matched the real file and nothing else, so the guard's own selftest fixtures failed while
  // production code passed — a guard that only works on one formatting style is a guard that will break on
  // the next prettier run.
  const attempt = /const attemptBookLoadClose[\s\S]{0,400}/.exec(code);
  if (!attempt) {
    problems.push(`${REL}: attemptBookLoadClose not found — refusing to pass vacuously.`);
    // Require `isDirty` in the BODY, not merely in the useCallback dependency array — a bare /isDirty/
    // test passed even with the guard clause deleted (my own selftest caught that). But enumerating
    // operators (`if (isDirty`, `isDirty &&`, `isDirty ?`) was ALSO wrong: the real code reads
    // `const needsConfirm = isDirty || overrideReason...`, so that list produced a FALSE POSITIVE on
    // correct code. Stripping the dependency array and asking whether isDirty is still referenced states
    // the actual requirement without dictating how the condition is written.
  } else if (!/isDirty/.test(attempt[0].replace(/\}\s*,\s*\[[\s\S]*?\]\s*\)/g, ""))) {
    problems.push(
      `${REL}: attemptBookLoadClose no longer consults \`isDirty\`; the X would discard unsaved work silently.`,
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `
    <ModalCloseButton title="Book load" onClose={attemptBookLoadClose} className="h-6" />
    const attemptBookLoadClose = useCallback(() => {
      if (isDirty) { setConfirmOpen(true); return; }
      finalizeBookLoadClose();
    }, [isDirty]);
  `;
  const cases = [
    ["wired to the dirty-guarded handler", good, 0],
    ["THE STALE ASSERTION'S TARGET — direct onClick form is equally valid", good.replace('<ModalCloseButton title="Book load" onClose={attemptBookLoadClose} className="h-6" />', '<button aria-label="Close" onClick={attemptBookLoadClose} />').replace(/onClick=\{attemptBookLoadClose\} \/>/, 'onClick={attemptBookLoadClose} aria-label="Close" />'), 0],
    ["X bypasses the dirty check", good.replace("onClose={attemptBookLoadClose}", "onClose={onClose}"), 1],
    ["no close affordance at all", good.replace(/<ModalCloseButton[^>]*\/>/, ""), 1],
    ["attemptBookLoadClose stops checking isDirty", good.replace("if (isDirty) { setConfirmOpen(true); return; }", ""), 1],
  ];
  let bad = 0;
  for (const [name, src, want] of cases) {
    const got = audit(src).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      bad++;
    }
  }
  if (bad) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} cases`);
  process.exit(0);
}

const problems = audit(readFileSync(resolve(process.cwd(), REL), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — the Book Load modal X contract is broken:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — header X dismisses through attemptBookLoadClose, which respects unsaved work.`);
process.exit(0);
