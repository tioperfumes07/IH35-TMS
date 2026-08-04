<<<<<<<< HEAD:scripts/verify-steps/2372-verify-wire-07-actual-departure-stamp.mjs
// CLS-DISP-WIRE-07 — office/bulk/mdata delivery must stamp actual_departure_at (step 2372).
========
// CLS-DISP-WIRE-07 — office/bulk/mdata delivery must stamp actual_departure_at (step 2370).
>>>>>>>> 497f1b58b (FIX: pre-push static guard failures (lst-picker selftest + module manifest + duplicate verify-step number)):scripts/verify-steps/2370-verify-wire-07-actual-departure-stamp.mjs
export default {
  name: "verify:wire-07-actual-departure-stamp",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-wire-07-actual-departure-stamp.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-wire-07-actual-departure-stamp.mjs"]);
  },
};
