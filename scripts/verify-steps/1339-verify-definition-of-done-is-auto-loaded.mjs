export default {
  name: "verify:definition-of-done-is-auto-loaded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-definition-of-done-is-auto-loaded.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-definition-of-done-is-auto-loaded.mjs"]);
  },
};
