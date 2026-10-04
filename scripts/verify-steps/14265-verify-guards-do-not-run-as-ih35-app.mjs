export default {
  // The guard file carries an underscore (verify-guards-do-not-run-as-ih35_app.mjs), which the
  // claim allocator's slug pattern rejects, so this step was reserved under the hyphenated purpose
  // and points at the real filename. It is the guard that proves no guard reads production masked as
  // ih35_app — and until now it was itself unwired, so the check on the checkers never ran.
  name: "verify:guards-do-not-run-as-ih35-app",
  run(ctx) {
    ctx.run("node", ["scripts/verify-guards-do-not-run-as-ih35_app.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-guards-do-not-run-as-ih35_app.mjs"]);
  },
};
