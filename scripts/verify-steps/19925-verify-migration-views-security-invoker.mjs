export default {
  name: "verify:verify-migration-views-security-invoker",
  run(ctx) {
    ctx.run("node", ["scripts/verify-migration-views-security-invoker.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-migration-views-security-invoker.mjs"]);
  },
};
