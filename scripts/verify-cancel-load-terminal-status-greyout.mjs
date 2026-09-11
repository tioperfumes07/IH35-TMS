#!/usr/bin/env node
/**
 * CANCEL LOAD GREY-OUT SCOPE (owner 2026-09-11): LoadDetailDrawer.tsx's canCancelPersistedLoad used
 * to only swap the danger "Cancel Load" button out once a load's status was ALREADY "cancelled" —
 * it stayed the live action on delivered/invoiced/paid/closed loads too, letting a dispatcher try to
 * cancel a load that has nothing left to cancel.
 *
 * This guard asserts CORRECTNESS, not presence: it checks that canCancelPersistedLoad is driven by
 * the SAME canonical office state machine (isTerminalLoadStatus, @ih35/shared-types) this session's
 * Dispatch open-only-scope fix (LST-F26137) already relies on for "post-delivery" — not a
 * hand-rolled status list that could silently drift out of sync with that box — and that the
 * correctness test file still contains real per-status assertions (terminal statuses swap Cancel
 * Load out for plain Close; delivered_pending_docs keeps it live).
 *
 * Self-testing static guard. Run: node scripts/verify-cancel-load-terminal-status-greyout.mjs [--selftest]
 */
import fs from "node:fs";

const FILES = {
  drawer: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx",
  drawerTest: "apps/frontend/src/components/dispatch/LoadDetailDrawer.test.tsx",
};

const originals = Object.fromEntries(Object.entries(FILES).map(([k, f]) => [k, fs.readFileSync(f, "utf8")]));

const contracts = [
  [
    "LoadDetailDrawer.tsx imports isTerminalLoadStatus from @ih35/shared-types (the shared office state machine, not a hand-rolled status list)",
    (files) => /import\s*\{[^}]*isTerminalLoadStatus[^}]*\}\s*from\s*"@ih35\/shared-types"/.test(files.drawer),
    (files) => ({
      ...files,
      drawer: files.drawer.replace(
        /import\s*\{([^}]*)isTerminalLoadStatus,?\s*([^}]*)\}\s*from\s*"@ih35\/shared-types";/,
        'import {$1$2} from "@ih35/shared-types";'
      ),
    }),
  ],
  [
    "canCancelPersistedLoad's DECLARATION calls isTerminalLoadStatus(load.status) — not just status !== \"cancelled\"",
    (files) =>
      /const canCancelPersistedLoad = Boolean\(load && !isTerminalLoadStatus\(load\.status\)\)/.test(files.drawer),
    (files) => ({
      ...files,
      drawer: files.drawer.replace(
        'const canCancelPersistedLoad = Boolean(load && !isTerminalLoadStatus(load.status));',
        'const canCancelPersistedLoad = Boolean(load && load.status !== "cancelled");'
      ),
    }),
  ],
  [
    "LoadDetailDrawer.test.tsx's it.each block asserts every terminal status (completed_docs_received/invoiced/paid/closed) swaps Cancel Load out for plain Close (correctness, not presence)",
    (files) => {
      const marker = 'it.each(["completed_docs_received", "invoiced", "paid", "closed"])(';
      const idx = files.drawerTest.indexOf(marker);
      if (idx === -1) return false;
      const block = files.drawerTest.slice(idx, idx + 1100);
      return (
        /CANCEL-GREYOUT/.test(files.drawerTest) &&
        /expect\(primary\)\.toHaveTextContent\("Close"\)/.test(block) &&
        /expect\(screen\.queryByRole\("button", \{ name: "Cancel Load" \}\)\)\.not\.toBeInTheDocument\(\)/.test(block)
      );
    },
    (files) => ({
      ...files,
      drawerTest: files.drawerTest.replace(
        'expect(screen.queryByRole("button", { name: "Cancel Load" })).not.toBeInTheDocument();\n    },\n  );\n\n  it("keeps Cancel Load live on delivered_pending_docs',
        '// REMOVED\n    },\n  );\n\n  it("keeps Cancel Load live on delivered_pending_docs'
      ),
    }),
  ],
  [
    "LoadDetailDrawer.test.tsx asserts delivered_pending_docs keeps Cancel Load live (an open, still-cancellable status per ALLOWED_TRANSITIONS -- proves the fix isn't over-broad)",
    (files) => {
      const marker = 'it("keeps Cancel Load live on delivered_pending_docs (still open per ALLOWED_TRANSITIONS)", () => {';
      const idx = files.drawerTest.indexOf(marker);
      if (idx === -1) return false;
      const block = files.drawerTest.slice(idx, idx + 800);
      return (
        /status: "delivered_pending_docs"/.test(block) &&
        /expect\(primary\)\.toHaveTextContent\("Cancel Load"\)/.test(block) &&
        /expect\(primary\.className\)\.toMatch\(\/border-crit\/\)/.test(block)
      );
    },
    (files) => ({
      ...files,
      drawerTest: files.drawerTest.replace(
        'status: "delivered_pending_docs"',
        'status: "completed_docs_received"'
      ),
    }),
  ],
];

function audit(files) {
  const errors = [];
  for (const [name, test] of contracts) {
    if (!test(files)) errors.push(name);
  }
  return errors;
}

const failures = audit(originals);
if (failures.length) {
  console.error(`[verify-cancel-load-terminal-status-greyout] FAILED\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}

if (process.argv.includes("--selftest")) {
  let caught = 0;
  for (const [name, test, mutate] of contracts) {
    const mutated = mutate(originals);
    if (JSON.stringify(mutated) === JSON.stringify(originals)) {
      throw new Error(`selftest mutate() was a no-op for: ${name}`);
    }
    if (!test(mutated)) caught += 1;
    else throw new Error(`selftest failed to catch: ${name}`);
  }
  console.log(`[verify-cancel-load-terminal-status-greyout] SELFTEST PASS — ${caught}/${contracts.length} mutations detected`);
  process.exit(0);
}

console.log(
  "[verify-cancel-load-terminal-status-greyout] OK — Cancel Load's grey-out condition is driven by the shared isTerminalLoadStatus office state machine (closed/settled/invoiced all swap it out, delivered_pending_docs stays live), correctness test present with per-status assertions intact"
);
