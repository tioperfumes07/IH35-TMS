// verify-steps wrapper for scripts/verify-usmca-posting-on-qbo-off.mjs
// (WIRE-FIRST SPRINT USMCA-ENTITY-LAW, verify-step 3181). Static, no DB — same shape as
// verify-steps/3177-*.mjs and siblings.
export default {
  name: "verify-usmca-posting-on-qbo-off",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-posting-on-qbo-off.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-usmca-posting-on-qbo-off.mjs"]);
  },
};
