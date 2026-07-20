export default {
  name: "verify:compliance-routes-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-compliance-routes-mounted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-compliance-routes-mounted.mjs"]);
  },
};
