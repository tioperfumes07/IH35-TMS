export default {
  name: "verify:no-test-units-in-prod",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-test-units-in-prod.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-test-units-in-prod.mjs"]);
  },
};
