export default {
  name: "verify:customers-open-balance-excludes-void",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-open-balance-excludes-void.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-open-balance-excludes-void.mjs"]);
  },
};
