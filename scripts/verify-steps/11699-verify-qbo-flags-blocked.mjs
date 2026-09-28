export default {
  name: "verify:qbo-flags-blocked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-flags-blocked.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-qbo-flags-blocked.mjs"]);
  },
};
