// verify-steps wrapper for scripts/verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create.mjs
// (accounting qbo_chrome batch 4 of 4 — the last 3 leaves of the module's full qbo_chrome
// completeness sweep this session), wired into CI for the first time per the standard Rule 37
// claim-then-author pattern, verify-step 4182. Static, no DB — same shape as sibling
// verify-steps/*.mjs files.
export default {
  name: "verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-qbo-chrome-toolbar-range-gear-and-expenses-create.mjs"]);
  },
};
