export default {
  name: "verify:no-leak-test-pollution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-leak-test-pollution.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-leak-test-pollution.mjs"]);
  },
};
