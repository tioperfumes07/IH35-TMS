// verify-steps wrapper for scripts/verify-quicksave-assignment-method-check-constraint.mjs
// (Dispatch U6 item 1/3, secondary.assignments:picker_law — live-reproduced 2026-08-21 via
// INBOX-CC-3.md's Save->reload verification: every inline row-level Unit/Trailer/Driver assignment
// on the Dispatch load board 500'd. Root-caused to a CHECK constraint on
// dispatch.load_assignment_history that never allowed the 3 "inline_quicksave_*" method values
// quicksave.service.ts writes. Fixed via an additive constraint extension, migration 202612941300),
// verify-step 4199, Rule 37 claim-then-author pattern (claim shipped in #13607). Static, no DB.
export default {
  name: "verify-quicksave-assignment-method-check-constraint",
  run(ctx) {
    ctx.run("node", ["scripts/verify-quicksave-assignment-method-check-constraint.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-quicksave-assignment-method-check-constraint.mjs"]);
  },
};
