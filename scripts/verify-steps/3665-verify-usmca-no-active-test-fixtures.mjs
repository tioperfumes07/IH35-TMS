export default {
  name: "verify:usmca-no-active-test-fixtures",
  run(ctx) {
    ctx.run("node", ["scripts/verify-usmca-no-active-test-fixtures.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-usmca-no-active-test-fixtures.mjs"]);
  },
};
