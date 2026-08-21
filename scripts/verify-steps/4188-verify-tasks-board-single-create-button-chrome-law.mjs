// verify-steps wrapper for scripts/verify-tasks-board-single-create-button-chrome-law.mjs
// (WAVE 2 tasks item-8 chrome-law audit per INBOX-CC-3.md "NO LEFTOVERS" correction, continuing
// forward from home: TaskBoardPage.tsx rendered its own redundant "+ Create Task" button + a second
// CreateTaskModal instance on top of TasksModuleTabs' already-shared one — removed the duplicate),
// verify-step 4188, Rule 37 claim-then-author pattern (claim shipped in #13420). Static, no DB —
// same shape as sibling verify-steps/*.mjs files.
export default {
  name: "verify-tasks-board-single-create-button-chrome-law",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tasks-board-single-create-button-chrome-law.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-tasks-board-single-create-button-chrome-law.mjs"]);
  },
};
