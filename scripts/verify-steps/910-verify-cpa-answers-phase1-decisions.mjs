export default {
  name: "verify-cpa-answers-phase1-decisions",
  run(ctx) {
    // Fail closed: verify-steps/_context.mjs currently returns status codes without throwing.
    // A nonzero child exit must terminate the step (Rule 18). AST wiring still sees both ctx.run calls.
    if (ctx.run("node", ["scripts/verify-cpa-answers-phase1-decisions.mjs"]) !== 0) {
      process.exit(1);
    }
    if (ctx.run("node", ["scripts/verify-cpa-answers-phase1-decisions.mjs", "--selftest"]) !== 0) {
      process.exit(1);
    }
  },
};
